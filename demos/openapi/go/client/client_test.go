package client_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JacobLey/leyman/tools/idempotency-keys/go/postgres"

	"github.com/JacobLey/leyman/demos/openapi/go/client"
	"github.com/JacobLey/leyman/demos/openapi/go/internal/pgtest"
	"github.com/JacobLey/leyman/demos/openapi/go/notes"
	"github.com/JacobLey/leyman/demos/openapi/go/server"
)

// schemaPath is the database package's schema.sql, read by path: project.json lists the package as an implicit
// dependency.
const schemaPath = "../../database/schema.sql"

var errNoToken = errors.New("no token")

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

// serve serves the Go server in-process, on a database of the test's own, accepting the token "alice-token".
func serve(t *testing.T) string {
	t.Helper()

	ctx := context.Background()

	database, err := template.Clone(ctx)
	if err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, database.URL)
	if err != nil {
		t.Fatal(err)
	}

	store, err := postgres.NewStore(pool, postgres.StoreOptions{Table: ""})
	if err != nil {
		t.Fatal(err)
	}

	handler, err := server.New(server.Config{
		Handlers:           server.NewPostgresHandlers(pool),
		Authenticator:      server.NewStaticTokens([]server.StaticToken{{Token: "alice-token", Subject: "alice"}}),
		IdempotencyStore:   store,
		OnError:            func(err error) { t.Error(err) },
		ProtectedResource:  nil,
		IdempotencyOptions: nil,
	})
	if err != nil {
		t.Fatal(err)
	}

	httpServer := httptest.NewServer(handler)

	t.Cleanup(func() {
		httpServer.Close()
		pool.Close()

		if err := template.Drop(ctx, database); err != nil {
			t.Error(err)
		}
	})

	return httpServer.URL
}

func newClient(t *testing.T, options client.Options) *client.Client {
	t.Helper()

	notesClient, err := client.New(options)
	if err != nil {
		t.Fatal(err)
	}

	return notesClient
}

func TestCreateNote(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := newClient(t, client.Options{HTTPClient: nil, Token: client.StaticToken("alice-token"), BaseURL: serve(t) + "/"})

	created, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{
		Body:   notes.NewNote{Title: "Dolly", Body: "A sheep"},
		Header: &notes.CreateNoteInputHeader{IdempotencyKey: new("dolly")},
	})
	if err != nil || created.Created == nil || created.Created.Title != "Dolly" {
		t.Fatalf("created %+v %v", created, err)
	}

	// A retry with the key is the same note
	retried, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{
		Body:   notes.NewNote{Title: "Dolly", Body: "A sheep"},
		Header: &notes.CreateNoteInputHeader{IdempotencyKey: new("dolly")},
	})
	if err != nil || *retried.Created != *created.Created {
		t.Fatalf("retried %+v %v", retried, err)
	}
}

func TestGetNote(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := newClient(t, client.Options{HTTPClient: nil, Token: client.StaticToken("alice-token"), BaseURL: serve(t)})

	created, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{Body: notes.NewNote{Title: "Dolly", Body: ""}, Header: nil})
	if err != nil {
		t.Fatal(err)
	}

	got, err := notesClient.GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: created.Created.ID}})
	if err != nil || *got.OK != *created.Created {
		t.Fatalf("got %+v %v", got, err)
	}

	missing, err := notesClient.GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: "01900000-0000-7000-8000-000000000000"}})
	if err != nil || missing.NotFound == nil || missing.NotFound.Code != "not_found" {
		t.Fatalf("missing %+v %v", missing, err)
	}

	// Escaped, so the slash stays in the parameter, which isn't a UUID
	escaped, err := notesClient.GetNote(ctx, notes.GetNoteInput{Path: notes.GetNoteInputPath{NoteID: "a/b"}})
	if err != nil || escaped.BadRequest == nil {
		t.Fatalf("escaped %+v %v", escaped, err)
	}
}

func TestListNotes(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := newClient(t, client.Options{HTTPClient: nil, Token: client.StaticToken("alice-token"), BaseURL: serve(t)})

	created, err := notesClient.CreateNote(ctx, notes.CreateNoteInput{Body: notes.NewNote{Title: "Dolly", Body: ""}, Header: nil})
	if err != nil {
		t.Fatal(err)
	}

	listed, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: &notes.ListNotesInputQuery{Q: new("dol"), Limit: new(int64(1))}})
	if err != nil || len(listed.OK.Items) != 1 || listed.OK.Items[0] != *created.Created {
		t.Fatalf("listed %+v %v", listed, err)
	}

	invalid, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: &notes.ListNotesInputQuery{Q: nil, Limit: new(int64(0))}})
	if err != nil || invalid.BadRequest == nil || invalid.BadRequest.Code != "invalid_request" {
		t.Fatalf("invalid %+v %v", invalid, err)
	}
}

