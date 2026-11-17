// Command notes-server serves the notes API on Postgres, with static tokens or JWTs from an authorization server.
//
// Usage:
//
//	notes-server [flags]
//
// Every flag can also be set by an environment variable, which the flag overrides: run it with --help for the list.
// It prints the URL it listens on to stdout once it does (useful with --listen 127.0.0.1:0, for a free port), each
// error a request ends in to stderr, and shuts down on SIGTERM or SIGINT, letting running requests finish (up to
// --shutdown-timeout).
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"

	"github.com/JacobLey/leyman/demos/openapi/go/server"
)

// Swapped only by tests.
//
//nolint:gochecknoglobals // Swapped only by tests
var (
	exit   = os.Exit
	listen = net.Listen
)

// Exit codes.
const (
	exitOK    = 0
	exitError = 1
	exitUsage = 2
)

// readHeaderTimeout bounds how long a client may take to send its headers (unless --read-timeout is shorter), so a slow
// one can't hold a connection.
const readHeaderTimeout = 10 * time.Second

var errUsage = errors.New("invalid flags")

func main() {
	exit(serve(os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
}

// serve runs until SIGTERM or SIGINT.
func serve(args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	return run(ctx, args, getenv, stdout, stderr)
}

// listFlag is a flag that can be repeated, defaulting to an environment variable's whitespace-separated values. The
// first use of the flag replaces the environment's values.
type listFlag struct {
	values []string
	set    bool
}

func (l *listFlag) String() string {
	return strings.Join(l.values, " ")
}

func (l *listFlag) Set(value string) error {
	if !l.set {
		l.values = nil
		l.set = true
	}

	l.values = append(l.values, value)

	return nil
}

// options are the parsed command line.
type options struct {
	databaseURL          string
	listen               string
	jwtIssuer            string
	jwtAudience          string
	resource             string
	staticTokens         listFlag
	authorizationServers listFlag
	idempotencyWait      time.Duration
	jwtFetchTimeout      time.Duration
	readTimeout          time.Duration
	idleTimeout          time.Duration
	shutdownTimeout      time.Duration
}

// parse reads the flags, each defaulting to its environment variable.
func parse(args []string, getenv func(string) string, stderr io.Writer) (options, error) {
	set := flag.NewFlagSet("notes-server", flag.ContinueOnError)
	set.SetOutput(stderr)

	var parsed options

	env := func(name, fallback string) string {
		if value := getenv(name); value != "" {
			return value
		}

		return fallback
	}

	durations := map[string]time.Duration{}

	for name, fallback := range map[string]string{
		"NOTES_IDEMPOTENCY_WAIT":  "10s",
		"NOTES_JWT_FETCH_TIMEOUT": "5s",
		"NOTES_READ_TIMEOUT":      "30s",
		"NOTES_IDLE_TIMEOUT":      "1m",
		"NOTES_SHUTDOWN_TIMEOUT":  "30s",
	} {
		duration, err := time.ParseDuration(env(name, fallback))
		if err != nil {
			return options{}, fmt.Errorf("%w: %s: %w", errUsage, name, err)
		}

		durations[name] = duration
	}

	set.StringVar(&parsed.databaseURL, "database-url", getenv("DATABASE_URL"), "Postgres connection URL, with the database package's schema (env DATABASE_URL)")
	set.StringVar(&parsed.listen, "listen", env("NOTES_LISTEN", "127.0.0.1:3000"), "Address to listen on, port 0 for a free one (env NOTES_LISTEN)")
	set.StringVar(&parsed.jwtIssuer, "jwt-issuer", getenv("NOTES_JWT_ISSUER"), "Accept JWT access tokens from this issuer (env NOTES_JWT_ISSUER)")
	set.StringVar(&parsed.jwtAudience, "jwt-audience", getenv("NOTES_JWT_AUDIENCE"), "The API's audience, with --jwt-issuer (env NOTES_JWT_AUDIENCE)")
	set.StringVar(&parsed.resource, "resource", getenv("NOTES_RESOURCE"), "The API's URL, to serve its Protected Resource Metadata (env NOTES_RESOURCE)")
	set.DurationVar(&parsed.idempotencyWait, "idempotency-wait", durations["NOTES_IDEMPOTENCY_WAIT"], "How long a retry waits for a running request with its key (env NOTES_IDEMPOTENCY_WAIT)")
	set.DurationVar(&parsed.readTimeout, "read-timeout", durations["NOTES_READ_TIMEOUT"], "How long a client may take to send a whole request, so a slow one can't hold a connection (env NOTES_READ_TIMEOUT)")
	set.DurationVar(&parsed.idleTimeout, "idle-timeout", durations["NOTES_IDLE_TIMEOUT"], "How long a kept-alive connection may wait for its next request (env NOTES_IDLE_TIMEOUT)")
	set.DurationVar(&parsed.shutdownTimeout, "shutdown-timeout", durations["NOTES_SHUTDOWN_TIMEOUT"], "How long running requests may take to finish on SIGTERM, before they're dropped (env NOTES_SHUTDOWN_TIMEOUT)")
	set.DurationVar(&parsed.jwtFetchTimeout, "jwt-fetch-timeout", durations["NOTES_JWT_FETCH_TIMEOUT"], "How long finding and fetching the issuer's keys may take, after which requests that need them fail (env NOTES_JWT_FETCH_TIMEOUT)")

	parsed.staticTokens.values = strings.Fields(getenv("NOTES_STATIC_TOKENS"))
	set.Var(&parsed.staticTokens, "static-token", "Accept a token, as subject=token, repeatable (env NOTES_STATIC_TOKENS, space-separated)")

	parsed.authorizationServers.values = strings.Fields(getenv("NOTES_AUTHORIZATION_SERVERS"))
	set.Var(&parsed.authorizationServers, "authorization-server", "An authorization server in the metadata, repeatable (env NOTES_AUTHORIZATION_SERVERS, space-separated)")

	if err := set.Parse(args); err != nil {
		return options{}, err //nolint:wrapcheck // flag's own errors, including ErrHelp
	}

	if set.NArg() > 0 {
		return options{}, fmt.Errorf("%w: unexpected argument %q", errUsage, set.Arg(0))
	}

	if err := parsed.check(); err != nil {
		return options{}, err
	}

	return parsed, nil
}

// check refuses options that can't work together.
func (o options) check() error {
	switch {
	case o.databaseURL == "":
		return fmt.Errorf("%w: --database-url is required", errUsage)
	case (len(o.staticTokens.values) > 0) == (o.jwtIssuer != ""):
		return fmt.Errorf("%w: give either --static-token or --jwt-issuer", errUsage)
	case o.jwtIssuer != "" && o.jwtAudience == "":
		return fmt.Errorf("%w: --jwt-issuer needs --jwt-audience", errUsage)
	}

	// Zero is no limit to net/http, which is what these are for
	for name, duration := range map[string]time.Duration{
		"--jwt-fetch-timeout": o.jwtFetchTimeout,
		"--read-timeout":      o.readTimeout,
		"--idle-timeout":      o.idleTimeout,
		"--shutdown-timeout":  o.shutdownTimeout,
	} {
		if duration <= 0 {
			return fmt.Errorf("%w: %s must be positive", errUsage, name)
		}
	}

	return nil
}

// authenticator is the static tokens, or the JWT issuer's.
func (o options) authenticator() (server.Authenticator, error) { //nolint:ireturn // One of two
	if o.jwtIssuer != "" {
		return server.NewJWTAuthenticator(server.JWTOptions{
			HTTPClient:   nil,
			Now:          nil,
			Issuer:       o.jwtIssuer,
			Audience:     o.jwtAudience,
			FetchTimeout: o.jwtFetchTimeout,
		}), nil
	}

	tokens := make([]server.StaticToken, 0, len(o.staticTokens.values))

	for _, value := range o.staticTokens.values {
		subject, token, ok := strings.Cut(value, "=")
		if !ok || subject == "" || token == "" {
			return nil, fmt.Errorf("%w: a static token is subject=token, not %q", errUsage, value)
		}

		tokens = append(tokens, server.StaticToken{Token: token, Subject: subject})
	}

	return server.NewStaticTokens(tokens), nil
}

// lockedWriter writes whole lines from any goroutine.
type lockedWriter struct {
	writer io.Writer
	mu     sync.Mutex
}

func (w *lockedWriter) println(values ...any) {
	w.mu.Lock()
	defer w.mu.Unlock()

	_, _ = fmt.Fprintln(w.writer, values...)
}

// handler is the API, on a pool of its own.
func (o options) handler(ctx context.Context, logger *lockedWriter) (http.Handler, *pgxpool.Pool, error) {
	authenticator, err := o.authenticator()
	if err != nil {
		return nil, nil, err
	}

	pool, err := pgxpool.New(ctx, o.databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("connecting to Postgres: %w", err)
	}

	store, _ := postgres.NewStore(pool, postgres.StoreOptions{Table: ""}) // The default table's name is valid

	var resource *server.ProtectedResource
	if o.resource != "" {
		resource = &server.ProtectedResource{Resource: o.resource, AuthorizationServers: o.authorizationServers.values}
	}

	handler, err := server.New(server.Config{
		Handlers:           server.NewPostgresHandlers(pool),
		Authenticator:      authenticator,
		IdempotencyStore:   store,
		OnError:            func(err error) { logger.println("notes-server:", err) },
		ProtectedResource:  resource,
		IdempotencyOptions: []idempotencykeys.Option{idempotencykeys.WithWait(o.idempotencyWait)},
	})
	if err != nil {
		pool.Close()

		return nil, nil, fmt.Errorf("serving: %w", err)
	}

	return handler, pool, nil
}

// httpServer serves the handler, with limits on how long a client may hold a connection without making progress.
func (o options) httpServer(handler http.Handler) *http.Server {
	//nolint:exhaustruct_v5 // net/http's defaults for the rest
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: min(readHeaderTimeout, o.readTimeout),
		// The body too: at most 128 KiB, so a client still sending it after this is too slow to wait for
		ReadTimeout: o.readTimeout,
		IdleTimeout: o.idleTimeout,
	}
}

// shutdown stops accepting requests and waits for running ones to finish, up to --shutdown-timeout, then drops what
// is left. A dropped request that held an Idempotency-Key keeps it held until its lease runs out, as when a server
// stops without warning.
func (o options) shutdown(ctx context.Context, httpServer *http.Server) error {
	ctx, cancel := context.WithTimeout(ctx, o.shutdownTimeout)
	defer cancel()

	err := httpServer.Shutdown(ctx)
	if errors.Is(err, context.DeadlineExceeded) {
		_ = httpServer.Close()

		return fmt.Errorf("requests still running after %s were dropped: %w", o.shutdownTimeout, err)
	}

	return err //nolint:wrapcheck // The listener's own error
}

// run serves the API until ctx is done, then waits for running requests to finish.
func run(ctx context.Context, args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	logger := &lockedWriter{writer: stderr, mu: sync.Mutex{}}

	parsed, err := parse(args, getenv, stderr)
	if errors.Is(err, flag.ErrHelp) {
		return exitOK
	}

	if err != nil {
		logger.println("notes-server:", err)

		return exitUsage
	}

	handler, pool, err := parsed.handler(ctx, logger)
	if errors.Is(err, errUsage) {
		logger.println("notes-server:", err)

		return exitUsage
	}

	if err != nil {
		logger.println("notes-server:", err)

		return exitError
	}

	defer pool.Close()

	listener, err := listen("tcp", parsed.listen)
	if err != nil {
		logger.println("notes-server:", err)

		return exitError
	}

	httpServer := parsed.httpServer(handler)
	shutdown := make(chan error, 1)

	go func() {
		<-ctx.Done()

		shutdown <- parsed.shutdown(context.WithoutCancel(ctx), httpServer)
	}()

	_, _ = fmt.Fprintln(stdout, "http://"+listener.Addr().String())

	if err := httpServer.Serve(listener); !errors.Is(err, http.ErrServerClosed) {
		logger.println("notes-server:", err)

		return exitError
	}

	if err := <-shutdown; err != nil {
		logger.println("notes-server:", err)

		return exitError
	}

	return exitOK
}
