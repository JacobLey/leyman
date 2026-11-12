package idempotencykeys_test

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
)

var errStoreDown = errors.New("store is down")

// failingStore runs a store's operations, failing those that are set to.
type failingStore struct {
	idempotencykeys.Store

	failClaim    bool
	failComplete bool
	failRelease  bool
}

func (s failingStore) Claim(
	ctx context.Context,
	params idempotencykeys.ClaimParams,
) (idempotencykeys.ClaimResult, error) {
	if s.failClaim {
		return idempotencykeys.ClaimResult{}, errStoreDown
	}

	return s.Store.Claim(ctx, params) //nolint:wrapcheck // The store's errors, as they are
}

func (s failingStore) Complete(
	ctx context.Context,
	identity, token string,
	response idempotencykeys.StoredResponse,
) (bool, error) {
	if s.failComplete {
		return false, errStoreDown
	}

	return s.Store.Complete(ctx, identity, token, response) //nolint:wrapcheck // The store's errors, as they are
}

func (s failingStore) Release(ctx context.Context, identity, token string) (bool, error) {
	if s.failRelease {
		return false, errStoreDown
	}

	return s.Store.Release(ctx, identity, token) //nolint:wrapcheck // The store's errors, as they are
}

// failingNotifier subscribes through a notifier, and fails to publish.
type failingNotifier struct {
	idempotencykeys.Notifier
}

func (failingNotifier) Publish(context.Context, string) error {
	return errStoreDown
}

func newKeys(t *testing.T, store idempotencykeys.Store, options ...idempotencykeys.Option) *idempotencykeys.Keys {
	t.Helper()

	keys, err := idempotencykeys.New(store, options...)
	if err != nil {
		t.Fatal(err)
	}

	return keys
}

func params() idempotencykeys.BeginParams {
	return idempotencykeys.BeginParams{Scope: "user_1", Operation: "createNote", Key: "k", Fingerprint: strings.Repeat("ab", 32)}
}

func begin(t *testing.T, keys *idempotencykeys.Keys, params idempotencykeys.BeginParams) idempotencykeys.BeginResult {
	t.Helper()

	result, err := keys.Begin(t.Context(), params)
	if err != nil {
		t.Fatal(err)
	}

	return result
}

func TestNew(t *testing.T) {
	t.Parallel()

	store := testEnv.valkeyStore()

	for name, options := range map[string][]idempotencykeys.Option{
		"a ttl of 0":                  {idempotencykeys.WithTTL(0)},
		"a lease of 0":                {idempotencykeys.WithLease(0)},
		"a negative wait":             {idempotencykeys.WithWait(-time.Millisecond)},
		"a ttl of part of a ms":       {idempotencykeys.WithTTL(time.Hour + time.Microsecond)},
		"a lease not below the ttl":   {idempotencykeys.WithTTL(time.Second), idempotencykeys.WithLease(time.Second)},
		"a lease of part of a ms":     {idempotencykeys.WithLease(1500 * time.Microsecond)},
		"a wait of part of a ms":      {idempotencykeys.WithWait(time.Microsecond)},
		"a lease above a shorter ttl": {idempotencykeys.WithTTL(time.Second), idempotencykeys.WithLease(time.Minute)},
	} {
		t.Run("rejects "+name, func(t *testing.T) {
			t.Parallel()

			if _, err := idempotencykeys.New(store, options...); !errors.Is(err, idempotencykeys.ErrOption) {
				t.Fatalf("got %v, want an OptionError", err)
			}
		})
	}
}

func TestNewRejectsANilStore(t *testing.T) {
	t.Parallel()

	_, err := idempotencykeys.New(nil)

	var optionErr *idempotencykeys.OptionError
	if !errors.As(err, &optionErr) || optionErr.Option != "store" {
		t.Fatalf("got %v, want an OptionError for the store", err)
	}
}

