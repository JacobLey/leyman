package server_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"

	"github.com/JacobLey/leyman/demos/openapi/go/notes"
	"github.com/JacobLey/leyman/demos/openapi/go/server"
)

// Each OnError should get, and a body that can't be read.
var (
	errIntrospection = errors.New("introspection failed")
	errHandler       = errors.New("handler failed")
	errReset         = errors.New("connection reset")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func TestCreateAndGet(t *testing.T) {
	t.Parallel()

	api := serve(t)

	created := api.createNote(t, aliceToken, "Dolly <&>", "A sheep")
	if !uuidPattern.MatchString(created.ID) || created.Title != "Dolly <&>" || created.Body != "A sheep" {
		t.Fatalf("created %+v", created)
	}

	if _, err := time.Parse("2006-01-02T15:04:05.000Z", created.CreatedAt); err != nil {
		t.Fatalf("createdAt %q: %v", created.CreatedAt, err)
	}

	res := api.request(t, http.MethodGet, "/notes/"+created.ID, aliceToken, "")
	expectStatus(t, res, http.StatusOK)

	// Written as JSON.stringify writes it, so either server's bodies are the same bytes
	if !strings.Contains(res.body, `"title":"Dolly <&>"`) || res.header.Get("Content-Type") != "application/json" {
		t.Fatalf("body %s, headers %v", res.body, res.header)
	}

	if got := decode[notes.Note](t, res); got != created {
		t.Fatalf("got %+v, want %+v", got, created)
	}
}

func TestListNewestFirst(t *testing.T) {
	t.Parallel()

	api := serve(t)
	created := api.createNote(t, aliceToken, "First", "")
	second := api.createNote(t, aliceToken, "Second", "")

	list := decode[notes.NoteList](t, api.request(t, http.MethodGet, "/notes", aliceToken, ""))
	if len(list.Items) != 2 || list.Items[0] != second || list.Items[1] != created {
		t.Fatalf("list %+v", list)
	}
}

func TestListLimit(t *testing.T) {
	t.Parallel()

	api := serve(t)

	if _, err := api.pool.Exec(context.Background(),
		"INSERT INTO notes (owner, title, body) SELECT 'alice', 'Note ' || n, '' FROM generate_series(1, 25) n"); err != nil {
		t.Fatal(err)
	}

	for query, want := range map[string]int{"": 20, "?limit=1": 1, "?limit=100": 25, "?limit=%205%20": 5, "?limit=0x3": 3} {
		res := api.request(t, http.MethodGet, "/notes"+query, aliceToken, "")
		expectStatus(t, res, http.StatusOK)

		if list := decode[notes.NoteList](t, res); len(list.Items) != want {
			t.Errorf("%q: %d notes, want %d", query, len(list.Items), want)
		}
	}
}

func TestListMatchesTitles(t *testing.T) {
	t.Parallel()

	api := serve(t)

	for _, title := range []string{"100% wool", "1000 sheep", "a_b", "axb", `back\slash`, "backslash", "Dolly"} {
		api.createNote(t, aliceToken, title, "")
	}

	for query, want := range map[string][]string{
		"%":     {"100% wool"},
		"_":     {"a_b"},
		`\`:     {`back\slash`},
		"dOLLY": {"Dolly"},
		"zzz":   {},
	} {
		list := decode[notes.NoteList](t, api.request(t, http.MethodGet, "/notes?q="+url.QueryEscape(query), aliceToken, ""))

		titles := make([]string, 0, len(list.Items))
		for _, item := range list.Items {
			titles = append(titles, item.Title)
		}

		if fmt.Sprint(titles) != fmt.Sprint(want) {
			t.Errorf("q=%q: %v, want %v", query, titles, want)
		}
	}
}

func TestNotesAreTheCallers(t *testing.T) {
	t.Parallel()

	api := serve(t)
	note := api.createNote(t, aliceToken, "Alice's", "")
	bobs := api.createNote(t, bobToken, "Bob's", "")

	// As if it didn't exist, so an id says nothing about whose note it is
	expectProblem(t, api.request(t, http.MethodGet, "/notes/"+note.ID, bobToken, ""), http.StatusNotFound, "not_found")
	expectProblem(t, api.request(t, http.MethodGet, "/notes/01900000-0000-7000-8000-000000000000", aliceToken, ""),
		http.StatusNotFound, "not_found")

	list := decode[notes.NoteList](t, api.request(t, http.MethodGet, "/notes", bobToken, ""))
	if len(list.Items) != 1 || list.Items[0] != bobs {
		t.Fatalf("bob sees %+v", list)
	}
}

func TestRoutes(t *testing.T) {
	t.Parallel()

	api := serve(t)

	for _, path := range []string{"/", "/nope", "/notes/", "/notes/a/b"} {
		expectProblem(t, api.request(t, http.MethodGet, path, "", ""), http.StatusNotFound, "not_found")
	}

	res := api.request(t, http.MethodPut, "/notes", aliceToken, "")
	expectProblem(t, res, http.StatusMethodNotAllowed, "method_not_allowed")

	if allow := res.header.Get("Allow"); allow != "GET, HEAD, POST" {
		t.Errorf("Allow %q", allow)
	}

	res = api.request(t, http.MethodDelete, "/notes/x", "", "")
	expectProblem(t, res, http.StatusMethodNotAllowed, "method_not_allowed")

	if allow := res.header.Get("Allow"); allow != "GET, HEAD" {
		t.Errorf("Allow %q", allow)
	}

	res = api.request(t, http.MethodHead, "/notes", aliceToken, "")
	if res.status != http.StatusOK || res.body != "" {
		t.Errorf("HEAD %d %q", res.status, res.body)
	}

	// No metadata without a protected resource
	expectProblem(t, api.request(t, http.MethodGet, "/.well-known/oauth-protected-resource", "", ""),
		http.StatusNotFound, "not_found")
}

// fakeAuthenticate accepts "valid" for every scope and "read-only" for notes:read, and fails for "broken".
func fakeAuthenticate(_ context.Context, token string, scopes []string) (server.Caller, error) {
	switch token {
	case "valid":
		return server.Caller{Subject: "alice"}, nil
	case "read-only":
		if scopes[0] == "notes:read" {
			return server.Caller{Subject: "alice"}, nil
		}

		return server.Caller{}, server.ErrInsufficientScope
	case "broken":
		return server.Caller{}, errIntrospection
	default:
		return server.Caller{}, server.ErrInvalidToken
	}
}

func TestAuthentication(t *testing.T) {
	t.Parallel()

	api := serve(t, func(config *server.Config) { config.Authenticator = server.AuthenticatorFunc(fakeAuthenticate) })

	res := api.request(t, http.MethodGet, "/notes", "", "")
	expectProblem(t, res, http.StatusUnauthorized, "unauthorized")

	if challenge := res.header.Get("WWW-Authenticate"); challenge != "Bearer" {
		t.Errorf("challenge %q", challenge)
	}

	res = api.request(t, http.MethodGet, "/notes", "", "", header{"Authorization", "Basic abc"})
	expectProblem(t, res, http.StatusUnauthorized, "unauthorized")

	res = api.request(t, http.MethodGet, "/notes", "wrong", "")
	expectProblem(t, res, http.StatusUnauthorized, "unauthorized")

	if challenge := res.header.Get("WWW-Authenticate"); challenge != `Bearer error="invalid_token"` {
		t.Errorf("challenge %q", challenge)
	}

	expectStatus(t, api.request(t, http.MethodGet, "/notes", "read-only", ""), http.StatusOK)

	// Before the body is even looked at
	res = api.request(t, http.MethodPost, "/notes", "read-only", "not json")
	expectProblem(t, res, http.StatusForbidden, "insufficient_scope")

	if challenge := res.header.Get("WWW-Authenticate"); challenge != `Bearer error="insufficient_scope", scope="notes:write"` {
		t.Errorf("challenge %q", challenge)
	}

	expectProblem(t, api.request(t, http.MethodGet, "/notes", "broken", ""), http.StatusInternalServerError, "internal_error")

	if logged := api.errors.all(); len(logged) != 1 || !errors.Is(logged[0], errIntrospection) {
		t.Fatalf("logged %v", logged)
	}
}

func TestStaticTokens(t *testing.T) {
	t.Parallel()

	authenticator := server.NewStaticTokens([]server.StaticToken{{Token: "a", Subject: "first"}, {Token: "b", Subject: "second"}})

	for token, want := range map[string]string{"a": "first", "b": "second"} {
		caller, err := authenticator.Authenticate(context.Background(), token, []string{"notes:write"})
		if err != nil || caller.Subject != want {
			t.Errorf("%q: %v %v", token, caller, err)
		}
	}

	if _, err := authenticator.Authenticate(context.Background(), "c", nil); !errors.Is(err, server.ErrInvalidToken) {
		t.Errorf("unknown token: %v", err)
	}
}

func TestProtectedResource(t *testing.T) {
	t.Parallel()

	for resource, path := range map[string]string{
		"https://notes.example":      "/.well-known/oauth-protected-resource",
		"https://notes.example/":     "/.well-known/oauth-protected-resource",
		"https://notes.example/api/": "/.well-known/oauth-protected-resource/api/",
	} {
		api := serve(t, func(config *server.Config) {
			config.ProtectedResource = &server.ProtectedResource{
				Resource:             resource,
				AuthorizationServers: []string{"https://auth.example"},
			}
		})

		res := api.request(t, http.MethodGet, path, "", "")
		expectStatus(t, res, http.StatusOK)

		want := `{"resource":"` + resource + `","authorization_servers":["https://auth.example"],` +
			`"scopes_supported":["notes:read","notes:write"],"bearer_methods_supported":["header"]}`
		if res.body != want {
			t.Errorf("metadata %s", res.body)
		}

		expectProblem(t, api.request(t, http.MethodPost, path, "", ""), http.StatusNotFound, "not_found")

		res = api.request(t, http.MethodGet, "/notes", "", "")
		if challenge := res.header.Get("WWW-Authenticate"); challenge != `Bearer resource_metadata="https://notes.example`+path+`"` {
			t.Errorf("challenge %q", challenge)
		}

		res = api.request(t, http.MethodGet, "/notes", "wrong", "")
		if challenge := res.header.Get("WWW-Authenticate"); challenge != `Bearer resource_metadata="https://notes.example`+path+
			`", error="invalid_token"` {
			t.Errorf("challenge %q", challenge)
		}
	}
}

func TestRequestValidation(t *testing.T) {
	t.Parallel()

	api := serve(t)

	for _, query := range []string{
		"?limit=0", "?limit=101", "?limit=abc", "?limit=1.5", "?limit=", "?limit=Infinity", "?limit=%20", "?q=", "?other=1",
		"?q=" + url.QueryEscape("\x00"),
	} {
		res := api.request(t, http.MethodGet, "/notes"+query, aliceToken, "")
		problem := expectProblem(t, res, http.StatusBadRequest, "invalid_request")

		if !strings.HasPrefix(problem.Message, "query") {
			t.Errorf("%s: %q", query, problem.Message)
		}
	}

	problem := expectProblem(t, api.request(t, http.MethodGet, "/notes/abc", aliceToken, ""), http.StatusBadRequest, "invalid_request")
	if !strings.HasPrefix(problem.Message, "path/noteId") {
		t.Errorf("path: %q", problem.Message)
	}

	for body, message := range map[string]string{
		`{"title":"x"}`:                     "body",
		`{"title":"","body":""}`:            "body/title",
		`{"title":"x","body":"","more":1}`:  "body",
		`{"title":"\u0000","body":""}`:      "body/title",
		`{"title":"x","body":5}`:            "body/body",
		`{"title":"x","body":""} trailing`:  "body is not valid JSON",
		`{"Title":"x","body":""}`:           "body",
		`{"title":"x","body":"` + "\x00\"}": "body is not valid JSON",
	} {
		problem := expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, body), http.StatusBadRequest, "invalid_request")
		if !strings.HasPrefix(problem.Message, message) {
			t.Errorf("%s: %q", body, problem.Message)
		}
	}

	for _, contentType := range []string{"text/plain", ""} {
		problem := expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, `{"title":"x","body":""}`,
			header{"Content-Type", contentType}), http.StatusBadRequest, "invalid_request")
		if problem.Message != "body must be application/json" {
			t.Errorf("%q: %q", contentType, problem.Message)
		}
	}

	expectStatus(t, api.request(t, http.MethodPost, "/notes", aliceToken, `{"title":"x","body":""}`,
		header{"Content-Type", " Application/JSON ; charset=utf-8"}), http.StatusCreated)
}

