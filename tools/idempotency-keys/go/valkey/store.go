// Package valkey holds the spec's Valkey (or Redis) store and pub/sub notifier, on valkey-go
// (https://github.com/valkey-io/valkey-go).
package valkey

import (
	"context"
	"fmt"
	"strconv"

	"github.com/valkey-io/valkey-go"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/wire"
)

const defaultName = "idempotency_keys"

// Client is what the store needs from a valkey-go client. A [valkey.Client] fits as is.
type Client interface {
	B() valkey.Builder
	Do(ctx context.Context, cmd valkey.Completed) valkey.ValkeyResult
}

// StoreOptions configure [NewStore].
type StoreOptions struct {
	// Prefix starts every key, <prefix>:<identity>. "idempotency_keys" when empty.
	Prefix string
}

// Store is the lax store: a claim is a key with a time to live, so a failover that loses writes, or a flush, forgets
// keys, and a request after that runs again. For deduplicating notifications or non-financial creates, never
// payments. Each operation is one of the spec's Lua scripts, sent with EVAL on the record's one key, so a record lives
// on one node of a cluster.
type Store struct {
	client Client
	prefix string
}

var _ idempotencykeys.Store = (*Store)(nil)

// NewStore is the Valkey store on a client, which it never closes.
func NewStore(client Client, options StoreOptions) *Store {
	prefix := options.Prefix
	if prefix == "" {
		prefix = defaultName
	}

	return &Store{client: client, prefix: prefix}
}

// claimResult reads the claim script's reply.
func claimResult(reply []string) (idempotencykeys.ClaimResult, error) {
	switch {
	case len(reply) == 1 && reply[0] == string(idempotencykeys.ClaimClaimed):
		return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}, nil
	case len(reply) == 2 && reply[0] == string(idempotencykeys.ClaimRunning):
		return idempotencykeys.ClaimResult{
			Response:    nil,
			State:       idempotencykeys.ClaimRunning,
			Fingerprint: reply[1],
		}, nil
	case len(reply) == 5 && reply[0] == string(idempotencykeys.ClaimCompleted):
		status, err := strconv.Atoi(reply[2])
		if err != nil {
			return idempotencykeys.ClaimResult{}, replyError(reply, "the status is not a number")
		}

		headers, err := wire.DecodeHeaders([]byte(reply[3]))
		if err != nil {
			return idempotencykeys.ClaimResult{}, fmt.Errorf("idempotency-keys: Valkey claim: %w", err)
		}

		return idempotencykeys.ClaimResult{
			Response:    &idempotencykeys.StoredResponse{Headers: headers, Body: []byte(reply[4]), Status: status},
			State:       idempotencykeys.ClaimCompleted,
			Fingerprint: reply[1],
		}, nil
	default:
		return idempotencykeys.ClaimResult{}, replyError(reply, "not a claim")
	}
}

func replyError(reply any, reason string) error {
	return fmt.Errorf("%w: Valkey replied %q: %s", idempotencykeys.ErrStoredRecord, reply, reason)
}

// Claim runs the claim script. Every reply is read as bytes, so a binary body comes back as it was stored, and the
// error wraps [idempotencykeys.ErrStoredRecord] for a reply that isn't one the script gives.
func (s *Store) Claim(ctx context.Context, params idempotencykeys.ClaimParams) (idempotencykeys.ClaimResult, error) {
	result := s.eval(
		ctx, claimScript, params.Identity,
		params.Fingerprint,
		params.Token,
		strconv.FormatInt(params.Lease.Milliseconds(), 10),
		strconv.FormatInt(params.TTL.Milliseconds(), 10),
	)
	if err := result.Error(); err != nil {
		return idempotencykeys.ClaimResult{}, fmt.Errorf("idempotency-keys: Valkey claim: %w", err)
	}

	reply, err := result.AsStrSlice()
	if err != nil {
		return idempotencykeys.ClaimResult{}, fmt.Errorf("%w: Valkey claim: %w", idempotencykeys.ErrStoredRecord, err)
	}

	return claimResult(reply)
}

// Complete runs the complete script, with the body sent as its bytes.
func (s *Store) Complete(
	ctx context.Context,
	identity, token string,
	response idempotencykeys.StoredResponse,
) (bool, error) {
	return s.changed(s.eval(
		ctx, completeScript, identity,
		token,
		strconv.Itoa(response.Status),
		wire.EncodeHeaders(response.Headers),
		string(response.Body),
	), "complete")
}

// Release runs the release script.
func (s *Store) Release(ctx context.Context, identity, token string) (bool, error) {
	return s.changed(s.eval(ctx, releaseScript, identity, token), "release")
}

// changed reads the 1 or 0 of the complete and release scripts.
func (*Store) changed(result valkey.ValkeyResult, operation string) (bool, error) {
	if err := result.Error(); err != nil {
		return false, fmt.Errorf("idempotency-keys: Valkey %s: %w", operation, err)
	}

	reply, err := result.AsInt64()
	if err != nil {
		return false, fmt.Errorf("%w: Valkey %s: %w", idempotencykeys.ErrStoredRecord, operation, err)
	}

	if reply != 0 && reply != 1 {
		return false, replyError(reply, "not 0 or 1")
	}

	return reply == 1, nil
}

func (s *Store) eval(ctx context.Context, script, identity string, args ...string) valkey.ValkeyResult {
	return s.client.Do(ctx, s.client.B().Eval().Script(script).Numkeys(1).Key(s.prefix+":"+identity).Arg(args...).Build())
}
