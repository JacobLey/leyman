package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/pgtest"
)

// schemaPath is the database package's schema.sql, read by path: project.json lists the package as an implicit
// dependency.
const schemaPath = "../../../database/schema.sql"

var (
	errAccept = errors.New("accept failed")
	errClose  = errors.New("close failed")
)

// template is what each test's database is cloned from, built once per run. DATABASE_URL is the postgres sidecar,
// which Dagger binds under the same name.
//
//nolint:gochecknoglobals // TestMain owns it, for every test of the package
var template *pgtest.Template

func TestMain(m *testing.M) {
	ctx := context.Background()

	built, err := pgtest.NewTemplate(ctx, os.Getenv("DATABASE_URL"), schemaPath)
	if err != nil {
		panic(err)
	}

	template = built
	code := m.Run()

	if err := template.Close(ctx); err != nil {
		panic(err)
	}

	os.Exit(code)
}

// newDatabaseURL is a database of the test's own.
func newDatabaseURL(t *testing.T) string {
	t.Helper()

	database, err := template.Clone(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		if err := template.Drop(context.Background(), database); err != nil {
			t.Error(err)
		}
	})

	return database.URL
}

// lines is stdout, sending each write on.
type lines chan string

func (l lines) Write(data []byte) (int, error) {
	l <- string(data)

	return len(data), nil
}

// syncBuffer is stderr, safe to read while the server writes.
type syncBuffer struct {
	buffer bytes.Buffer
	mu     sync.Mutex
}

func (b *syncBuffer) Write(data []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buffer.Write(data) //nolint:wrapcheck // Never fails
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buffer.String()
}

// started is a server run in the background.
type started struct {
	stderr *syncBuffer
	code   chan int
	stop   context.CancelFunc
	url    string
}

// start runs the server until stopped, once it says where it listens.
func start(t *testing.T, args []string, env map[string]string) started {
	t.Helper()

	ctx, stop := context.WithCancel(context.Background())
	stdout := make(lines, 1)
	stderr := &syncBuffer{buffer: bytes.Buffer{}, mu: sync.Mutex{}}
	code := make(chan int, 1)

	go func() {
		code <- run(ctx, args, func(name string) string { return env[name] }, stdout, stderr)
	}()

	select {
	case line := <-stdout:
		return started{stderr: stderr, code: code, stop: stop, url: strings.TrimSpace(line)}
	case exitCode := <-code:
		stop()
		t.Fatalf("exited %d: %s", exitCode, stderr.String())
	}

	return started{stderr: nil, code: nil, stop: nil, url: ""}
}

func get(t *testing.T, url, token string) (int, string) {
	t.Helper()

	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}

	request.Header.Set("Authorization", "Bearer "+token)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	body, _ := io.ReadAll(response.Body)

	return response.StatusCode, string(body)
}

func TestServesStaticTokens(t *testing.T) {
	t.Parallel()

	server := start(t, []string{"--listen", "127.0.0.1:0", "--static-token", "alice=secret", "--resource", "https://notes.example"},
		map[string]string{
			"DATABASE_URL":                newDatabaseURL(t),
			"NOTES_STATIC_TOKENS":         "ignored=token",
			"NOTES_AUTHORIZATION_SERVERS": "https://auth.example",
		})

	if status, body := get(t, server.url+"/notes", "secret"); status != http.StatusOK || body != `{"items":[]}` {
		t.Fatalf("%d %s", status, body)
	}

	// The flag replaced the environment's tokens
	if status, _ := get(t, server.url+"/notes", "token"); status != http.StatusUnauthorized {
		t.Fatalf("%d", status)
	}

	status, body := get(t, server.url+"/.well-known/oauth-protected-resource", "")
	if status != http.StatusOK || !strings.Contains(body, `"authorization_servers":["https://auth.example"]`) {
		t.Fatalf("%d %s", status, body)
	}

	server.stop()

	if code := <-server.code; code != exitOK {
		t.Fatalf("exited %d: %s", code, server.stderr.String())
	}
}

func TestServesJWTs(t *testing.T) {
	t.Parallel()

	server := start(t, nil, map[string]string{
		"DATABASE_URL":           newDatabaseURL(t),
		"NOTES_LISTEN":           "127.0.0.1:0",
		"NOTES_JWT_ISSUER":       "http://127.0.0.1:1",
		"NOTES_JWT_AUDIENCE":     "https://notes.example",
		"NOTES_IDEMPOTENCY_WAIT": "0s",
	})

	// The issuer can't be reached: a 500, and the error on stderr
	if status, _ := get(t, server.url+"/notes", "token"); status != http.StatusInternalServerError {
		t.Fatalf("%d", status)
	}

	server.stop()
	<-server.code

	if !strings.HasPrefix(server.stderr.String(), "notes-server: authorization server http://127.0.0.1:1") {
		t.Fatalf("stderr %q", server.stderr.String())
	}
}

