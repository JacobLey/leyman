package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/openapi"
	"github.com/JacobLey/leyman/demos/openapi/go/notes"
	"github.com/JacobLey/leyman/demos/openapi/spec"
)

func TestEcmaRegexp(t *testing.T) {
	t.Parallel()

	for pattern, cases := range map[string]map[string]bool{
		`^[^\u0000]*$`: {"abc": true, "a\x00": false},
		`^é$`:          {"é": true, "e": false},
		`^\.$`:         {".": true, "a": false},
	} {
		compiled, err := ecmaRegexp(pattern)
		if err != nil {
			t.Fatalf("%s: %v", pattern, err)
		}

		for text, want := range cases {
			if got := compiled.MatchString(text); got != want {
				t.Errorf("%s on %q: %v", pattern, text, got)
			}
		}
	}
}

func TestEcmaRegexpErrors(t *testing.T) {
	t.Parallel()

	// As with Ajv's u flag, an escape that isn't one is an error
	for _, pattern := range []string{`^\uzzzz$`, `^\u12$`, `a\`} {
		if _, err := ecmaRegexp(pattern); err == nil {
			t.Errorf("%s compiled", pattern)
		}
	}
}

func TestCoerce(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		want  any
		text  string
		types []string
	}{
		{text: "5", types: nil, want: "5"},
		{text: "5", types: []string{"integer", "string"}, want: "5"},
		{text: "5", types: []string{"integer"}, want: json.Number("5")},
		{text: "1e2", types: []string{"integer"}, want: json.Number("100")},
		{text: "0b101", types: []string{"integer"}, want: json.Number("5")},
		{text: "0o17", types: []string{"integer"}, want: json.Number("15")},
		{text: "0xg", types: []string{"integer"}, want: "0xg"},
		{text: "\u00a05\ufeff", types: []string{"number"}, want: json.Number("5")},
		{text: " ", types: []string{"number"}, want: json.Number("0")},
		{text: "", types: []string{"number"}, want: ""},
		{text: "1.5", types: []string{"number"}, want: json.Number("1.5")},
		{text: "1e300", types: []string{"number"}, want: json.Number("1e+300")},
		{text: "1e999", types: []string{"number"}, want: "1e999"},
		{text: "true", types: []string{"boolean"}, want: true},
		{text: "false", types: []string{"boolean"}, want: false},
		{text: "yes", types: []string{"boolean"}, want: "yes"},
		{text: "", types: []string{"null"}, want: nil},
		{text: "x", types: []string{"null"}, want: "x"},
		{text: "x", types: []string{"integer", "null"}, want: "x"},
		{text: "{}", types: []string{"object"}, want: "{}"},
	} {
		if got := coerce(test.text, test.types); got != test.want {
			t.Errorf("%q as %v: %#v, want %#v", test.text, test.types, got, test.want)
		}
	}
}

func TestBadRequestError(t *testing.T) {
	t.Parallel()

	if err := badRequest("query/limit must be >= 1"); err.Error() != "query/limit must be >= 1" {
		t.Fatal(err)
	}
}

func TestDispatchDecodeError(t *testing.T) {
	t.Parallel()

	if _, err := dispatchers["getNote"](context.Background(), nil, Caller{Subject: "alice"}, []byte(`{"path":5}`)); err == nil {
		t.Fatal("decoded")
	}
}

// broken is the embedded document's operations, with one changed.
func broken(change func(operation *openapi.Operation)) []openapi.Operation {
	operations := make([]openapi.Operation, len(openapi.Operations))
	copy(operations, openapi.Operations)

	operation := operations[0]
	operation.Parameters = append([]openapi.Parameter(nil), operation.Parameters...)
	operation.Responses = map[int]string{}
	change(&operation)
	operations[0] = operation

	return operations
}

func TestCompileRoutesErrors(t *testing.T) {
	t.Parallel()

	missing := openapi.Parameter{Schema: openapi.SchemaInfo{Default: nil, Type: nil}, Name: "x", In: "", Pointer: "/nope", Required: false}

	for name, operations := range map[string][]openapi.Operation{
		"no handler": broken(func(operation *openapi.Operation) { operation.ID = "deleteNote" }),
		"twice":      append(broken(func(*openapi.Operation) {}), openapi.Operations[0]),
		"path": broken(func(operation *openapi.Operation) {
			missing.In = "path"
			operation.Parameters = append(operation.Parameters, missing)
		}),
		"query": broken(func(operation *openapi.Operation) {
			missing.In = "query"
			operation.Parameters = append(operation.Parameters, missing)
		}),
		"body":     broken(func(operation *openapi.Operation) { operation.BodyPointer = "/nope" }),
		"response": broken(func(operation *openapi.Operation) { operation.Responses[200] = "/nope" }),
	} {
		if _, err := compileRoutes(spec.OpenAPI, operations); !errors.Is(err, ErrConfig) {
			t.Errorf("%s: %v", name, err)
		}
	}

	if _, err := compileRoutes([]byte("{"), openapi.Operations); !errors.Is(err, ErrConfig) {
		t.Errorf("not JSON: %v", err)
	}

	config := Config{
		Handlers:           NewPostgresHandlers(nil),
		Authenticator:      NewStaticTokens(nil),
		IdempotencyStore:   nil,
		OnError:            func(error) {},
		ProtectedResource:  nil,
		IdempotencyOptions: nil,
	}
	// Never called: the document can't be compiled
	config.IdempotencyStore = struct{ idempotencykeys.Store }{Store: nil}

	if _, err := newHandler(config, []byte("{"), openapi.Operations); !errors.Is(err, ErrConfig) {
		t.Errorf("newHandler: %v", err)
	}
}

// teapot answers 418, whatever the operation.
type teapot struct{}

func (teapot) Response() (int, any, bool) {
	return http.StatusTeapot, notes.ApiError{Code: "teapot", Message: "I'm a teapot"}, true
}

func TestUndocumentedStatus(t *testing.T) {
	t.Parallel()

	routes, err := compileRoutes(spec.OpenAPI, openapi.Operations)
	if err != nil {
		t.Fatal(err)
	}

	// A result type answering a status the document doesn't give the operation, which genever-go never generates
	result := teapot{}

	var responseError *ResponseError

	_, _, err = checkResponse(routes[0], result)
	if !errors.As(err, &responseError) || responseError.Status != 418 || responseError.Reason != "the status is not documented" {
		t.Fatalf("error %v", err)
	}
}

// Each scope once, in the order the operations first name them, as the TypeScript server lists them.
func TestMetadataScopesOrder(t *testing.T) {
	t.Parallel()

	srv := &server{
		config:   Config{ProtectedResource: &ProtectedResource{Resource: "https://notes.example", AuthorizationServers: nil}}, //nolint:exhaustruct_v5 // Only the metadata
		keys:     nil,
		metadata: "",
	}
	recorder := httptest.NewRecorder()
	operations := []openapi.Operation{{Scopes: []string{"b", "a"}}, {Scopes: []string{"a", "c"}}} //nolint:exhaustruct_v5 // Only scopes
	srv.serveMetadata(operations).ServeHTTP(recorder, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))

	var metadata metadataDocument
	if err := json.Unmarshal(recorder.Body.Bytes(), &metadata); err != nil || fmt.Sprint(metadata.ScopesSupported) != "[b a c]" {
		t.Fatalf("%s %v", recorder.Body, err)
	}
}
