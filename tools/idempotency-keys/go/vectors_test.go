package idempotencykeys_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
)

type vectorResponse struct {
	Headers [][2]string `json:"headers"`
	Body    string      `json:"body"`
	Status  int         `json:"status"`
}

type vectorRequest struct {
	Operation *string     `json:"operation"`
	Scope     string      `json:"scope"`
	Key       string      `json:"key"`
	Method    string      `json:"method"`
	Target    string      `json:"target"`
	Body      string      `json:"body"`
	Headers   [][2]string `json:"headers"`
}

// step is one of a scenario's steps, as the vectors' README describes them: the name of its kind is the field set.
type step struct {
	Sleep    *int            `json:"sleep"`
	Response *vectorResponse `json:"response"`
	// Expect is an outcome, a respond result, or (for a release) a boolean
	Expect  any    `json:"expect"`
	Begin   string `json:"begin"`
	Start   string `json:"start"`
	Await   string `json:"await"`
	Respond string `json:"respond"`
	Release string `json:"release"`
	Request string `json:"request"`
}

type scenario struct {
	Options struct {
		TTLMs   *int64 `json:"ttlMs"`
		LeaseMs *int64 `json:"leaseMs"`
		WaitMs  *int64 `json:"waitMs"`
	} `json:"options"`
	Requests    map[string]vectorRequest `json:"requests"`
	Description string                   `json:"description"`
	Steps       []step                   `json:"steps"`
}

type testVectors struct {
	ValkeyScripts map[string]string `json:"valkeyScripts"`
	Keys          []struct {
		Key         *string  `json:"key"`
		Description string   `json:"description"`
		Header      []string `json:"header"`
		Error       bool     `json:"error"`
	} `json:"keys"`
	Identities []struct {
		Operation   *string `json:"operation"`
		Description string  `json:"description"`
		Scope       string  `json:"scope"`
		Key         string  `json:"key"`
		Identity    string  `json:"identity"`
	} `json:"identities"`
	Targets []struct {
		Raw    string `json:"raw"`
		Target string `json:"target"`
	} `json:"targets"`
	Fingerprints []struct {
		Description string      `json:"description"`
		Method      string      `json:"method"`
		Target      string      `json:"target"`
		Body        string      `json:"body"`
		Fingerprint string      `json:"fingerprint"`
		Headers     [][2]string `json:"headers"`
		Named       []string    `json:"named"`
	} `json:"fingerprints"`
	Scenarios []scenario `json:"scenarios"`
	Defaults  struct {
		TTLMs   int64 `json:"ttlMs"`
		LeaseMs int64 `json:"leaseMs"`
		WaitMs  int64 `json:"waitMs"`
	} `json:"defaults"`
}

// loadVectors reads the shared vectors by path: a released module can't require the unpublished vectors project.
func loadVectors(t *testing.T) testVectors {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("..", "test-vectors", "data", "test-vectors.json"))
	if err != nil {
		t.Fatal(err)
	}

	var vectors testVectors
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatal(err)
	}

	return vectors
}

// latin1 is the bytes of a header value as the vectors write it, one character per byte, as fetch gives them.
func latin1(t *testing.T, value string) string {
	t.Helper()

	bytes := make([]byte, 0, len(value))
	for _, char := range value {
		if char > 0xFF {
			t.Fatalf("%q is not a header value", value)
		}

		bytes = append(bytes, byte(char)) //nolint:gosec // At most 0xFF, as checked
	}

	return string(bytes)
}

func TestKeyVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range loadVectors(t).Keys {
		t.Run(vector.Description, func(t *testing.T) {
			t.Parallel()

			key, err := idempotencykeys.ParseKey(vector.Header)
			if vector.Error {
				var headerErr *idempotencykeys.KeyHeaderError
				if !errors.As(err, &headerErr) || !slices.Equal(headerErr.Values, vector.Header) {
					t.Fatalf("got %q, %v; want a KeyHeaderError", key, err)
				}

				return
			}

			want := ""
			if vector.Key != nil {
				want = *vector.Key
			}

			if err != nil || key != want {
				t.Fatalf("got %q, %v; want %q", key, err, want)
			}
		})
	}
}

func TestIdentityVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range loadVectors(t).Identities {
		t.Run(vector.Description, func(t *testing.T) {
			t.Parallel()

			identity := idempotencykeys.ComputeIdentity(idempotencykeys.IdentityInput{
				Operation: vector.Operation,
				Scope:     vector.Scope,
				Key:       vector.Key,
			})
			if identity != vector.Identity {
				t.Fatalf("got %s, want %s", identity, vector.Identity)
			}
		})
	}
}

func TestTargetVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range loadVectors(t).Targets {
		t.Run(vector.Raw, func(t *testing.T) {
			t.Parallel()

			if target := idempotencykeys.RequestTarget(vector.Raw); target != vector.Target {
				t.Fatalf("got %q, want %q", target, vector.Target)
			}
		})
	}
}

func TestFingerprintVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range loadVectors(t).Fingerprints {
		t.Run(vector.Description, func(t *testing.T) {
			t.Parallel()

			headers := make(http.Header)
			for _, header := range vector.Headers {
				headers.Add(header[0], latin1(t, header[1]))
			}

			fingerprint := idempotencykeys.ComputeFingerprint(idempotencykeys.FingerprintInput{
				Headers: headers,
				Method:  vector.Method,
				Target:  vector.Target,
				Named:   vector.Named,
				Body:    []byte(vector.Body),
			})
			if fingerprint != vector.Fingerprint {
				t.Fatalf("got %s, want %s", fingerprint, vector.Fingerprint)
			}
		})
	}
}

// The notifiers a scenario runs with, on top of its store.
type notifierCase struct {
	create func(t *testing.T) idempotencykeys.Notifier
	name   string
}

func notifierCases() []notifierCase {
	return []notifierCase{
		{create: func(*testing.T) idempotencykeys.Notifier { return nil }, name: "no notifier"},
		{
			create: func(t *testing.T) idempotencykeys.Notifier {
				t.Helper()

				return testEnv.postgresNotifier(t)
			},
			name: "Postgres LISTEN/NOTIFY",
		},
		{
			create: func(t *testing.T) idempotencykeys.Notifier {
				t.Helper()

				return testEnv.valkeyNotifier(t)
			},
			name: "Valkey pub/sub",
		},
	}
}

func TestScenarioVectors(t *testing.T) {
	t.Parallel()

	vectors := loadVectors(t)
	stores := []struct {
		create func(t *testing.T) idempotencykeys.Store
		name   string
	}{
		{
			create: func(t *testing.T) idempotencykeys.Store {
				t.Helper()

				return testEnv.postgresStore(t)
			},
			name: "Postgres store",
		},
		{create: func(*testing.T) idempotencykeys.Store { return testEnv.valkeyStore() }, name: "Valkey store"},
		{create: func(*testing.T) idempotencykeys.Store { return newMemoryStore() }, name: "example memory store"},
	}
	// Bounds the scenarios running at once, as each holds Postgres connections, which every test shares
	running := make(chan struct{}, 8)

	for _, store := range stores {
		t.Run(store.name, func(t *testing.T) {
			t.Parallel()

			for _, notifier := range notifierCases() {
				t.Run(notifier.name, func(t *testing.T) {
					t.Parallel()

					for _, scenario := range vectors.Scenarios {
						t.Run(scenario.Description, func(t *testing.T) {
							t.Parallel()

							running <- struct{}{}

							defer func() { <-running }()

							options := []idempotencykeys.Option{
								idempotencykeys.WithTTL(milliseconds(scenario.Options.TTLMs, vectors.Defaults.TTLMs)),
								idempotencykeys.WithLease(milliseconds(scenario.Options.LeaseMs, vectors.Defaults.LeaseMs)),
								idempotencykeys.WithWait(milliseconds(scenario.Options.WaitMs, vectors.Defaults.WaitMs)),
							}
							if created := notifier.create(t); created != nil {
								options = append(options, idempotencykeys.WithNotifier(created))
							}

							keys, err := idempotencykeys.New(store.create(t), options...)
							if err != nil {
								t.Fatal(err)
							}

							runScenario(t, scenario, keys)
						})
					}
				})
			}
		})
	}
}