// An issuer that never answers: requests fail once the fetch times out, rather than waiting for it forever.
func TestJWTFetchTimeout(t *testing.T) {
	t.Parallel()

	hung := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		<-request.Context().Done()
	}))
	t.Cleanup(hung.Close)

	server := start(t, []string{"--listen", "127.0.0.1:0", "--jwt-issuer", hung.URL, "--jwt-audience", "https://notes.example"},
		map[string]string{"DATABASE_URL": newDatabaseURL(t), "NOTES_JWT_FETCH_TIMEOUT": "1ms"})

	if status, _ := get(t, server.url+"/notes", "token"); status != http.StatusInternalServerError {
		t.Fatalf("%d", status)
	}

	server.stop()
	<-server.code

	if !strings.Contains(server.stderr.String(), context.DeadlineExceeded.Error()) {
		t.Fatalf("stderr %q", server.stderr.String())
	}
}

func TestExitCodes(t *testing.T) {
	t.Parallel()

	databaseURL := os.Getenv("DATABASE_URL")
	static := []string{"--database-url", databaseURL, "--static-token", "alice=secret"}

	for name, test := range map[string]struct {
		env  map[string]string
		args []string
		code int
	}{
		"help":            {env: nil, args: []string{"--help"}, code: exitOK},
		"unknown flag":    {env: nil, args: []string{"--nope"}, code: exitUsage},
		"argument":        {env: nil, args: append(static, "extra"), code: exitUsage},
		"no database":     {env: nil, args: []string{"--static-token", "a=b"}, code: exitUsage},
		"no tokens":       {env: nil, args: []string{"--database-url", databaseURL}, code: exitUsage},
		"both":            {env: nil, args: append(static, "--jwt-issuer", "https://auth.example"), code: exitUsage},
		"no audience":     {env: nil, args: []string{"--database-url", databaseURL, "--jwt-issuer", "https://auth.example"}, code: exitUsage},
		"bad token":       {env: nil, args: []string{"--database-url", databaseURL, "--static-token", "secret"}, code: exitUsage},
		"bad wait":        {env: map[string]string{"NOTES_IDEMPOTENCY_WAIT": "soon"}, args: static, code: exitUsage},
		"negative wait":   {env: nil, args: append(static, "--idempotency-wait", "-1s"), code: exitError},
		"bad fetch time":  {env: map[string]string{"NOTES_JWT_FETCH_TIMEOUT": "soon"}, args: static, code: exitUsage},
		"no fetch time":   {env: nil, args: append(static, "--jwt-fetch-timeout", "0s"), code: exitUsage},
		"bad resource":    {env: nil, args: append(static, "--resource", "/notes"), code: exitError},
		"bad database":    {env: nil, args: []string{"--database-url", "://", "--static-token", "a=b"}, code: exitError},
		"bad listen":      {env: nil, args: append(static, "--listen", "nowhere"), code: exitError},
		"bad port":        {env: nil, args: append(static, "--listen", "127.0.0.1:-1"), code: exitError},
		"no listen value": {env: nil, args: append(static, "--listen"), code: exitUsage},
	} {
		getenv := func(name string) string { return test.env[name] }

		var stderr syncBuffer
		if code := run(context.Background(), test.args, getenv, io.Discard, &stderr); code != test.code {
			t.Errorf("%s: exited %d, want %d: %s", name, code, test.code, stderr.String())
		}
	}
}

// brokenListener fails to accept, or to close.
type brokenListener struct {
	net.Listener

	closed     chan struct{}
	acceptFail bool
}

func (l *brokenListener) Accept() (net.Conn, error) {
	if l.acceptFail {
		return nil, errAccept
	}

	<-l.closed

	return nil, net.ErrClosed
}

func (l *brokenListener) Close() error {
	close(l.closed)

	return errClose
}

func (*brokenListener) Addr() net.Addr {
	return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 1, Zone: ""}
}

// TestListenerFailures can't run in parallel: it swaps listen.
//
//nolint:paralleltest // It swaps a global
func TestListenerFailures(t *testing.T) {
	defer func() { listen = net.Listen }()

	for _, acceptFail := range []bool{true, false} {
		listen = func(string, string) (net.Listener, error) {
			return &brokenListener{Listener: nil, closed: make(chan struct{}), acceptFail: acceptFail}, nil
		}

		ctx, stop := context.WithCancel(context.Background())
		stdout := make(lines, 1)
		code := make(chan int, 1)
		args := []string{"--database-url", os.Getenv("DATABASE_URL"), "--static-token", "alice=secret"}

		go func() { code <- run(ctx, args, func(string) string { return "" }, stdout, io.Discard) }()

		<-stdout
		stop()

		if got := <-code; got != exitError {
			t.Errorf("accept fails %v: exited %d", acceptFail, got)
		}
	}
}

//nolint:paralleltest // It swaps globals
func TestMainExits(t *testing.T) {
	defer func() { exit = os.Exit }()

	var code int

	exit = func(c int) { code = c }
	args := os.Args

	defer func() { os.Args = args }()

	os.Args = []string{"notes-server", "--nope"}

	main()

	if code != exitUsage {
		t.Fatalf("exited %d", code)
	}
}
