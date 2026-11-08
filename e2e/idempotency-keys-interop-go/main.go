// Command idempotency-keys-interop-go serves one route on the Go implementation of idempotency-keys, for the interop
// e2e (e2e/idempotency-keys-interop), which drives it against the same server on the TypeScript implementation.
//
// Its configuration comes from the environment, as the TypeScript server's does:
//
//	IK_STORE      postgres | valkey
//	IK_NOTIFIER   none | postgres | valkey
//	IK_TABLE      the Postgres store's table
//	IK_PREFIX     the Valkey store's key prefix
//	IK_CHANNEL    the notifier's channel
//	IK_LEASE_MS   the lease, in milliseconds
//	IK_WAIT_MS    the wait, in milliseconds
//	DATABASE_URL  Postgres, for its store or notifier
//	VALKEY_URL    Valkey, for its store or notifier (redis://host:port/db)
//
// It listens on a free port of 127.0.0.1, and prints "listening <port>" once it is ready. Every path and method runs
// the same handler, behind the middleware, with the scope from the x-scope header and the operation "interop". The
// handler prints "run <scope>" as it starts, sleeps for the x-delay-ms header's milliseconds, and answers with the
// x-status header's status (201 by default) and {"server":"go","run":<n>}, n counting the handler's runs for the
// scope in this process. Neither header is part of the fingerprint, so a retry can ask for another status.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/valkey-io/valkey-go"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"
	valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"
)

const (
	operation      = "interop"
	defaultStatus  = http.StatusCreated
	maxPoolConns   = 3
	readTimeout    = 10 * time.Second
	choiceNone     = "none"
	choicePostgres = "postgres"
	choiceValkey   = "valkey"
)

var errConfig = errors.New("invalid configuration")

func main() {
	if err := serve(context.Background(), os.Getenv, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// connections opens each service once, whether the store, the notifier or both use it.
type connections struct {
	getenv func(string) string
	pool   *pgxpool.Pool
	valkey valkey.Client
}

func (c *connections) postgres(ctx context.Context) (*pgxpool.Pool, error) {
	if c.pool != nil {
		return c.pool, nil
	}

	config, err := pgxpool.ParseConfig(c.getenv("DATABASE_URL"))
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL: %w", err)
	}
	// Small, as every test of the e2e shares the server's max_connections
	config.MaxConns = maxPoolConns

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("connecting to Postgres: %w", err)
	}

	c.pool = pool

	return pool, nil
}

//nolint:ireturn // valkey-go's client is an interface
func (c *connections) valkeyClient() (valkey.Client, error) {
	if c.valkey != nil {
		return c.valkey, nil
	}

	option, err := valkey.ParseURL(c.getenv("VALKEY_URL"))
	if err != nil {
		return nil, fmt.Errorf("VALKEY_URL: %w", err)
	}

	client, err := valkey.NewClient(option)
	if err != nil {
		return nil, fmt.Errorf("connecting to Valkey: %w", err)
	}

	c.valkey = client

	return client, nil
}

//nolint:ireturn // Either store, as configured
func (c *connections) store(ctx context.Context) (idempotencykeys.Store, error) {
	switch kind := c.getenv("IK_STORE"); kind {
	case choicePostgres:
		pool, err := c.postgres(ctx)
		if err != nil {
			return nil, err
		}

		store, err := postgres.NewStore(pool, postgres.StoreOptions{Table: c.getenv("IK_TABLE")})
		if err != nil {
			return nil, fmt.Errorf("postgres store: %w", err)
		}

		return store, nil
	case choiceValkey:
		client, err := c.valkeyClient()
		if err != nil {
			return nil, err
		}

		return valkeystore.NewStore(client, valkeystore.StoreOptions{Prefix: c.getenv("IK_PREFIX")}), nil
	default:
		return nil, fmt.Errorf("%w: IK_STORE %q", errConfig, kind)
	}
}