func TestNewNamesTheOptionAndValueInTheError(t *testing.T) {
	t.Parallel()

	_, err := idempotencykeys.New(testEnv.valkeyStore(), idempotencykeys.WithWait(-time.Second))
	if err == nil || err.Error() != "idempotency-keys: invalid option wait -1s: must be a whole number of milliseconds of at least 0s" {
		t.Fatalf("got %v", err)
	}
}

func TestNewAcceptsAWaitOf0(t *testing.T) {
	t.Parallel()

	newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithWait(0))
}

func TestDefaultRespondPolicy(t *testing.T) {
	t.Parallel()

	for status, want := range map[int]idempotencykeys.Action{
		http.StatusOK:                  idempotencykeys.ActionComplete,
		http.StatusCreated:             idempotencykeys.ActionComplete,
		http.StatusBadRequest:          idempotencykeys.ActionComplete,
		http.StatusTooManyRequests:     idempotencykeys.ActionRelease,
		http.StatusInternalServerError: idempotencykeys.ActionComplete,
		http.StatusServiceUnavailable:  idempotencykeys.ActionComplete,
	} {
		response := idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: status}
		if got := idempotencykeys.DefaultRespondPolicy(response); got != want {
			t.Errorf("%d: got %s, want %s", status, got, want)
		}
	}
}

func TestBegin(t *testing.T) {
	t.Parallel()

	for name, params := range map[string]idempotencykeys.BeginParams{
		"an empty scope":       {Scope: "", Operation: "", Key: "k", Fingerprint: ""},
		"an empty key":         {Scope: "user_1", Operation: "", Key: "", Fingerprint: ""},
		"a scope not UTF-8":    {Scope: "user\xff", Operation: "", Key: "k", Fingerprint: ""},
		"an operation not UTF": {Scope: "user_1", Operation: "create\xff", Key: "k", Fingerprint: ""},
		"a key not UTF-8":      {Scope: "user_1", Operation: "", Key: "k\xff", Fingerprint: ""},
	} {
		t.Run("rejects "+name, func(t *testing.T) {
			t.Parallel()

			keys := newKeys(t, testEnv.valkeyStore())
			if _, err := keys.Begin(t.Context(), params); !errors.Is(err, idempotencykeys.ErrOption) {
				t.Fatalf("got %v, want an OptionError", err)
			}
		})
	}
}

func TestBeginFailsWhenTheStoreDoes(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, failingStore{Store: testEnv.valkeyStore(), failClaim: true, failComplete: false, failRelease: false})
	if _, err := keys.Begin(t.Context(), params()); !errors.Is(err, errStoreDown) {
		t.Fatalf("got %v, want the store's error", err)
	}
}

func TestBeginStopsWaitingWhenItsContextEnds(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore())
	begin(t, keys, params())

	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()

	if _, err := keys.Begin(ctx, params()); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("got %v, want the context's error", err)
	}
}

func TestBeginIsWokenByANotificationBeforeItsNextPoll(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithNotifier(testEnv.valkeyNotifier(t)))
	first := begin(t, keys, params())

	done := make(chan idempotencykeys.BeginResult)

	go func() {
		result, _ := keys.Begin(context.Background(), params())
		done <- result
	}()

	// Long enough for the polls to back off past a second
	time.Sleep(1600 * time.Millisecond)

	respondedAt := time.Now()

	if _, err := first.Attempt.Respond(t.Context(), response(http.StatusCreated, "created")); err != nil {
		t.Fatal(err)
	}

	if result := <-done; result.Outcome != idempotencykeys.OutcomeReplay {
		t.Fatalf("got %s, want a replay", result.Outcome)
	}

	if waited := time.Since(respondedAt); waited > 500*time.Millisecond {
		t.Fatalf("waited %s after the response", waited)
	}
}

func TestBeginTreatsAnEmptyOperationAsNone(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithWait(0))
	without := params()
	without.Operation = ""
	begin(t, keys, without)

	other := without
	other.Fingerprint = strings.Repeat("cd", 32)

	if result := begin(t, keys, other); result.Outcome != idempotencykeys.OutcomeMismatch {
		t.Fatalf("got %s, want a mismatch", result.Outcome)
	}
}

