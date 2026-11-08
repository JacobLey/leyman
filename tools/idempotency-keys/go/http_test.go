package idempotencykeys_test

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
)

func handleOptions() idempotencykeys.HandleOptions {
	return idempotencykeys.HandleOptions{Scope: "user_1", Operation: "createNote", Required: false}
}

// createNote is a handler that counts its runs, and answers with the body it read.
type createNote struct {
	runs   atomic.Int32
	status int
}

func (h *createNote) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	h.runs.Add(1)

	body, _ := io.ReadAll(request.Body)

	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Add("Set-Cookie", "a=1")
	writer.Header().Add("Set-Cookie", "b=2")

	status := h.status
	if status == 0 {
		status = http.StatusCreated
	}

	writer.WriteHeader(status)
	_, _ = writer.Write(body)
}

func newRequest(t *testing.T, target, key, body string) *http.Request {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, target, strings.NewReader(body))
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}

	return request
}

func serve(keys *idempotencykeys.Keys, request *http.Request, options idempotencykeys.HandleOptions, next http.Handler) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	keys.Handle(recorder, request, options, next)

	return recorder
}

func problemOf(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	if recorder.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("got %q", recorder.Header().Get("Content-Type"))
	}

	var document map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &document); err != nil {
		t.Fatal(err)
	}

	if document["type"] != "about:blank" || document["status"] != float64(recorder.Code) {
		t.Fatalf("got %v", document)
	}

	return document
}

func TestHandleRunsARequestWithoutAKeyAsItIs(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, testEnv.valkeyStore())

	for range 2 {
		if recorder := serve(keys, newRequest(t, "/notes", "", "{}"), handleOptions(), handler); recorder.Code != http.StatusCreated {
			t.Fatalf("got %d", recorder.Code)
		}
	}

	if handler.runs.Load() != 2 {
		t.Fatalf("ran %d times", handler.runs.Load())
	}
}

func TestHandleAnswersARequestWithoutAKeyWithA400WhenOneIsRequired(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	required := handleOptions()
	required.Required = true

	recorder := serve(newKeys(t, testEnv.valkeyStore()), newRequest(t, "/notes", "", "{}"), required, handler)
	if recorder.Code != http.StatusBadRequest || handler.runs.Load() != 0 {
		t.Fatalf("got %d, ran %d times", recorder.Code, handler.runs.Load())
	}

	if problemOf(t, recorder)["detail"] != "This operation requires an Idempotency-Key header." {
		t.Fatalf("got %s", recorder.Body)
	}
}

func TestHandleAnswersAKeyItCantReadWithA400(t *testing.T) {
	t.Parallel()

	request := newRequest(t, "/notes", "a", "{}")
	request.Header.Add("Idempotency-Key", "b")

	recorder := serve(newKeys(t, testEnv.valkeyStore()), request, handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})
	if recorder.Code != http.StatusBadRequest || problemOf(t, recorder)["title"] != "Bad Request" {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body)
	}
}

func TestHandleRunsARequestOnceAndReplaysItsResponseMarkedIdempotentReplayed(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, testEnv.postgresStore(t))

	first := serve(keys, newRequest(t, "/notes", "k1", `{"title":"Hi"}`), handleOptions(), handler)
	if first.Code != http.StatusCreated || first.Body.String() != `{"title":"Hi"}` || first.Header().Get("Idempotent-Replayed") != "" {
		t.Fatalf("got %d %s %v", first.Code, first.Body, first.Header())
	}

	replay := serve(keys, newRequest(t, "/notes", "k1", `{"title":"Hi"}`), handleOptions(), handler)
	if replay.Code != http.StatusCreated || replay.Body.String() != `{"title":"Hi"}` ||
		replay.Header().Get("Content-Type") != "application/json" ||
		strings.Join(replay.Header().Values("Set-Cookie"), ";") != "a=1;b=2" ||
		strings.Join(replay.Header().Values("Idempotent-Replayed"), ";") != "true" {
		t.Fatalf("got %d %s %v", replay.Code, replay.Body, replay.Header())
	}

	if handler.runs.Load() != 1 {
		t.Fatalf("ran %d times", handler.runs.Load())
	}
}

func TestHandleHashesAnAbsoluteFormTargetAsItsOriginForm(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, testEnv.valkeyStore())

	serve(keys, newRequest(t, "/a/../notes?", "k1", "{}"), handleOptions(), handler)

	replay := serve(keys, newRequest(t, "http://example.com/notes", "k1", "{}"), handleOptions(), handler)
	if replay.Header().Get("Idempotent-Replayed") != "true" {
		t.Fatalf("got %d %v", replay.Code, replay.Header())
	}
}

func TestHandleTakesTheTargetFromTheURLOfARequestNoServerRead(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, testEnv.valkeyStore())

	serve(keys, newRequest(t, "/notes?draft=1", "k1", "{}"), handleOptions(), handler)

	request := newRequest(t, "/notes?draft=1", "k1", "{}")
	request.RequestURI = ""

	if replay := serve(keys, request, handleOptions(), handler); replay.Header().Get("Idempotent-Replayed") != "true" {
		t.Fatalf("got %d %v", replay.Code, replay.Header())
	}
}