func milliseconds(option *int64, fallback int64) time.Duration {
	if option != nil {
		return time.Duration(*option) * time.Millisecond
	}

	return time.Duration(fallback) * time.Millisecond
}

type started struct {
	result idempotencykeys.BeginResult
	err    error
}

// runScenario runs a scenario's steps in order, as the vectors' README describes, checking every expectation.
func runScenario(t *testing.T, scenario scenario, keys *idempotencykeys.Keys) {
	t.Helper()

	attempts := map[string]*idempotencykeys.Attempt{}
	pending := map[string]chan started{}

	for _, step := range scenario.Steps {
		switch {
		case step.Sleep != nil:
			time.Sleep(time.Duration(*step.Sleep) * time.Millisecond)
		case step.Start != "":
			done := make(chan started, 1)
			pending[step.Start] = done

			go func() {
				result, err := beginRequest(t, keys, scenario.Requests[step.Request])
				done <- started{result: result, err: err}
			}()
		case step.Begin != "":
			result, err := beginRequest(t, keys, scenario.Requests[step.Request])
			checkOutcome(t, step, result, err)

			attempts[step.Begin] = result.Attempt
		case step.Await != "":
			done := <-pending[step.Await]
			checkOutcome(t, step, done.result, done.err)

			attempts[step.Await] = done.result.Attempt
		default:
			endAttempt(t, step, attempts)
		}
	}
}

func beginRequest(t *testing.T, keys *idempotencykeys.Keys, request vectorRequest) (idempotencykeys.BeginResult, error) {
	t.Helper()

	operation := ""
	if request.Operation != nil {
		operation = *request.Operation
	}

	result, err := keys.Begin(t.Context(), idempotencykeys.BeginParams{
		Scope:     request.Scope,
		Operation: operation,
		Key:       request.Key,
		Fingerprint: idempotencykeys.ComputeFingerprint(idempotencykeys.FingerprintInput{
			Headers: headersOf(request.Headers),
			Method:  request.Method,
			Target:  request.Target,
			Named:   nil,
			Body:    []byte(request.Body),
		}),
	})
	if err != nil {
		return result, fmt.Errorf("begin %s: %w", request.Key, err)
	}

	return result, nil
}

// endAttempt runs a respond or release step.
func endAttempt(t *testing.T, step step, attempts map[string]*idempotencykeys.Attempt) {
	t.Helper()

	if step.Respond != "" {
		result, err := attempts[step.Respond].Respond(t.Context(), idempotencykeys.StoredResponse{
			Headers: step.Response.Headers,
			Body:    []byte(step.Response.Body),
			Status:  step.Response.Status,
		})
		if step.Expect == "error" {
			if !errors.Is(err, idempotencykeys.ErrUnsendableResponse) {
				t.Fatalf("respond %s: got %q, %v; want an unsendable response", step.Respond, result, err)
			}

			return
		}

		if err != nil || string(result) != step.Expect {
			t.Fatalf("respond %s: got %q, %v; want %v", step.Respond, result, err, step.Expect)
		}

		return
	}

	released, err := attempts[step.Release].Release(t.Context())
	if err != nil || released != step.Expect {
		t.Fatalf("release %s: got %v, %v; want %v", step.Release, released, err, step.Expect)
	}
}

func headersOf(pairs [][2]string) http.Header {
	headers := make(http.Header)
	for _, pair := range pairs {
		headers.Add(pair[0], pair[1])
	}

	return headers
}

func checkOutcome(t *testing.T, step step, result idempotencykeys.BeginResult, err error) {
	t.Helper()

	if err != nil || string(result.Outcome) != step.Expect {
		t.Fatalf("got %q, %v; want %v", result.Outcome, err, step.Expect)
	}

	if result.Outcome != idempotencykeys.OutcomeReplay {
		return
	}

	got := vectorResponse{
		Headers: result.Response.Headers,
		Body:    string(result.Response.Body),
		Status:  result.Response.Status,
	}
	if got.Status != step.Response.Status || got.Body != step.Response.Body ||
		!slices.Equal(got.Headers, step.Response.Headers) {
		t.Fatalf("replayed %+v, want %+v", got, *step.Response)
	}
}
