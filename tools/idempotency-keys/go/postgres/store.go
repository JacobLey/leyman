// Package postgres holds the spec's Postgres store and LISTEN/NOTIFY notifier, on pgx
// (https://github.com/jackc/pgx). database/sql can't LISTEN, so it takes pgx's types: a *pgxpool.Pool or a *pgx.Conn
// fits each interface as is.
package postgres

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/wire"
)

const (
	defaultName = "idempotency_keys"
	// Postgres's NAMEDATALEN less one.
	maxIdentifierBytes = 63
)

// Execer runs a statement. A *pgxpool.Pool, *pgx.Conn or pgx.Tx fits as is.
type Execer interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// Querier is what the store needs: a statement, and a query of one row. A *pgxpool.Pool, *pgx.Conn or pgx.Tx fits
// as is.
type Querier interface {
	Execer
	QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row
}

// StoreOptions configure [NewStore] and [CreateTableSQL].
type StoreOptions struct {
	// Table is the table's name: one identifier, quoted, so case-exact, of at most 63 bytes. Not schema-qualified: set
	// the connection's search_path for another schema. "idempotency_keys" when empty.
	Table string
}

// quoteIdentifier quotes a Postgres identifier (a table or channel name), so any name works as given, case included.
// The error is an [*idempotencykeys.OptionError] for a name over 63 bytes, which Postgres would silently cut down
// to name another table or channel.
func quoteIdentifier(option, name string) (string, error) {
	if name == "" {
		name = defaultName
	}

	if len(name) > maxIdentifierBytes {
		return "", &idempotencykeys.OptionError{
			Value:  name,
			Option: option,
			Reason: fmt.Sprintf("must be at most %d bytes", maxIdentifierBytes),
		}
	}

	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`, nil
}

// CreateTableSQL is the CREATE TABLE statement of the spec's table, for a migration.
func CreateTableSQL(options StoreOptions) (string, error) {
	table, err := quoteIdentifier("table", options.Table)
	if err != nil {
		return "", err
	}

	return `CREATE TABLE ` + table + ` (
    identity bytea PRIMARY KEY,
    fingerprint bytea NOT NULL,
    token text,
    lease_expires_at timestamptz,
    expires_at timestamptz NOT NULL,
    status smallint,
    headers jsonb,
    body bytea
);
`, nil
}

// Store is the strict store: a claim is a row written in a transaction, so it is exclusive and durable. Every time is
// clock_timestamp(), the statement's own, never now(), which a connection inside a long transaction would see frozen
// at its start. Postgres never deletes expired rows on its own: run [Store.DeleteExpired] from a scheduled job, or
// leave them to be overwritten by the next claim. The statements are the spec's, in its "Postgres" section.
type Store struct {
	db          Querier
	claimSQL    string
	readSQL     string
	completeSQL string
	releaseSQL  string
	expiredSQL  string
}

var _ idempotencykeys.Store = (*Store)(nil)

// NewStore is the Postgres store on a connection, usually a pool, which it never closes. The error is an
// [*idempotencykeys.OptionError] for a table name over 63 bytes.
func NewStore(conn Querier, options StoreOptions) (*Store, error) {
	table, err := quoteIdentifier("table", options.Table)
	if err != nil {
		return nil, err
	}

	return &Store{
		db: conn,
		claimSQL: `INSERT INTO ` + table + ` (identity, fingerprint, token, lease_expires_at, expires_at)
VALUES ($1, $2, $3, clock_timestamp() + $4 * interval '1 millisecond', clock_timestamp() + $5 * interval '1 millisecond')
ON CONFLICT (identity) DO UPDATE
    SET fingerprint = excluded.fingerprint, token = excluded.token,
        lease_expires_at = excluded.lease_expires_at, expires_at = excluded.expires_at,
        status = NULL, headers = NULL, body = NULL
    WHERE ` + table + `.expires_at <= clock_timestamp()
       OR (` + table + `.lease_expires_at <= clock_timestamp() AND ` + table + `.fingerprint = excluded.fingerprint)
RETURNING token`,
		readSQL: `SELECT fingerprint, status, headers, body FROM ` + table + `
WHERE identity = $1 AND expires_at > clock_timestamp()`,
		completeSQL: `UPDATE ` + table + ` SET status = $3, headers = $4, body = $5, token = NULL, lease_expires_at = NULL
WHERE identity = $1 AND token = $2 AND expires_at > clock_timestamp()`,
		releaseSQL: `DELETE FROM ` + table + ` WHERE identity = $1 AND token = $2`,
		expiredSQL: `DELETE FROM ` + table + ` WHERE expires_at <= clock_timestamp()`,
	}, nil
}

func digest(name, value string) ([]byte, error) {
	bytes, err := hex.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("idempotency-keys: %s %q: %w", name, value, err)
	}

	return bytes, nil
}

// Claim claims the record in one statement, or reads it when the claim returns no row, and claims again if the read
// finds none (it was released or expired in between).
func (s *Store) Claim(ctx context.Context, params idempotencykeys.ClaimParams) (idempotencykeys.ClaimResult, error) {
	identity, err := digest("identity", params.Identity)
	if err != nil {
		return idempotencykeys.ClaimResult{}, err
	}

	fingerprint, err := digest("fingerprint", params.Fingerprint)
	if err != nil {
		return idempotencykeys.ClaimResult{}, err
	}

	for {
		var token string

		err := s.db.QueryRow(
			ctx, s.claimSQL, identity, fingerprint, params.Token, params.Lease.Milliseconds(), params.TTL.Milliseconds(),
		).Scan(&token)
		if err == nil {
			return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}, nil
		}

		if !errors.Is(err, pgx.ErrNoRows) {
			return idempotencykeys.ClaimResult{}, fmt.Errorf("idempotency-keys: Postgres claim: %w", err)
		}

		result, found, err := s.read(ctx, identity)
		if err != nil || found {
			return result, err
		}
	}
}

// Complete stores the response if the row still holds the token and the key hasn't expired.
func (s *Store) Complete(
	ctx context.Context,
	identity, token string,
	response idempotencykeys.StoredResponse,
) (bool, error) {
	record, err := digest("identity", identity)
	if err != nil {
		return false, err
	}

	body := response.Body
	if body == nil {
		// pgx sends a nil slice as NULL
		body = []byte{}
	}

	tag, err := s.db.Exec(ctx, s.completeSQL, record, token, response.Status, wire.EncodeHeaders(response.Headers), body)
	if err != nil {
		return false, fmt.Errorf("idempotency-keys: Postgres complete: %w", err)
	}

	return tag.RowsAffected() == 1, nil
}

// Release deletes the row if it still holds the token.
func (s *Store) Release(ctx context.Context, identity, token string) (bool, error) {
	record, err := digest("identity", identity)
	if err != nil {
		return false, err
	}

	tag, err := s.db.Exec(ctx, s.releaseSQL, record, token)
	if err != nil {
		return false, fmt.Errorf("idempotency-keys: Postgres release: %w", err)
	}

	return tag.RowsAffected() == 1, nil
}

// DeleteExpired deletes every expired row, for a scheduled job, and returns how many it deleted.
func (s *Store) DeleteExpired(ctx context.Context) (int64, error) {
	tag, err := s.db.Exec(ctx, s.expiredSQL)
	if err != nil {
		return 0, fmt.Errorf("idempotency-keys: Postgres delete expired: %w", err)
	}

	return tag.RowsAffected(), nil
}

// read reads the record a claim found, and whether it found one.
func (s *Store) read(ctx context.Context, identity []byte) (idempotencykeys.ClaimResult, bool, error) {
	var (
		fingerprint, headers, body []byte
		status                     *int
	)

	err := s.db.QueryRow(ctx, s.readSQL, identity).Scan(&fingerprint, &status, &headers, &body)
	if errors.Is(err, pgx.ErrNoRows) {
		return idempotencykeys.ClaimResult{Response: nil, State: "", Fingerprint: ""}, false, nil
	}

	if err != nil {
		return idempotencykeys.ClaimResult{}, false, fmt.Errorf("idempotency-keys: Postgres read: %w", err)
	}

	if status == nil {
		return idempotencykeys.ClaimResult{
			Response:    nil,
			State:       idempotencykeys.ClaimRunning,
			Fingerprint: hex.EncodeToString(fingerprint),
		}, true, nil
	}

	decoded, err := wire.DecodeHeaders(headers)
	if err != nil {
		return idempotencykeys.ClaimResult{}, false, fmt.Errorf("idempotency-keys: Postgres read: %w", err)
	}

	if body == nil {
		body = []byte{}
	}

	return idempotencykeys.ClaimResult{
		Response:    &idempotencykeys.StoredResponse{Headers: decoded, Body: body, Status: *status},
		State:       idempotencykeys.ClaimCompleted,
		Fingerprint: hex.EncodeToString(fingerprint),
	}, true, nil
}