func TestHandleRunsAgainAfterA429(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: http.StatusTooManyRequests}
	keys := newKeys(t, testEnv.valkeyStore())

	for range 2 {
		if recorder := serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), handler); recorder.Code != http.StatusTooManyRequests {
			t.Fatalf("got %d", recorder.Code)
		}
	}

	if handler.runs.Load() != 2 {
		t.Fatalf("ran %d times", handler.runs.Load())
	}
}

func TestHandleAnswersAKeyReusedOnADifferentBodyWithA422(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore())
	serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})

	recorder := serve(keys, newRequest(t, "/notes", "k1", "{ }"), handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})
	if recorder.Code != http.StatusUnprocessableEntity || problemOf(t, recorder)["title"] != "Unprocessable Content" {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body)
	}
}

func TestHandleAnswersADuplicateOfARunningRequestWithA409(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithWait(0))
	running := make(chan struct{})
	release := make(chan struct{})
	done := make(chan struct{})

	go func() {
		defer close(done)

		serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			close(running)
			<-release
		}))
	}()

	<-running

	recorder := serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})
	if recorder.Code != http.StatusConflict || problemOf(t, recorder)["title"] != "Conflict" {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body)
	}

	close(release)
	<-done
}

func TestHandleFingerprintsTheHeadersItNamesHostIncludedAndNoOthers(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithFingerprintHeaders("X-Tenant", "host"))

	request := func(tenant, trace, host string) *http.Request {
		r := newRequest(t, "/notes", "k1", "{}")
		r.Header.Set("X-Tenant", tenant)
		r.Header.Set("X-Trace", trace)
		r.Host = host

		return r
	}

	serve(keys, request("t1", "a", "example.com"), handleOptions(), handler)

	if recorder := serve(keys, request("t1", "b", "example.com"), handleOptions(), handler); recorder.Code != http.StatusCreated ||
		recorder.Header().Get("Idempotent-Replayed") != "true" {
		t.Fatalf("another trace: got %d", recorder.Code)
	}

	if recorder := serve(keys, request("t2", "a", "example.com"), handleOptions(), handler); recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("another tenant: got %d", recorder.Code)
	}

	if recorder := serve(keys, request("t1", "a", "example.org"), handleOptions(), handler); recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("another host: got %d", recorder.Code)
	}
}

func TestHandleFingerprintsARequestAsTheSpecDoes(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithFingerprintHeaders("content-type"))
	request := newRequest(t, "/notes", "k1", `{"title":"Hi","body":"There"}`)
	request.Header.Set("Content-Type", "application/json")
	serve(keys, request, handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})

	for _, vector := range loadVectors(t).Fingerprints {
		if vector.Description != "a named header" {
			continue
		}

		result := begin(t, keys, idempotencykeys.BeginParams{
			Scope:       handleOptions().Scope,
			Operation:   handleOptions().Operation,
			Key:         "k1",
			Fingerprint: vector.Fingerprint,
		})
		if result.Outcome != idempotencykeys.OutcomeReplay {
			t.Fatalf("got %s", result.Outcome)
		}
	}
}

func TestHandlePassesTheRequestToNextWithItsBodyUnread(t *testing.T) {
	t.Parallel()

	var got string

	serve(newKeys(t, testEnv.valkeyStore()), newRequest(t, "/notes", "k1", "the body"), handleOptions(),
		http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
			body, _ := io.ReadAll(request.Body)
			got = string(body)
		}))

	if got != "the body" {
		t.Fatalf("got %q", got)
	}
}

func TestHandleHandlesARequestWithoutABody(t *testing.T) {
	t.Parallel()

	request := newRequest(t, "/notes", "k1", "")
	request.Body = nil

	if recorder := serve(newKeys(t, testEnv.valkeyStore()), request, handleOptions(), &createNote{runs: atomic.Int32{}, status: 0}); recorder.Code != http.StatusCreated {
		t.Fatalf("got %d", recorder.Code)
	}
}

func TestHandleSendsTheResponseAsWrittenAndStoresIt(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore())
	next := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("X-Before", "1")
		writer.WriteHeader(http.StatusEarlyHints)
		writer.WriteHeader(http.StatusAccepted)
		writer.WriteHeader(http.StatusTeapot)
		// Sent too late
		writer.Header().Set("X-After", "1")
		_, _ = writer.Write([]byte("accepted"))
	})

	for _, recorder := range []*httptest.ResponseRecorder{
		serve(keys, newRequest(t, "/notes", "k1", ""), handleOptions(), next),
		serve(keys, newRequest(t, "/notes", "k1", ""), handleOptions(), next),
	} {
		if recorder.Code != http.StatusAccepted || recorder.Body.String() != "accepted" ||
			recorder.Header().Get("X-Before") != "1" || recorder.Header().Get("X-After") != "" {
			t.Fatalf("got %d %s %v", recorder.Code, recorder.Body, recorder.Header())
		}
	}
}