func TestBodyLimit(t *testing.T) {
	t.Parallel()

	api := serve(t)
	large := `{"title":"x","body":"` + strings.Repeat("a", 128*1024) + `"}`

	// Authentication first
	expectProblem(t, api.request(t, http.MethodPost, "/notes", "", large), http.StatusUnauthorized, "unauthorized")
	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, large), http.StatusRequestEntityTooLarge, "too_large")

	// Chunked, so only refused once that much has arrived: with a key and without
	for _, headers := range [][]string{nil, {"Idempotency-Key", "large"}} {
		req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, api.url+"/notes",
			struct{ *strings.Reader }{strings.NewReader(large)})
		if err != nil {
			t.Fatal(err)
		}

		req.Header.Set("Authorization", "Bearer "+aliceToken)
		req.Header.Set("Content-Type", "application/json")

		for i := 0; i < len(headers); i += 2 {
			req.Header.Set(headers[i], headers[i+1])
		}

		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}

		_ = res.Body.Close()

		if res.StatusCode != http.StatusRequestEntityTooLarge || req.ContentLength != 0 {
			t.Errorf("chunked %v: %d", headers, res.StatusCode)
		}
	}

	// A body over the limit holds no key
	var count int
	if err := api.pool.QueryRow(context.Background(), "SELECT count(*) FROM idempotency_keys").Scan(&count); err != nil || count != 0 {
		t.Fatalf("%d keys, %v", count, err)
	}
}

