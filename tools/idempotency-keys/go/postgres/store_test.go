package postgres_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"
)

var errDown = errors.New("postgres is down")

const (
	fingerprint = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"
	identity    = "1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a"
	other       = "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f"
)

// pool is shared by the package's tests, which TestMain opens and closes.
var pool *pgxpool.Pool //nolint:gochecknoglobals // TestMain owns it, for every test of the package

func TestMain(m *testing.M) {
	var err error

	pool, err = pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}

	code := m.Run()

	pool.Close()
	os.Exit(code)
}

func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + hex.EncodeToString(id[:])
}

// newTable creates a table of its own for a test, dropped once it ends.
func newTable(t *testing.T) string {
	t.Helper()

	table := uniqueName("idempotency_keys_test_")

	create, err := postgres.CreateTableSQL(postgres.StoreOptions{Table: table})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(t.Context(), create); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "DROP TABLE "+pgx.Identifier{table}.Sanitize())
	})

	return table
}

func newTestStore(t *testing.T) *postgres.Store {
	t.Helper()

	return newStore(t, pool, newTable(t))
}

func newStore(t *testing.T, db postgres.Querier, table string) *postgres.Store {
	t.Helper()

	store, err := postgres.NewStore(db, postgres.StoreOptions{Table: table})
	if err != nil {
		t.Fatal(err)
	}

	return store
}

func claimParams(fingerprint, token string, lease time.Duration) idempotencykeys.ClaimParams {
	return idempotencykeys.ClaimParams{
		Identity:    identity,
		Fingerprint: fingerprint,
		Token:       token,
		Lease:       lease,
		TTL:         time.Hour,
	}
}

func claimed() idempotencykeys.ClaimResult {
	return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}
}

func expectClaim(t *testing.T, store *postgres.Store, params idempotencykeys.ClaimParams, want idempotencykeys.ClaimResult) {
	t.Helper()

	if got := claim(t, store, params); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

// expectChanged checks the result of a complete or release.
func expectChanged(t *testing.T, what string, want bool) func(changed bool, err error) {
	t.Helper()

	return func(changed bool, err error) {
		t.Helper()

		if err != nil || changed != want {
			t.Fatalf("%s: got %v, %v; want %v", what, changed, err, want)
		}
	}
}

func claim(t *testing.T, store *postgres.Store, params idempotencykeys.ClaimParams) idempotencykeys.ClaimResult {
	t.Helper()

	result, err := store.Claim(t.Context(), params)
	if err != nil {
		t.Fatal(err)
	}

	return result
}

// failingDB fails every statement.
type failingDB struct{}

func (failingDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errDown
}

func (failingDB) QueryRow(context.Context, string, ...any) pgx.Row { //nolint:ireturn // As the interface it implements
	return failingRow{}
}

type failingRow struct{}

func (failingRow) Scan(...any) error {
	return errDown
}

// hookedDB runs a hook before each read, then the read on a real connection.
type hookedDB struct {
	postgres.Querier

	beforeRead func(ctx context.Context)
}

func (db hookedDB) QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row { //nolint:ireturn // As the interface it implements
	if strings.HasPrefix(sql, "SELECT") {
		db.beforeRead(ctx)
	}

	return db.Querier.QueryRow(ctx, sql, arguments...)
}

func TestStoreClaimsRunsAndCompletesARecord(t *testing.T) {
	t.Parallel()

	store := newTestStore(t)
	running := idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimRunning, Fingerprint: fingerprint}

	expectClaim(t, store, claimParams(fingerprint, "t1", time.Minute), claimed())
	expectClaim(t, store, claimParams(fingerprint, "t2", time.Minute), running)
	expectClaim(t, store, claimParams(other, "t2", time.Minute), running)

	response := idempotencykeys.StoredResponse{
		Headers: [][2]string{{"content-type", "application/octet-stream"}, {"x-name", "caf\xe9"}},
		Body:    []byte{0x00, 0xff, 0xfe, 'a'},
		Status:  201,
	}

	expectChanged(t, "completed with another token", false)(store.Complete(t.Context(), identity, "t2", response))
	expectChanged(t, "completed", true)(store.Complete(t.Context(), identity, "t1", response))
	expectClaim(t, store, claimParams(other, "t3", time.Minute), idempotencykeys.ClaimResult{
		Response:    &response,
		State:       idempotencykeys.ClaimCompleted,
		Fingerprint: fingerprint,
	})
	expectChanged(t, "released a completed record", false)(store.Release(t.Context(), identity, "t1"))
}