func TestHandleSendsA200ForAHandlerThatWritesNothing(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore())
	next := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("X-Empty", "1")
	})

	for range 2 {
		recorder := serve(keys, newRequest(t, "/notes", "k1", ""), handleOptions(), next)
		if recorder.Code != http.StatusOK || recorder.Body.Len() != 0 || recorder.Header().Get("X-Empty") != "1" {
			t.Fatalf("got %d %s %v", recorder.Code, recorder.Body, recorder.Header())
		}
	}
}

func TestHandleReturnsTheResponseWhenTheStoreFailsToStoreItAndReportsWhy(t *testing.T) {
	t.Parallel()

	var reported []error

	keys := newKeys(t, failingStore{Store: testEnv.valkeyStore(), failClaim: false, failComplete: true, failRelease: false},
		idempotencykeys.WithOnError(func(err error, _ string) { reported = append(reported, err) }))

	recorder := serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})
	if recorder.Code != http.StatusCreated || len(reported) != 1 || !errors.Is(reported[0], errStoreDown) {
		t.Fatalf("got %d, reported %v", recorder.Code, reported)
	}
}

func TestHandleAnswersA500WhenTheStoreFailsBeforeRunning(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, failingStore{Store: testEnv.valkeyStore(), failClaim: true, failComplete: false, failRelease: false})

	recorder := serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), handler)
	if recorder.Code != http.StatusInternalServerError || handler.runs.Load() != 0 ||
		problemOf(t, recorder)["title"] != "Internal Server Error" {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body)
	}
}

func TestHandleAnswersA413ForABodyOverItsLimit(t *testing.T) {
	t.Parallel()

	request := newRequest(t, "/notes", "k1", "too long")
	recorder := httptest.NewRecorder()
	request.Body = http.MaxBytesReader(recorder, request.Body, 3)

	newKeys(t, testEnv.valkeyStore()).Handle(recorder, request, handleOptions(), &createNote{runs: atomic.Int32{}, status: 0})

	if recorder.Code != http.StatusRequestEntityTooLarge || problemOf(t, recorder)["title"] != "Content Too Large" {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body)
	}
}

func TestHandleAnswersEachProblemAndErrorItsOwnWayWhenGivenOne(t *testing.T) {
	t.Parallel()

	var kinds []idempotencykeys.ProblemKind

	var handled []error

	keys := newKeys(t, failingStore{Store: testEnv.valkeyStore(), failClaim: true, failComplete: false, failRelease: false},
		idempotencykeys.WithProblem(func(writer http.ResponseWriter, _ *http.Request, kind idempotencykeys.ProblemKind) {
			kinds = append(kinds, kind)

			writer.WriteHeader(http.StatusTeapot)
		}),
		idempotencykeys.WithErrorHandler(func(writer http.ResponseWriter, _ *http.Request, err error) {
			handled = append(handled, err)

			writer.WriteHeader(http.StatusServiceUnavailable)
		}),
	)

	if recorder := serve(keys, newRequest(t, "/notes", `"`, "{}"), handleOptions(), http.NotFoundHandler()); recorder.Code != http.StatusTeapot {
		t.Fatalf("got %d", recorder.Code)
	}

	if recorder := serve(keys, newRequest(t, "/notes", "k1", "{}"), handleOptions(), http.NotFoundHandler()); recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", recorder.Code)
	}

	if len(kinds) != 1 || kinds[0] != idempotencykeys.ProblemInvalidKey || len(handled) != 1 || !errors.Is(handled[0], errStoreDown) {
		t.Fatalf("got %v, %v", kinds, handled)
	}
}

func TestHandleServesAsMiddleware(t *testing.T) {
	t.Parallel()

	handler := &createNote{runs: atomic.Int32{}, status: 0}
	keys := newKeys(t, testEnv.valkeyStore())
	server := keys.Middleware(func(request *http.Request) idempotencykeys.HandleOptions {
		return idempotencykeys.HandleOptions{Scope: request.Header.Get("X-User"), Operation: "", Required: true}
	})(handler)

	for _, user := range []string{"user_1", "user_1", "user_2"} {
		request := newRequest(t, "/notes", "k1", "{}")
		request.Header.Set("X-User", user)
		server.ServeHTTP(httptest.NewRecorder(), request)
	}

	if handler.runs.Load() != 2 {
		t.Fatalf("ran %d times", handler.runs.Load())
	}
}

func TestWriteProblem(t *testing.T) {
	t.Parallel()

	for kind, status := range map[idempotencykeys.ProblemKind]int{
		idempotencykeys.ProblemMissingKey: http.StatusBadRequest,
		idempotencykeys.ProblemInvalidKey: http.StatusBadRequest,
		idempotencykeys.ProblemConflict:   http.StatusConflict,
		idempotencykeys.ProblemMismatch:   http.StatusUnprocessableEntity,
	} {
		recorder := httptest.NewRecorder()
		idempotencykeys.WriteProblem(recorder, nil, kind)

		if recorder.Code != status {
			t.Errorf("%s: got %d", kind, recorder.Code)
		}

		problemOf(t, recorder)
	}
}
