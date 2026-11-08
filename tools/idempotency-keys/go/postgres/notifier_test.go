package postgres_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"
)

func connect(t *testing.T) *pgx.Conn {
	t.Helper()

	conn, err := pgx.Connect(t.Context(), os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = conn.Close(context.Background()) })

	return conn
}

// unlistenFailing fails to UNLISTEN, and runs everything else on a real connection.
type unlistenFailing struct {
	postgres.ListenConn
}

func (conn unlistenFailing) Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
	if strings.HasPrefix(sql, "UNLISTEN") {
		return pgconn.CommandTag{}, errDown
	}

	return conn.ListenConn.Exec(ctx, sql, arguments...) //nolint:wrapcheck // The connection's errors, as they are
}

// listenFailing fails every statement.
type listenFailing struct {
	postgres.ListenConn
}

func (listenFailing) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errDown
}

func wake(t *testing.T, notifier *postgres.Notifier, identity string) <-chan struct{} {
	t.Helper()

	woken := make(chan struct{}, 1)

	t.Cleanup(notifier.Subscribe(identity, func() {
		select {
		case woken <- struct{}{}:
		default:
		}
	}))

	return woken
}

func expectWoken(t *testing.T, woken <-chan struct{}) {
	t.Helper()

	select {
	case <-woken:
	case <-time.After(5 * time.Second):
		t.Fatal("not woken")
	}
}

func TestNotifierWakesTheListenersOfAnIdentityItHears(t *testing.T) {
	t.Parallel()

	conn := connect(t)
	// The connection is the caller's, who may listen on more channels
	if _, err := conn.Exec(t.Context(), "LISTEN other_channel"); err != nil {
		t.Fatal(err)
	}

	notifier, err := postgres.Listen(t.Context(), pool, conn, postgres.NotifierOptions{OnError: nil, Channel: ""})
	if err != nil {
		t.Fatal(err)
	}

	identity := uniqueName("identity_")
	woken := wake(t, notifier, identity)

	if _, err := pool.Exec(t.Context(), "SELECT pg_notify('other_channel', $1)", identity); err != nil {
		t.Fatal(err)
	}

	if err := notifier.Publish(t.Context(), identity); err != nil {
		t.Fatal(err)
	}

	expectWoken(t, woken)

	// Only by the channel's notification
	select {
	case <-woken:
		t.Fatal("woken twice")
	case <-time.After(100 * time.Millisecond):
	}

	if err := notifier.Close(t.Context()); err != nil {
		t.Fatal(err)
	}

	// Closing again does nothing, and the connection is free
	if err := notifier.Close(t.Context()); err != nil {
		t.Fatal(err)
	}

	if _, err := conn.Exec(t.Context(), "SELECT 1"); err != nil {
		t.Fatal(err)
	}
}

func TestNotifierReportsADroppedConnectionAndCloses(t *testing.T) {
	t.Parallel()

	conn := connect(t)
	failures := make(chan error, 1)

	notifier, err := postgres.Listen(t.Context(), pool, conn, postgres.NotifierOptions{
		OnError: func(err error) { failures <- err },
		Channel: uniqueName("Channel_"),
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(t.Context(), "SELECT pg_terminate_backend($1)", conn.PgConn().PID()); err != nil {
		t.Fatal(err)
	}

	select {
	case err := <-failures:
		if !strings.Contains(err.Error(), "Postgres listen") {
			t.Fatalf("got %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("not reported")
	}

	if err := notifier.Close(t.Context()); err != nil {
		t.Fatal(err)
	}
}

func TestNotifierFailsToCloseWhenUNLISTENFails(t *testing.T) {
	t.Parallel()

	notifier, err := postgres.Listen(t.Context(), pool, unlistenFailing{ListenConn: connect(t)}, postgres.NotifierOptions{
		OnError: func(err error) { t.Error(err) },
		Channel: uniqueName("channel_"),
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := notifier.Close(t.Context()); !errors.Is(err, errDown) {
		t.Fatalf("got %v", err)
	}
}

func TestNotifierFailsWhenLISTENFailsOrTheChannelIsTooLong(t *testing.T) {
	t.Parallel()

	if _, err := postgres.Listen(t.Context(), pool, listenFailing{ListenConn: nil}, postgres.NotifierOptions{OnError: nil, Channel: ""}); !errors.Is(err, errDown) {
		t.Fatalf("got %v", err)
	}

	if _, err := postgres.Listen(t.Context(), pool, listenFailing{ListenConn: nil}, postgres.NotifierOptions{
		OnError: nil,
		Channel: strings.Repeat("c", 64),
	}); !errors.Is(err, idempotencykeys.ErrOption) {
		t.Fatalf("got %v", err)
	}
}

func TestNotifierFailsToPublishWhenPostgresDoes(t *testing.T) {
	t.Parallel()

	notifier, err := postgres.Listen(t.Context(), failingDB{}, connect(t), postgres.NotifierOptions{OnError: nil, Channel: uniqueName("channel_")})
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = notifier.Close(context.Background()) })

	if err := notifier.Publish(t.Context(), "identity"); !errors.Is(err, errDown) {
		t.Fatalf("got %v", err)
	}
}