// brokenListNotes answers each q with something the document doesn't allow, or an error.
func brokenListNotes(_ context.Context, _ server.Caller, request notes.ListNotesRequest) (notes.ListNotesResult, error) {
	switch *request.Query.Q {
	case "fail":
		return notes.ListNotesResult{}, errHandler
	case "panic":
		panic(errHandler)
	case "abort":
		panic(http.ErrAbortHandler)
	case "none":
		return notes.ListNotesResult{}, nil
	case "both":
		return notes.ListNotesResult{OK: &notes.NoteList{Items: nil}, BadRequest: &notes.ApiError{Code: "", Message: ""}}, nil
	default:
		// null, where the document wants an array
		return notes.ListNotesResult{OK: &notes.NoteList{Items: nil}}, nil
	}
}

func TestHandlerAborts(t *testing.T) {
	t.Parallel()

	api := serve(t, withHandlers(stubHandlers{Handlers: nil, listNotes: brokenListNotes, createNote: nil}))

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, api.url+"/notes?q=abort", nil)
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Authorization", "Bearer "+aliceToken)

	// http.ErrAbortHandler drops the connection, as net/http does with it, and isn't reported as an error
	res, err := http.DefaultClient.Do(req)
	if err == nil {
		_ = res.Body.Close()
		t.Fatalf("answered %d", res.StatusCode)
	}

	if logged := api.errors.all(); len(logged) != 0 {
		t.Errorf("reported %v", logged)
	}
}

