package server_test

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"

	"github.com/JacobLey/leyman/demos/openapi/go/notes"
	"github.com/JacobLey/leyman/demos/openapi/go/server"
)

const dolly = `{"title":"Dolly","body":"A sheep"}`

var errStore = errors.New("store failed")

// hookedStore is a store with a hook after each Claim, and a Complete that may fail.
type hookedStore struct {
	idempotencykeys.Store

	claimed  func(result idempotencykeys.ClaimResult, err error) (idempotencykeys.ClaimResult, error)
	complete error
}

func (s hookedStore) Claim(ctx context.Context, params idempotencykeys.ClaimParams) (idempotencykeys.ClaimResult, error) {
	result, err := s.Store.Claim(ctx, params)
	if s.claimed != nil {
		return s.claimed(result, err)
	}

	return result, err //nolint:wrapcheck // The store's errors, as they are
}

func (s hookedStore) Complete(ctx context.Context, identity, token string, response idempotencykeys.StoredResponse) (bool, error) {
	if s.complete != nil {
		return false, s.complete
	}

	return s.Store.Complete(ctx, identity, token, response) //nolint:wrapcheck // The store's errors, as they are
}

func withStore(store hookedStore) configure {
	return func(config *server.Config) {
		store.Store = config.IdempotencyStore
		config.IdempotencyStore = store
	}
}

func TestRetryReplays(t *testing.T) {
	t.Parallel()

	api := serve(t)

	first := api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "one"})
	expectStatus(t, first, http.StatusCreated)

	if first.header.Get("Idempotent-Replayed") != "" {
		t.Fatal("the first request is replayed")
	}

	retry := api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "one"})
	expectStatus(t, retry, http.StatusCreated)

	if retry.body != first.body || retry.header.Get("Idempotent-Replayed") != "true" ||
		retry.header.Get("Content-Type") != "application/json" {
		t.Fatalf("retry %+v, first %+v", retry, first)
	}

	// Another caller's key is their own
	other := api.request(t, http.MethodPost, "/notes", bobToken, dolly, header{"Idempotency-Key", "one"})
	expectStatus(t, other, http.StatusCreated)

	if decode[notes.Note](t, other).ID == decode[notes.Note](t, first).ID {
		t.Fatal("bob got alice's note")
	}

	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, `{"title":"Other","body":""}`, header{"Idempotency-Key", "one"}),
		http.StatusUnprocessableEntity, "idempotency_key_reused")

	// A 400 is kept and replayed too, which is what the same request would get anyway
	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, `{}`, header{"Idempotency-Key", "two"}),
		http.StatusBadRequest, "invalid_request")

	res := api.request(t, http.MethodPost, "/notes", aliceToken, `{}`, header{"Idempotency-Key", "two"})
	expectProblem(t, res, http.StatusBadRequest, "invalid_request")

	if res.header.Get("Idempotent-Replayed") != "true" {
		t.Fatal("the 400 isn't replayed")
	}

	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", strings.Repeat("k", 256)}),
		http.StatusBadRequest, "invalid_request")

	// Without a key, each request adds a note
	api.createNote(t, aliceToken, "Dolly", "A sheep")
	api.createNote(t, aliceToken, "Dolly", "A sheep")

	list := decode[notes.NoteList](t, api.request(t, http.MethodGet, "/notes", aliceToken, ""))
	if len(list.Items) != 3 {
		t.Fatalf("%d notes", len(list.Items))
	}
}

// heldCreate holds createNote open until released, after saying it started.
func heldCreate(started chan<- struct{}, release <-chan struct{}) configure {
	return withHandlers(stubHandlers{
		Handlers:  nil,
		listNotes: nil,
		createNote: func(_ context.Context, _ server.Caller, request notes.CreateNoteRequest) (notes.CreateNoteResult, error) {
			started <- struct{}{}

			<-release

			return notes.CreateNoteResult{Created: &notes.Note{
				ID:        "01900000-0000-7000-8000-000000000000",
				Title:     request.Body.Title,
				Body:      request.Body.Body,
				CreatedAt: "2026-11-17T00:00:00.000Z",
			}}, nil
		},
	})
}

func TestDuplicateWaitsWhileRunning(t *testing.T) {
	t.Parallel()

	started := make(chan struct{}, 1)
	release := make(chan struct{})
	found := make(chan struct{}, 1)

	api := serve(t, heldCreate(started, release), withStore(hookedStore{
		Store: nil,
		claimed: func(result idempotencykeys.ClaimResult, err error) (idempotencykeys.ClaimResult, error) {
			// The duplicate found the key held: only now is the first let go, so nothing depends on timing
			if result.State == idempotencykeys.ClaimRunning {
				select {
				case found <- struct{}{}:
				default:
				}
			}

			return result, err
		},
		complete: nil,
	}))

	var (
		first response
		group sync.WaitGroup
	)

	group.Go(func() {
		first = api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "held"})
	})

	<-started

	go func() {
		<-found
		close(release)
	}()

	retry := api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "held"})

	group.Wait()
	expectStatus(t, first, http.StatusCreated)
	expectStatus(t, retry, http.StatusCreated)

	if retry.body != first.body || retry.header.Get("Idempotent-Replayed") != "true" {
		t.Fatalf("retry %+v, first %+v", retry, first)
	}
}

func TestDuplicateConflictsWithoutWaiting(t *testing.T) {
	t.Parallel()

	started := make(chan struct{}, 1)
	release := make(chan struct{})
	api := serve(t, heldCreate(started, release), withIdempotency(idempotencykeys.WithWait(0)))

	var (
		first response
		group sync.WaitGroup
	)

	group.Go(func() {
		first = api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "held"})
	})

	<-started
	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "held"}),
		http.StatusConflict, "idempotency_key_in_use")
	close(release)
	group.Wait()

	expectStatus(t, first, http.StatusCreated)
}

func TestStoreFailures(t *testing.T) {
	t.Parallel()

	api := serve(t, withStore(hookedStore{
		Store: nil,
		claimed: func(result idempotencykeys.ClaimResult, _ error) (idempotencykeys.ClaimResult, error) {
			return result, errStore
		},
		complete: nil,
	}))

	expectProblem(t, api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "k"}),
		http.StatusInternalServerError, "internal_error")

	if logged := api.errors.all(); len(logged) != 1 || !errors.Is(logged[0], errStore) {
		t.Fatalf("logged %v", logged)
	}

	// The response is still sent when it can't be stored, and the failure reported
	api = serve(t, withStore(hookedStore{Store: nil, claimed: nil, complete: errStore}))
	expectStatus(t, api.request(t, http.MethodPost, "/notes", aliceToken, dolly, header{"Idempotency-Key", "k"}), http.StatusCreated)

	if logged := api.errors.all(); len(logged) != 1 || !errors.Is(logged[0], errStore) {
		t.Fatalf("logged %v", logged)
	}
}