func TestStoreReleasesOnlyWithTheToken(t *testing.T) {
	t.Parallel()

	store := newTestStore(t)
	claim(t, store, claimParams(fingerprint, "t1", time.Minute))

	if released, err := store.Release(t.Context(), identity, "t2"); err != nil || released {
		t.Fatalf("got %v, %v", released, err)
	}

	if released, err := store.Release(t.Context(), identity, "t1"); err != nil || !released {
		t.Fatalf("got %v, %v", released, err)
	}

	if result := claim(t, store, claimParams(other, "t3", time.Minute)); result.State != idempotencykeys.ClaimClaimed {
		t.Fatalf("got %+v", result)
	}
}

func TestStoreTakesOverALeaseThatRanOutOnlyWithTheSameFingerprint(t *testing.T) {
	t.Parallel()

	store := newTestStore(t)
	claim(t, store, claimParams(fingerprint, "t1", 50*time.Millisecond))
	time.Sleep(100 * time.Millisecond)

	if result := claim(t, store, claimParams(other, "t2", time.Minute)); result.State != idempotencykeys.ClaimRunning {
		t.Fatalf("got %+v", result)
	}

	if result := claim(t, store, claimParams(fingerprint, "t3", time.Minute)); result.State != idempotencykeys.ClaimClaimed {
		t.Fatalf("got %+v", result)
	}

	if done, err := store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}); err != nil || done {
		t.Fatalf("the late holder completed: %v, %v", done, err)
	}
}

func TestStoreForgetsAnExpiredKeyAndDeletesIt(t *testing.T) {
	t.Parallel()

	store := newTestStore(t)
	expiring := claimParams(fingerprint, "t1", 50*time.Millisecond)
	expiring.TTL = 100 * time.Millisecond
	claim(t, store, expiring)
	time.Sleep(150 * time.Millisecond)

	if done, err := store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}); err != nil || done {
		t.Fatalf("completed an expired key: %v, %v", done, err)
	}

	if deleted, err := store.DeleteExpired(t.Context()); err != nil || deleted != 1 {
		t.Fatalf("got %d, %v", deleted, err)
	}

	if result := claim(t, store, claimParams(other, "t2", time.Minute)); result.State != idempotencykeys.ClaimClaimed {
		t.Fatalf("got %+v", result)
	}

	if deleted, err := store.DeleteExpired(t.Context()); err != nil || deleted != 0 {
		t.Fatalf("got %d, %v", deleted, err)
	}
}

func TestStoreClaimsAgainWhenTheRecordGoesBetweenTheClaimAndTheRead(t *testing.T) {
	t.Parallel()

	table := newTable(t)
	store := newStore(t, pool, table)
	claim(t, store, claimParams(fingerprint, "t1", time.Minute))

	reads := 0
	racing := newStore(t, hookedDB{Querier: pool, beforeRead: func(ctx context.Context) {
		reads++
		if reads == 1 {
			if _, err := store.Release(ctx, identity, "t1"); err != nil {
				t.Error(err)
			}
		}
	}}, table)

	if result := claim(t, racing, claimParams(other, "t2", time.Minute)); result.State != idempotencykeys.ClaimClaimed || reads != 1 {
		t.Fatalf("got %+v after %d reads", result, reads)
	}
}