func TestHandlerErrors(t *testing.T) {
	t.Parallel()

	api := serve(t, withHandlers(stubHandlers{Handlers: nil, listNotes: brokenListNotes, createNote: nil}))

	for query, want := range map[string]string{
		"fail":  "handler failed",
		"panic": "handler panicked: handler failed",
		"none":  "listNotes answered 0, which the spec does not allow: openapi: invalid result: notes.ListNotesResult sets no response",
		"both":  "listNotes answered 0, which the spec does not allow: openapi: invalid result: notes.ListNotesResult sets more than one response",
		"null":  "listNotes answered 200, which the spec does not allow: body/items got null, want array",
	} {
		expectProblem(t, api.request(t, http.MethodGet, "/notes?q="+query, aliceToken, ""), http.StatusInternalServerError, "internal_error")

		logged := api.errors.all()
		if got := logged[len(logged)-1].Error(); got != want {
			t.Errorf("%s: %q", query, got)
		}
	}

	found := false

	for _, err := range api.errors.all() {
		var responseError *server.ResponseError
		if errors.As(err, &responseError) && responseError.Status == http.StatusOK && responseError.OperationID == "listNotes" {
			found = true
		}
	}

	if !found {
		t.Errorf("no ResponseError for the 200: %v", api.errors.all())
	}
}

