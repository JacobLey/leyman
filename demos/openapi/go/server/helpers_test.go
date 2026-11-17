package server_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"

	"github.com/JacobLey/leyman/demos/openapi/go/notes"
	"github.com/JacobLey/leyman/demos/openapi/go/server"
)

// Static tokens, each with every scope.
const (
	aliceToken = "alice-token"
	bobToken   = "bob-token"
)

// errorLog collects what OnError gets.
type errorLog struct {
	errors []error
	mu     sync.Mutex
}

func (l *errorLog) add(err error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.errors = append(l.errors, err)
}

func (l *errorLog) all() []error {
	l.mu.Lock()
	defer l.mu.Unlock()

	return append([]error(nil), l.errors...)
}

// served is the API on a test server, on a database of its own.
type served struct {
	pool   *pgxpool.Pool
	errors *errorLog
	url    string
}

// configure changes the Config of a served API.
type configure func(config *server.Config)

func newStore(t *testing.T, pool *pgxpool.Pool) *postgres.Store {
	t.Helper()

	store, err := postgres.NewStore(pool, postgres.StoreOptions{}) //nolint:exhaustruct_v5 // The default table
	if err != nil {
		t.Fatal(err)
	}

	return store
}

// serve serves the API with static tokens for alice and bob, on Postgres.
func serve(t *testing.T, changes ...configure) served {
	t.Helper()

	pool := newDatabase(t)
	log := &errorLog{errors: nil, mu: sync.Mutex{}}
	config := server.Config{
		Handlers: server.NewPostgresHandlers(pool),
		Authenticator: server.NewStaticTokens([]server.StaticToken{
			{Token: aliceToken, Subject: "alice"},
			{Token: bobToken, Subject: "bob"},
		}),
		IdempotencyStore:   newStore(t, pool),
		OnError:            log.add,
		ProtectedResource:  nil,
		IdempotencyOptions: nil,
	}

	for _, change := range changes {
		change(&config)
	}

	handler, err := server.New(config)
	if err != nil {
		t.Fatal(err)
	}

	httpServer := httptest.NewServer(handler)
	t.Cleanup(httpServer.Close)

	return served{pool: pool, errors: log, url: httpServer.URL}
}

// response is what the API answered.
type response struct {
	header http.Header
	body   string
	status int
}

// decode reads the body as JSON into a value of type T.
func decode[T any](t *testing.T, res response) T { //nolint:ireturn // The type asked for
	t.Helper()

	var value T
	if err := json.Unmarshal([]byte(res.body), &value); err != nil {
		t.Fatalf("decoding %q: %v", res.body, err)
	}

	return value
}

// header is a request header's name and value.
type header struct {
	name, value string
}

// request sends a request, with the token (none when empty), and headers.
func (s served) request(t *testing.T, method, path, token, body string, headers ...header) response {
	t.Helper()

	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}

	req, err := http.NewRequestWithContext(context.Background(), method, s.url+path, reader)
	if err != nil {
		t.Fatal(err)
	}

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	for _, header := range headers {
		req.Header.Set(header.name, header.value)
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}

	return response{header: res.Header, body: string(data), status: res.StatusCode}
}

// expectStatus fails unless the response has the status.
func expectStatus(t *testing.T, res response, status int) {
	t.Helper()

	if res.status != status {
		t.Fatalf("status %d, want %d: %s", res.status, status, res.body)
	}
}

// expectProblem fails unless the response is an ApiError with the status and code.
func expectProblem(t *testing.T, res response, status int, code string) notes.ApiError {
	t.Helper()
	expectStatus(t, res, status)

	if contentType := res.header.Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("content type %q", contentType)
	}

	problem := decode[notes.ApiError](t, res)
	if problem.Code != code || problem.Message == "" {
		t.Fatalf("problem %+v, want code %q", problem, code)
	}

	return problem
}

// createNote adds a note as the token's caller.
func (s served) createNote(t *testing.T, token, title, body string) notes.Note {
	t.Helper()

	data, _ := json.Marshal(notes.NewNote{Title: title, Body: body}) //nolint:errchkjson // Always encodes
	res := s.request(t, http.MethodPost, "/notes", token, string(data))
	expectStatus(t, res, http.StatusCreated)

	return decode[notes.Note](t, res)
}

// stubHandlers are the Postgres handlers, with any of them replaced.
type stubHandlers struct {
	server.Handlers

	listNotes  func(ctx context.Context, caller server.Caller, request notes.ListNotesRequest) (notes.ListNotesResult, error)
	createNote func(ctx context.Context, caller server.Caller, request notes.CreateNoteRequest) (notes.CreateNoteResult, error)
}

func (h stubHandlers) ListNotes(
	ctx context.Context,
	caller server.Caller,
	request notes.ListNotesRequest,
) (notes.ListNotesResult, error) {
	if h.listNotes != nil {
		return h.listNotes(ctx, caller, request)
	}

	return h.Handlers.ListNotes(ctx, caller, request) //nolint:wrapcheck // The handler's errors, as they are
}

func (h stubHandlers) CreateNote(
	ctx context.Context,
	caller server.Caller,
	request notes.CreateNoteRequest,
) (notes.CreateNoteResult, error) {
	if h.createNote != nil {
		return h.createNote(ctx, caller, request)
	}

	return h.Handlers.CreateNote(ctx, caller, request) //nolint:wrapcheck // The handler's errors, as they are
}

// withHandlers replaces handlers, keeping the Postgres ones for the rest.
func withHandlers(stub stubHandlers) configure {
	return func(config *server.Config) {
		stub.Handlers = config.Handlers
		config.Handlers = stub
	}
}

// withIdempotency adds idempotency-keys options.
func withIdempotency(options ...idempotencykeys.Option) configure {
	return func(config *server.Config) {
		config.IdempotencyOptions = options
	}
}