// notifier is the configured notifier, or nil for none.
//
//nolint:ireturn // Either notifier, as configured
func (c *connections) notifier(ctx context.Context) (idempotencykeys.Notifier, error) {
	channel := c.getenv("IK_CHANNEL")

	switch kind := c.getenv("IK_NOTIFIER"); kind {
	case choiceNone:
		return nil, nil //nolint:nilnil // No notifier is a valid choice: waiting requests only poll
	case choicePostgres:
		pool, err := c.postgres(ctx)
		if err != nil {
			return nil, err
		}

		listener, err := pgx.Connect(ctx, c.getenv("DATABASE_URL"))
		if err != nil {
			return nil, fmt.Errorf("connecting the listener: %w", err)
		}

		notifier, err := postgres.Listen(ctx, pool, listener, postgres.NotifierOptions{OnError: nil, Channel: channel})
		if err != nil {
			return nil, fmt.Errorf("postgres notifier: %w", err)
		}

		return notifier, nil
	case choiceValkey:
		client, err := c.valkeyClient()
		if err != nil {
			return nil, err
		}

		notifier, err := valkeystore.Listen(ctx, client, valkeystore.NotifierOptions{OnError: nil, Channel: channel})
		if err != nil {
			return nil, fmt.Errorf("valkey notifier: %w", err)
		}

		return notifier, nil
	default:
		return nil, fmt.Errorf("%w: IK_NOTIFIER %q", errConfig, kind)
	}
}

func milliseconds(getenv func(string) string, name string) (time.Duration, error) {
	value, err := strconv.Atoi(getenv(name))
	if err != nil {
		return 0, fmt.Errorf("%w: %s: %w", errConfig, name, err)
	}

	return time.Duration(value) * time.Millisecond, nil
}

func keys(ctx context.Context, getenv func(string) string) (*idempotencykeys.Keys, error) {
	conns := &connections{getenv: getenv, pool: nil, valkey: nil}

	store, err := conns.store(ctx)
	if err != nil {
		return nil, err
	}

	notifier, err := conns.notifier(ctx)
	if err != nil {
		return nil, err
	}

	lease, err := milliseconds(getenv, "IK_LEASE_MS")
	if err != nil {
		return nil, err
	}

	wait, err := milliseconds(getenv, "IK_WAIT_MS")
	if err != nil {
		return nil, err
	}

	options := []idempotencykeys.Option{idempotencykeys.WithLease(lease), idempotencykeys.WithWait(wait)}
	if notifier != nil {
		options = append(options, idempotencykeys.WithNotifier(notifier))
	}

	k, err := idempotencykeys.New(store, options...)
	if err != nil {
		return nil, fmt.Errorf("idempotency keys: %w", err)
	}

	return k, nil
}

func serve(ctx context.Context, getenv func(string) string, out io.Writer) error {
	idempotency, err := keys(ctx, getenv)
	if err != nil {
		return err
	}

	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp", "127.0.0.1:0") //nolint:exhaustruct_v5 // The defaults
	if err != nil {
		return fmt.Errorf("listening: %w", err)
	}

	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("%w: not a TCP address: %v", errConfig, listener.Addr())
	}

	logger := &lineWriter{mu: sync.Mutex{}, out: out}
	logger.printf("listening %d", address.Port)

	// The handler itself, not a ServeMux, which would redirect a path like /a/../notes before the middleware sees it
	server := &http.Server{ //nolint:exhaustruct_v5 // The defaults
		Handler: idempotency.Middleware(func(r *http.Request) idempotencykeys.HandleOptions {
			return idempotencykeys.HandleOptions{Scope: r.Header.Get("X-Scope"), Operation: operation, Required: false}
		})(&handler{logger: logger, mu: sync.Mutex{}, runs: map[string]int{}}),
		ReadHeaderTimeout: readTimeout,
	}

	if err := server.Serve(listener); err != nil {
		return fmt.Errorf("serving: %w", err)
	}

	return nil
}

// lineWriter writes whole lines, one request at a time.
type lineWriter struct {
	out io.Writer
	mu  sync.Mutex
}

func (l *lineWriter) printf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()

	_, _ = fmt.Fprintf(l.out, format+"\n", args...)
}

// handler is the route behind the middleware.
type handler struct {
	logger *lineWriter
	runs   map[string]int
	mu     sync.Mutex
}

func headerInt(r *http.Request, name string, fallback int) (int, error) {
	value := r.Header.Get(name)
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}

	return parsed, nil
}

func (h *handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	status, err := headerInt(request, "X-Status", defaultStatus)
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)

		return
	}

	delay, err := headerInt(request, "X-Delay-Ms", 0)
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)

		return
	}

	scope := request.Header.Get("X-Scope")
	run := h.run(scope)
	h.logger.printf("run %s", scope)

	time.Sleep(time.Duration(delay) * time.Millisecond)

	body, err := json.Marshal(struct {
		Server string `json:"server"`
		Run    int    `json:"run"`
	}{Server: "go", Run: run})
	if err != nil {
		http.Error(writer, err.Error(), http.StatusInternalServerError)

		return
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_, _ = writer.Write(body)
}

func (h *handler) run(scope string) int {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.runs[scope]++

	return h.runs[scope]
}