func TestDatabaseErrors(t *testing.T) {
	t.Parallel()

	api := serve(t)
	note := api.createNote(t, aliceToken, "Kept", "")

	if _, err := api.pool.Exec(context.Background(), "DROP TABLE notes"); err != nil {
		t.Fatal(err)
	}

	expectProblem(t, api.request(t, http.MethodGet, "/notes", aliceToken, ""), http.StatusInternalServerError, "internal_error")
	expectProblem(t, api.request(t, http.MethodGet, "/notes/"+note.ID, aliceToken, ""), http.StatusInternalServerError, "internal_error")
	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, `{"title":"x","body":""}`),
		http.StatusInternalServerError, "internal_error")

	if logged := api.errors.all(); len(logged) != 3 {
		t.Fatalf("logged %v", logged)
	}
}

func TestListReadError(t *testing.T) {
	t.Parallel()

	api := serve(t)
	api.createNote(t, aliceToken, "Kept", "")

	// A row that can't be read: the column is no longer a timestamp
	if _, err := api.pool.Exec(context.Background(), "ALTER TABLE notes ALTER COLUMN created_at TYPE text"); err != nil {
		t.Fatal(err)
	}

	expectProblem(t, api.request(t, http.MethodGet, "/notes", aliceToken, ""), http.StatusInternalServerError, "internal_error")
}

func TestConfig(t *testing.T) {
	t.Parallel()

	pool := newDatabase(t)
	valid := server.Config{
		Handlers:           server.NewPostgresHandlers(pool),
		Authenticator:      server.NewStaticTokens(nil),
		IdempotencyStore:   newStore(t, pool),
		OnError:            func(error) {},
		ProtectedResource:  nil,
		IdempotencyOptions: nil,
	}

	for name, change := range map[string]func(config *server.Config){
		"no handlers":      func(config *server.Config) { config.Handlers = nil },
		"no authenticator": func(config *server.Config) { config.Authenticator = nil },
		"no store":         func(config *server.Config) { config.IdempotencyStore = nil },
		"no onError":       func(config *server.Config) { config.OnError = nil },
		"relative resource": func(config *server.Config) {
			config.ProtectedResource = &server.ProtectedResource{Resource: "/notes", AuthorizationServers: nil}
		},
		"unparsable resource": func(config *server.Config) {
			config.ProtectedResource = &server.ProtectedResource{Resource: "https://[", AuthorizationServers: nil}
		},
		"bad idempotency option": withIdempotency(idempotencykeys.WithTTL(-time.Second)),
	} {
		config := valid
		change(&config)

		if _, err := server.New(config); !errors.Is(err, server.ErrConfig) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

// failingBody fails to be read.
type failingBody struct{}

func (failingBody) Read([]byte) (int, error) {
	return 0, errReset
}

func TestBodyReadError(t *testing.T) {
	t.Parallel()

	for _, key := range []string{"", "k"} {
		var logged []error

		handler, err := server.New(server.Config{
			Handlers:           server.NewPostgresHandlers(nil),
			Authenticator:      server.NewStaticTokens([]server.StaticToken{{Token: aliceToken, Subject: "alice"}}),
			IdempotencyStore:   hookedStore{Store: nil, claimed: nil, complete: nil},
			OnError:            func(err error) { logged = append(logged, err) },
			ProtectedResource:  nil,
			IdempotencyOptions: nil,
		})
		if err != nil {
			t.Fatal(err)
		}

		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/notes", failingBody{})
		req.Header.Set("Authorization", "Bearer "+aliceToken)
		req.Header.Set("Content-Type", "application/json")

		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}

		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusInternalServerError || len(logged) != 1 {
			t.Errorf("key %q: %d %v", key, recorder.Code, logged)
		}
	}
}