func response(status int, body string) idempotencykeys.StoredResponse {
	return idempotencykeys.StoredResponse{Headers: nil, Body: []byte(body), Status: status}
}

func TestAttempt(t *testing.T) {
	t.Parallel()

	for name, unsendable := range map[string]idempotencykeys.StoredResponse{
		"a status below 200": response(http.StatusSwitchingProtocols, ""),
		"a status above 599": response(600, ""),
		"a body with a 204":  response(http.StatusNoContent, "x"),
		"a body with a 205":  response(http.StatusResetContent, "x"),
		"a body with a 304":  response(http.StatusNotModified, "x"),
		"a status of 0":      response(0, ""),
		"a negative status":  response(-1, ""),
	} {
		t.Run("fails on "+name, func(t *testing.T) {
			t.Parallel()

			// A store that fails every operation, so one the attempt reached would fail differently
			store := failingStore{Store: testEnv.valkeyStore(), failClaim: false, failComplete: true, failRelease: true}
			keys := newKeys(t, store, idempotencykeys.WithWait(0), idempotencykeys.WithRespondPolicy(
				func(idempotencykeys.StoredResponse) idempotencykeys.Action {
					t.Error("the policy was asked")

					return idempotencykeys.ActionComplete
				},
			))
			attempt := begin(t, keys, params()).Attempt

			if result, err := attempt.Respond(t.Context(), unsendable); !errors.Is(err, idempotencykeys.ErrUnsendableResponse) ||
				result != "" {
				t.Fatalf("got %s, %v", result, err)
			}

			if result := begin(t, keys, params()); result.Outcome != idempotencykeys.OutcomeConflict {
				t.Fatalf("got %s, want the key still held", result.Outcome)
			}
		})
	}
}

func TestAttemptStoresHeadersInLowerCaseWithoutThoseAServerRecomputes(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore())
	attempt := begin(t, keys, params()).Attempt

	if len(attempt.Identity()) != 64 {
		t.Fatalf("identity %q", attempt.Identity())
	}

	stored, err := attempt.Respond(t.Context(), idempotencykeys.StoredResponse{
		Headers: [][2]string{
			{"Content-Type", "text/plain"},
			{"Content-Length", "2"},
			{"Transfer-Encoding", "chunked"},
			{"Connection", "close"},
			{"Keep-Alive", "timeout=5"},
			{"Idempotent-Replayed", "true"},
			{"X-Name", "caf\xe9"},
		},
		Body:   []byte("hi"),
		Status: http.StatusOK,
	})
	if err != nil || stored != idempotencykeys.RespondStored {
		t.Fatalf("got %s, %v", stored, err)
	}

	replay := begin(t, keys, params()).Response
	if want := [][2]string{{"content-type", "text/plain"}, {"x-name", "caf\xe9"}}; len(replay.Headers) != 2 ||
		replay.Headers[0] != want[0] || replay.Headers[1] != want[1] {
		t.Fatalf("got %q", replay.Headers)
	}
}

func TestAttemptStoresANilBodyAsEmpty(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.postgresStore(t))
	attempt := begin(t, keys, params()).Attempt

	if result, err := attempt.Respond(t.Context(), response(http.StatusNoContent, "")); err != nil ||
		result != idempotencykeys.RespondStored {
		t.Fatalf("got %s, %v", result, err)
	}

	replay := begin(t, keys, params()).Response
	if replay.Body == nil || len(replay.Body) != 0 {
		t.Fatalf("got %q", replay.Body)
	}
}

