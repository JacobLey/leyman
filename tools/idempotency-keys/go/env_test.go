package idempotencykeys_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/valkey-io/valkey-go"

	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"
	valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"
)

// The services run as devcontainer sidecars, and Dagger binds them under the same names.
const (
	valkeyAddress  = "valkey:6379"
	valkeyDatabase = 6
)

// env is one connection pool and one Valkey client for the package's tests, which each use a table, key prefix and
// channel of their own.
type env struct {
	pool   *pgxpool.Pool
	valkey valkey.Client
}

// testEnv is shared by the package's tests, which TestMain opens and closes.
var testEnv env //nolint:gochecknoglobals // TestMain owns it, for every test of the package

func TestMain(m *testing.M) {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}

	client, err := valkey.NewClient(valkey.ClientOption{ //nolint:exhaustruct_v5 // Options left out are the defaults
		InitAddress: []string{valkeyAddress},
		SelectDB:    valkeyDatabase,
	})
	if err != nil {
		panic(err)
	}

	testEnv = env{pool: pool, valkey: client}
	code := m.Run()

	client.Close()
	pool.Close()
	os.Exit(code)
}

// uniqueName is a name no other test uses, for a table, key prefix or channel.
func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + hex.EncodeToString(id[:])
}

// postgresStore is a Postgres store on a table of its own, dropped once the test ends.
func (e env) postgresStore(t *testing.T) *postgres.Store {
	t.Helper()

	options := postgres.StoreOptions{Table: uniqueName("idempotency_keys_test_")}

	create, err := postgres.CreateTableSQL(options)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := e.pool.Exec(t.Context(), create); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		_, _ = e.pool.Exec(context.Background(), "DROP TABLE "+pgx.Identifier{options.Table}.Sanitize())
	})

	store, err := postgres.NewStore(e.pool, options)
	if err != nil {
		t.Fatal(err)
	}

	return store
}

// postgresNotifier listens on a connection and channel of its own, closed once the test ends.
func (e env) postgresNotifier(t *testing.T) *postgres.Notifier {
	t.Helper()

	conn, err := pgx.Connect(t.Context(), os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}

	notifier, err := postgres.Listen(t.Context(), e.pool, conn, postgres.NotifierOptions{
		OnError: func(err error) { t.Error(err) },
		Channel: uniqueName("idempotency_keys_"),
	})
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		if err := notifier.Close(context.Background()); err != nil {
			t.Error(err)
		}

		_ = conn.Close(context.Background())
	})

	return notifier
}

// valkeyStore is a Valkey store on a key prefix of its own.
func (e env) valkeyStore() *valkeystore.Store {
	return valkeystore.NewStore(e.valkey, valkeystore.StoreOptions{Prefix: uniqueName("idempotency-keys-test:")})
}

// valkeyNotifier subscribes to a channel of its own, closed once the test ends.
func (e env) valkeyNotifier(t *testing.T) *valkeystore.Notifier {
	t.Helper()

	notifier, err := valkeystore.Listen(t.Context(), e.valkey, valkeystore.NotifierOptions{
		OnError: func(err error) { t.Error(err) },
		Channel: uniqueName("idempotency_keys_"),
	})
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(notifier.Close)

	return notifier
}