func TestTokens(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	url := serve(t)

	for name, token := range map[string]client.TokenSource{
		"none":  nil,
		"empty": client.StaticToken(""),
		"wrong": client.StaticToken("wrong"),
	} {
		result, err := newClient(t, client.Options{HTTPClient: nil, Token: token, BaseURL: url}).ListNotes(ctx, notes.ListNotesInput{Query: nil})
		if err != nil || result.Unauthorized == nil {
			t.Errorf("%s: %+v %v", name, result, err)
		}
	}

	calls := 0
	refreshed := newClient(t, client.Options{HTTPClient: nil, BaseURL: url, Token: func(context.Context) (string, error) {
		calls++

		return "alice-token", nil
	}})

	for range 2 {
		if result, err := refreshed.ListNotes(ctx, notes.ListNotesInput{Query: nil}); err != nil || result.OK == nil {
			t.Fatalf("%+v %v", result, err)
		}
	}

	if calls != 2 {
		t.Fatalf("token called %d times", calls)
	}

	failing := newClient(t, client.Options{HTTPClient: nil, BaseURL: url, Token: func(context.Context) (string, error) {
		return "", errNoToken
	}})
	if _, err := failing.ListNotes(ctx, notes.ListNotesInput{Query: nil}); !errors.Is(err, errNoToken) {
		t.Fatalf("token error: %v", err)
	}
}

func TestBasePath(t *testing.T) {
	t.Parallel()

	var path string

	httpServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		path = request.URL.RequestURI()

		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"items":[]}`))
	}))
	t.Cleanup(httpServer.Close)

	for _, base := range []string{httpServer.URL + "/api", httpServer.URL + "/api/"} {
		notesClient := newClient(t, client.Options{HTTPClient: httpServer.Client(), Token: nil, BaseURL: base})

		result, err := notesClient.ListNotes(context.Background(), notes.ListNotesInput{Query: &notes.ListNotesInputQuery{Q: new("a b"), Limit: nil}})
		if err != nil || result.OK == nil || path != "/api/notes?q=a+b" {
			t.Errorf("%s: %s %+v %v", base, path, result, err)
		}
	}
}

func TestResponseFailures(t *testing.T) {
	t.Parallel()

	httpServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Query().Get("q") {
		case "500":
			writer.WriteHeader(http.StatusInternalServerError)
		case "not-json":
			_, _ = writer.Write([]byte("<html>"))
		default:
			// Promises more than it sends
			writer.Header().Set("Content-Length", "100")
			_, _ = writer.Write([]byte("{"))
		}
	}))
	t.Cleanup(httpServer.Close)

	ctx := context.Background()
	notesClient := newClient(t, client.Options{HTTPClient: nil, Token: nil, BaseURL: httpServer.URL})
	list := func(q string) error {
		_, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: &notes.ListNotesInputQuery{Q: new(q), Limit: nil}})

		return err //nolint:wrapcheck // The client's error, as it is
	}

	var unexpected *client.UnexpectedStatusError
	if err := list("500"); !errors.As(err, &unexpected) || unexpected.Status != 500 || unexpected.OperationID != "listNotes" ||
		err.Error() != "listNotes answered 500, which the spec does not document" {
		t.Errorf("500: %v", err)
	}

	for _, q := range []string{"not-json", "short"} {
		if err := list(q); err == nil {
			t.Errorf("%s: no error", q)
		}
	}
}

func TestRequestFailures(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	notesClient := newClient(t, client.Options{HTTPClient: nil, Token: nil, BaseURL: "http://127.0.0.1:1"})

	if _, err := notesClient.ListNotes(ctx, notes.ListNotesInput{Query: nil}); err == nil {
		t.Error("reached nothing")
	}

	var noContext context.Context
	if _, err := notesClient.ListNotes(noContext, notes.ListNotesInput{Query: nil}); err == nil {
		t.Error("nil context")
	}

	for _, base := range []string{"/relative", "http://[::1"} {
		if _, err := client.New(client.Options{HTTPClient: nil, Token: nil, BaseURL: base}); !errors.Is(err, client.ErrOptions) {
			t.Errorf("%q: %v", base, err)
		}
	}
}