func TestStoreReadsACompletedRowWrittenWithoutABody(t *testing.T) {
	t.Parallel()

	table := newTable(t)
	store := newStore(t, pool, table)
	claim(t, store, claimParams(fingerprint, "t1", time.Minute))

	if _, err := pool.Exec(t.Context(), "UPDATE "+pgx.Identifier{table}.Sanitize()+` SET status = 204, headers = '[]', token = NULL`); err != nil {
		t.Fatal(err)
	}

	result := claim(t, store, claimParams(fingerprint, "t2", time.Minute))
	if result.State != idempotencykeys.ClaimCompleted || result.Response.Body == nil || len(result.Response.Body) != 0 {
		t.Fatalf("got %+v", result)
	}
}

func TestStoreRejectsHeadersNoImplementationWrites(t *testing.T) {
	t.Parallel()

	table := newTable(t)
	store := newStore(t, pool, table)
	claim(t, store, claimParams(fingerprint, "t1", time.Minute))

	if _, err := pool.Exec(t.Context(), "UPDATE "+pgx.Identifier{table}.Sanitize()+` SET status = 200, headers = '{"a":1}', body = ''`); err != nil {
		t.Fatal(err)
	}

	if _, err := store.Claim(t.Context(), claimParams(fingerprint, "t2", time.Minute)); !errors.Is(err, idempotencykeys.ErrStoredRecord) {
		t.Fatalf("got %v", err)
	}
}

func TestStoreFailsWhenPostgresDoes(t *testing.T) {
	t.Parallel()

	store := newStore(t, failingDB{}, "")
	response := idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}

	_, claimErr := store.Claim(t.Context(), claimParams(fingerprint, "t1", time.Minute))
	_, completeErr := store.Complete(t.Context(), identity, "t1", response)
	_, releaseErr := store.Release(t.Context(), identity, "t1")
	_, deleteErr := store.DeleteExpired(t.Context())

	// A claim that returns no row, then a read that fails
	table := newTable(t)
	claim(t, newStore(t, pool, table), claimParams(fingerprint, "t1", time.Minute))
	_, readErr := newStore(t, readFailingDB{Querier: pool}, table).Claim(
		t.Context(), claimParams(fingerprint, "t2", time.Minute),
	)

	for _, err := range []error{claimErr, completeErr, releaseErr, deleteErr, readErr} {
		if !errors.Is(err, errDown) {
			t.Errorf("got %v", err)
		}
	}
}

func TestStoreRejectsAnIdentityOrFingerprintThatIsntHex(t *testing.T) {
	t.Parallel()

	store := newTestStore(t)
	response := idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}

	badIdentity := claimParams(fingerprint, "t1", time.Minute)
	badIdentity.Identity = "zz"
	_, identityErr := store.Claim(t.Context(), badIdentity)
	_, fingerprintErr := store.Claim(t.Context(), claimParams("zz", "t1", time.Minute))
	_, completeErr := store.Complete(t.Context(), "zz", "t1", response)
	_, releaseErr := store.Release(t.Context(), "zz", "t1")

	for _, err := range []error{identityErr, fingerprintErr, completeErr, releaseErr} {
		if err == nil || !strings.Contains(err.Error(), `"zz"`) {
			t.Errorf("got %v", err)
		}
	}
}

// readFailingDB claims on a real connection, and fails every read.
type readFailingDB struct {
	postgres.Querier
}

func (db readFailingDB) QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row { //nolint:ireturn // As the interface it implements
	if strings.HasPrefix(sql, "SELECT") {
		return failingRow{}
	}

	return db.Querier.QueryRow(ctx, sql, arguments...)
}

func TestNewStore(t *testing.T) {
	t.Parallel()

	if _, err := postgres.NewStore(failingDB{}, postgres.StoreOptions{Table: strings.Repeat("t", 64)}); !errors.Is(err, idempotencykeys.ErrOption) {
		t.Fatalf("got %v", err)
	}

	if _, err := postgres.NewStore(failingDB{}, postgres.StoreOptions{Table: strings.Repeat("t", 63)}); err != nil {
		t.Fatal(err)
	}

	if _, err := postgres.CreateTableSQL(postgres.StoreOptions{Table: strings.Repeat("t", 64)}); !errors.Is(err, idempotencykeys.ErrOption) {
		t.Fatalf("got %v", err)
	}
}