func TestAttemptReleasesByACustomPolicy(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, testEnv.valkeyStore(), idempotencykeys.WithRespondPolicy(
		func(response idempotencykeys.StoredResponse) idempotencykeys.Action {
			if response.Status >= http.StatusInternalServerError {
				return idempotencykeys.ActionRelease
			}

			return idempotencykeys.ActionComplete
		},
	))
	attempt := begin(t, keys, params()).Attempt

	if result, err := attempt.Respond(t.Context(), response(http.StatusBadGateway, "")); err != nil ||
		result != idempotencykeys.RespondReleased {
		t.Fatalf("got %s, %v", result, err)
	}

	if again, err := attempt.Respond(t.Context(), response(http.StatusBadGateway, "")); err != nil ||
		again != idempotencykeys.RespondLost {
		t.Fatalf("got %s, %v", again, err)
	}
}

func TestAttemptFailsWhenTheStoreFailsToComplete(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, failingStore{Store: testEnv.valkeyStore(), failClaim: false, failComplete: true, failRelease: false})
	attempt := begin(t, keys, params()).Attempt

	if _, err := attempt.Respond(t.Context(), response(http.StatusOK, "")); !errors.Is(err, errStoreDown) {
		t.Fatalf("got %v", err)
	}
}

func TestAttemptFailsWhenTheStoreFailsToRelease(t *testing.T) {
	t.Parallel()

	keys := newKeys(t, failingStore{Store: testEnv.valkeyStore(), failClaim: false, failComplete: false, failRelease: true})
	attempt := begin(t, keys, params()).Attempt

	if _, err := attempt.Release(t.Context()); !errors.Is(err, errStoreDown) {
		t.Fatalf("got %v", err)
	}

	if _, err := attempt.Respond(t.Context(), response(http.StatusTooManyRequests, "")); !errors.Is(err, errStoreDown) {
		t.Fatalf("got %v", err)
	}
}

func TestAttemptReportsAFailedAnnouncementAndStillEndsTheAttempt(t *testing.T) {
	t.Parallel()

	var reported []string

	keys := newKeys(t, testEnv.valkeyStore(),
		idempotencykeys.WithNotifier(failingNotifier{Notifier: testEnv.valkeyNotifier(t)}),
		idempotencykeys.WithOnError(func(err error, identity string) {
			if !errors.Is(err, errStoreDown) {
				t.Errorf("reported %v", err)
			}

			reported = append(reported, identity)
		}),
	)
	attempt := begin(t, keys, params()).Attempt

	if result, err := attempt.Respond(t.Context(), response(http.StatusOK, "")); err != nil ||
		result != idempotencykeys.RespondStored {
		t.Fatalf("got %s, %v", result, err)
	}

	if len(reported) != 1 || reported[0] != attempt.Identity() {
		t.Fatalf("reported %q", reported)
	}
}

func TestErrors(t *testing.T) {
	t.Parallel()

	headerErr := &idempotencykeys.KeyHeaderError{Values: []string{"a", "b"}}
	if headerErr.Error() != `idempotency-keys: invalid Idempotency-Key header: ["a" "b"]` {
		t.Errorf("got %s", headerErr)
	}

	if !errors.Is(headerErr, idempotencykeys.ErrKeyHeader) || errors.Is(headerErr, idempotencykeys.ErrOption) {
		t.Error("a KeyHeaderError is only ErrKeyHeader")
	}

	optionErr := &idempotencykeys.OptionError{Value: "", Option: "scope", Reason: "must not be empty"}
	if optionErr.Error() != `idempotency-keys: invalid option scope "": must not be empty` {
		t.Errorf("got %s", optionErr)
	}

	if !errors.Is(optionErr, idempotencykeys.ErrOption) || errors.Is(optionErr, idempotencykeys.ErrKeyHeader) {
		t.Error("an OptionError is only ErrOption")
	}

	keys := newKeys(t, testEnv.valkeyStore())
	_, unsendableErr := begin(t, keys, params()).Attempt.Respond(t.Context(), response(http.StatusNoContent, "x"))

	if unsendableErr == nil || unsendableErr.Error() != "idempotency-keys: unsendable response: status 204 with a 1-byte body" {
		t.Errorf("got %v", unsendableErr)
	}
}
