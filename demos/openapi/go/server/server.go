// Package server serves the notes API from its OpenAPI document: a route for every operation in the document (the
// same one TypeScript reads), each request and response validated against it, bearer tokens checked, and
// Idempotency-Keys kept on the same table as the TypeScript server's.
package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/openapi"
	"github.com/JacobLey/leyman/demos/openapi/spec"
)

// maxBodyBytes is larger than any body the document allows: a note is at most 10,200 characters, each at most 12
// bytes as JSON (an escaped surrogate pair). A larger body is refused before it is read, rather than read whole and
// then rejected.
const maxBodyBytes = 128 * 1024

// idempotencyKeyHeader is the header parameter that gives an operation idempotency keys.
const idempotencyKeyHeader = "Idempotency-Key"

// ProtectedResource says which authorization server issues tokens for the API (RFC 9728), so an OAuth client needs
// only the API's URL.
type ProtectedResource struct {
	// Resource is the API's URL, which is also the audience its tokens are issued for.
	Resource             string
	AuthorizationServers []string
}

// Config is what New serves the API with.
type Config struct {
	// Handlers answer each operation, e.g. PostgresHandlers.
	Handlers Handlers
	// Authenticator checks bearer tokens: StaticTokens, a JWTAuthenticator, or your own.
	Authenticator Authenticator
	// IdempotencyStore keeps the Idempotency-Keys of the operations that take one, e.g. idempotency-keys' Postgres
	// store on the database package's idempotency_keys table.
	IdempotencyStore idempotencykeys.Store
	// OnError is called with every error a request ends in (a 500): a handler that failed, or answered with
	// something the document doesn't allow, an authenticator that failed, or a store that did. Required.
	OnError func(err error)
	// ProtectedResource, when set, serves the API's Protected Resource Metadata, and points to it from every
	// WWW-Authenticate challenge.
	ProtectedResource *ProtectedResource
	// IdempotencyOptions are added to the keys' own: a notifier, or a shorter wait, say. Their answers to a request
	// they can't run are already the document's ApiError.
	IdempotencyOptions []idempotencykeys.Option
}

// apiError is the document's ApiError.
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// responder is a genever-go <Id>Result: the status and body of the one response it sets.
type responder interface {
	Response() (status int, body any, ok bool)
}

type dispatcher func(ctx context.Context, handlers Handlers, caller Caller, input []byte) (responder, error)

// dispatch decodes an operation's input, which already matched the document, into its handler's request type.
func dispatch[Request any, Result responder](call func(Handlers, context.Context, Caller, Request) (Result, error)) dispatcher {
	return func(ctx context.Context, handlers Handlers, caller Caller, input []byte) (responder, error) {
		var request Request
		if err := json.Unmarshal(input, &request); err != nil {
			return nil, fmt.Errorf("decoding the request: %w", err)
		}

		return recovering(func() (Result, error) { return call(handlers, ctx, caller, request) })
	}
}

// recovering calls a handler. One that panics is a 500 reported to OnError, like one that returns an error, rather
// than net/http's own recovery, which drops the connection without a response. http.ErrAbortHandler is net/http's way
// to drop it on purpose, so it is passed on.
//
//nolint:ireturn // The handler's own result type
func recovering[Result responder](call func() (Result, error)) (Result, error) {
	var (
		result Result
		err    error
	)

	func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				if recovered == http.ErrAbortHandler { //nolint:errorlint,err113 // net/http panics with this exact value
					panic(recovered)
				}

				err = &PanicError{Value: recovered}
			}
		}()

		result, err = call()
	}()

	return result, err
}

// dispatchers call each operation's handler, by operationId.
//
//nolint:gochecknoglobals // Never changed
var dispatchers = map[string]dispatcher{
	"listNotes":  dispatch(Handlers.ListNotes),
	"createNote": dispatch(Handlers.CreateNote),
	"getNote":    dispatch(Handlers.GetNote),
}

// route is one operation, ready to serve.
type route struct {
	dispatch   dispatcher
	operation  openapi.Operation
	validators validators
	// hasKey is whether the operation takes an Idempotency-Key header, and keyRequired whether it must.
	hasKey      bool
	keyRequired bool
}

type server struct {
	config Config
	keys   *idempotencykeys.Keys
	// metadata is where the API's Protected Resource Metadata is, or "" without it.
	metadata string
}

// New serves the notes API: a route for every operation in the document, each validated against it.
func New(config Config) (http.Handler, error) {
	return newHandler(config, spec.OpenAPI, openapi.Operations)
}

func newHandler(config Config, document []byte, operations []openapi.Operation) (http.Handler, error) {
	if config.Handlers == nil || config.Authenticator == nil || config.IdempotencyStore == nil || config.OnError == nil {
		return nil, fmt.Errorf("%w: Handlers, Authenticator, IdempotencyStore and OnError are required", ErrConfig)
	}

	srv := &server{config: config, keys: nil, metadata: ""}

	options := append([]idempotencykeys.Option{
		idempotencykeys.WithProblem(writeIdempotencyProblem),
		idempotencykeys.WithErrorHandler(srv.idempotencyError),
		// The caller got its response, and the key stays held until its lease runs out
		idempotencykeys.WithOnError(func(err error, _ string) { config.OnError(err) }),
	}, config.IdempotencyOptions...)

	keys, err := idempotencykeys.New(config.IdempotencyStore, options...)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrConfig, err)
	}

	srv.keys = keys

	routes, err := compileRoutes(document, operations)
	if err != nil {
		return nil, err
	}

	return srv.mux(routes, operations)
}

// mux routes each path of the document to its operations, the metadata to itself, and anything else to a 404.
func (s *server) mux(routes []*route, operations []openapi.Operation) (*http.ServeMux, error) {
	mux := http.NewServeMux()

	if resource := s.config.ProtectedResource; resource != nil {
		metadata, err := metadataURL(resource.Resource)
		if err != nil {
			return nil, err
		}

		s.metadata = metadata.String()
		mux.Handle(metadata.EscapedPath(), s.serveMetadata(operations))
	}

	byPath := map[string][]*route{}
	for _, compiled := range routes {
		byPath[compiled.operation.Path] = append(byPath[compiled.operation.Path], compiled)
	}

	for path, pathRoutes := range byPath {
		// Without a method, so a method the document doesn't have on the path is a 405 in the document's shape
		mux.Handle(path, s.servePath(pathRoutes))
	}

	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeProblem(w, http.StatusNotFound, "not_found", "No such path")
	}))

	return mux, nil
}

// compileRoutes compiles every operation's validators, with its handler.
func compileRoutes(document []byte, operations []openapi.Operation) ([]*route, error) {
	compiler, err := newCompiler(document)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrConfig, err)
	}

	routes := make([]*route, 0, len(operations))

	for _, operation := range operations {
		call, ok := dispatchers[operation.ID]
		if !ok {
			return nil, fmt.Errorf("%w: no handler for operation %s", ErrConfig, operation.ID)
		}

		compiled, err := compileOperation(compiler, operation)
		if err != nil {
			return nil, fmt.Errorf("%w: %w", ErrConfig, err)
		}

		// Header names are case-insensitive
		key := slices.IndexFunc(operation.Parameters, func(parameter openapi.Parameter) bool {
			return parameter.In == "header" && strings.EqualFold(parameter.Name, idempotencyKeyHeader)
		})

		routes = append(routes, &route{
			dispatch:    call,
			operation:   operation,
			validators:  compiled,
			hasKey:      key >= 0,
			keyRequired: key >= 0 && operation.Parameters[key].Required,
		})
	}

	return routes, nil
}

// metadataURL is where RFC 9728 puts a resource's metadata: /.well-known/oauth-protected-resource, before the
// resource's path (https://www.rfc-editor.org/rfc/rfc9728#section-3.1).
func metadataURL(resource string) (*url.URL, error) {
	parsed, err := url.Parse(resource)
	if err != nil || !parsed.IsAbs() {
		return nil, fmt.Errorf("%w: ProtectedResource.Resource %q is not an absolute URL", ErrConfig, resource)
	}

	path := parsed.Path
	if path == "/" {
		path = ""
	}

	parsed.Path = "/.well-known/oauth-protected-resource" + path
	parsed.RawPath = ""

	return parsed, nil
}

// encodeJSON is a value as JSON.stringify writes it: no HTML escaping, and no trailing newline.
func encodeJSON(value any) []byte {
	var buffer bytes.Buffer

	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value) //nolint:errchkjson // Only the document's types, and values decoded from JSON, which always encode

	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n"))
}

// writeJSON answers with a JSON body.
func writeJSON(writer http.ResponseWriter, status int, body []byte) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_, _ = writer.Write(body)
}

// writeProblem answers with an error, in the document's ApiError shape.
func writeProblem(writer http.ResponseWriter, status int, code, message string) {
	writeJSON(writer, status, encodeJSON(apiError{Code: code, Message: message}))
}

// idempotencyProblems are idempotency-keys' answers to a request it can't run, as the document's ApiError, with the
// statuses the document gives them: the same as the TypeScript server's idempotencyProblem.
//
//nolint:gochecknoglobals // Never changed
var idempotencyProblems = map[idempotencykeys.ProblemKind]struct {
	code, message string
	status        int
}{
	// The document never requires a key, so this is only reached by a document that changes it to
	idempotencykeys.ProblemMissingKey: {
		code: "invalid_request", message: "This operation requires an Idempotency-Key header", status: http.StatusBadRequest,
	},
	idempotencykeys.ProblemInvalidKey: {
		code:    "invalid_request",
		message: "The Idempotency-Key header must be one key of 1 to 255 printable ASCII characters",
		status:  http.StatusBadRequest,
	},
	idempotencykeys.ProblemConflict: {
		code:    "idempotency_key_in_use",
		message: "A request with this Idempotency-Key is still running: retry later",
		status:  http.StatusConflict,
	},
	idempotencykeys.ProblemMismatch: {
		code:    "idempotency_key_reused",
		message: "This Idempotency-Key was already used on a different request",
		status:  http.StatusUnprocessableEntity,
	},
}

func writeIdempotencyProblem(writer http.ResponseWriter, _ *http.Request, kind idempotencykeys.ProblemKind) {
	problem := idempotencyProblems[kind]
	writeProblem(writer, problem.status, problem.code, problem.message)
}

// idempotencyError answers a request idempotency-keys couldn't handle before it ran: its body was over the limit (a
// 413, as without a key), or the store failed (a 500).
func (s *server) idempotencyError(writer http.ResponseWriter, _ *http.Request, err error) {
	if tooLarge := new(http.MaxBytesError); errors.As(err, &tooLarge) {
		writeTooLarge(writer)

		return
	}

	s.internalError(writer, err)
}

func writeTooLarge(writer http.ResponseWriter) {
	writeProblem(writer, http.StatusRequestEntityTooLarge, "too_large", "The body is too large")
}

func (s *server) internalError(writer http.ResponseWriter, err error) {
	s.config.OnError(err)
	writeProblem(writer, http.StatusInternalServerError, "internal_error", "Internal error")
}

// metadataDocument is Protected Resource Metadata, with the members RFC 9728 names:
// https://www.rfc-editor.org/rfc/rfc9728#section-2
//
//nolint:tagliatelle // Named by the RFC
type metadataDocument struct {
	Resource               string   `json:"resource"`
	AuthorizationServers   []string `json:"authorization_servers"`
	ScopesSupported        []string `json:"scopes_supported"`
	BearerMethodsSupported []string `json:"bearer_methods_supported"`
}

// serveMetadata serves the API's Protected Resource Metadata, listing every scope an operation needs.
func (s *server) serveMetadata(operations []openapi.Operation) http.Handler {
	var scopes []string
	for _, operation := range operations {
		scopes = append(scopes, operation.Scopes...)
	}

	slices.Sort(scopes)

	body := encodeJSON(metadataDocument{
		Resource:               s.config.ProtectedResource.Resource,
		AuthorizationServers:   s.config.ProtectedResource.AuthorizationServers,
		ScopesSupported:        slices.Compact(scopes),
		BearerMethodsSupported: []string{"header"},
	})

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			writeProblem(writer, http.StatusNotFound, "not_found", "No such path")

			return
		}

		writeJSON(writer, http.StatusOK, body)
	})
}

// servePath serves a path's operations by method, HEAD as GET, and anything else as a 405 with Allow.
func (s *server) servePath(routes []*route) http.Handler {
	var allow []string

	for _, compiled := range routes {
		allow = append(allow, compiled.operation.Method)
		if compiled.operation.Method == http.MethodGet {
			allow = append(allow, http.MethodHead)
		}
	}

	allowed := strings.Join(allow, ", ")

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		method := request.Method
		if method == http.MethodHead {
			method = http.MethodGet
		}

		for _, compiled := range routes {
			if compiled.operation.Method == method {
				s.serveOperation(writer, request, compiled)

				return
			}
		}

		writer.Header().Set("Allow", allowed)
		writeProblem(writer, http.StatusMethodNotAllowed, "method_not_allowed", "Allowed: "+allowed)
	})
}

// serveOperation serves one operation, in the TypeScript server's order: authenticate, limit the body, hold the
// Idempotency-Key, then validate the request, call the handler, and validate the response.
func (s *server) serveOperation(writer http.ResponseWriter, request *http.Request, compiled *route) {
	// First, so a caller without a token learns nothing about what the operation accepts
	caller, ok := s.authenticate(writer, request, compiled.operation.Scopes)
	if !ok {
		return
	}

	if compiled.validators.body != nil {
		// Refused from its Content-Length, or once that much of a chunked body has arrived
		if request.ContentLength > maxBodyBytes {
			writeTooLarge(writer)

			return
		}

		request.Body = http.MaxBytesReader(writer, request.Body, maxBodyBytes)
	}

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { s.serve(w, r, compiled, caller) })
	if !compiled.hasKey {
		next(writer, request)

		return
	}

	// After authentication, so a key belongs to a known caller, and after the body limit, since the key's fingerprint
	// reads the whole body. Before validation, so a 400 is kept and replayed too
	s.keys.Handle(writer, request, idempotencykeys.HandleOptions{
		Scope:     caller.Subject,
		Operation: compiled.operation.ID,
		Required:  compiled.keyRequired,
	}, next)
}

var bearer = regexp.MustCompile(`^Bearer (\S+)$`)

// challenge is a WWW-Authenticate challenge, pointing to the API's metadata when it has some.
func (s *server) challenge(parameters ...string) string {
	if s.metadata != "" {
		parameters = append([]string{`resource_metadata="` + s.metadata + `"`}, parameters...)
	}

	if len(parameters) == 0 {
		return "Bearer"
	}

	return "Bearer " + strings.Join(parameters, ", ")
}

// authenticate answers unless the request has a bearer token the authenticator accepts for the scopes, as RFC 6750
// says (https://www.rfc-editor.org/rfc/rfc6750#section-3): a 401 without a token (WWW-Authenticate: Bearer) or with an
// invalid one (error="invalid_token"), and a 403 with a valid token that lacks a scope (error="insufficient_scope",
// naming every scope needed).
func (s *server) authenticate(writer http.ResponseWriter, request *http.Request, scopes []string) (Caller, bool) {
	match := bearer.FindStringSubmatch(request.Header.Get("Authorization"))
	if match == nil {
		writer.Header().Set("WWW-Authenticate", s.challenge())
		writeProblem(writer, http.StatusUnauthorized, "unauthorized", "A bearer token is required")

		return Caller{Subject: ""}, false
	}

	caller, err := s.config.Authenticator.Authenticate(request.Context(), match[1], scopes)

	switch {
	case err == nil:
		return caller, true
	case errors.Is(err, ErrInvalidToken):
		writer.Header().Set("WWW-Authenticate", s.challenge(`error="invalid_token"`))
		writeProblem(writer, http.StatusUnauthorized, "unauthorized", "The bearer token is not valid")
	case errors.Is(err, ErrInsufficientScope):
		needed := strings.Join(scopes, " ")
		writer.Header().Set("WWW-Authenticate", s.challenge(`error="insufficient_scope"`, `scope="`+needed+`"`))
		writeProblem(writer, http.StatusForbidden, "insufficient_scope", "The bearer token needs the scope "+needed)
	default:
		s.internalError(writer, err)
	}

	return Caller{Subject: ""}, false
}

// badRequestError is a request that doesn't match the document: a 400, saying why.
type badRequestError struct {
	message string
}

func (e *badRequestError) Error() string {
	return e.message
}

func badRequest(message string) error {
	return &badRequestError{message: message}
}

// readJSON reads the request's body as JSON. Every request body in the document is required, and JSON. It fails with
// a bad request when the body isn't JSON, a MaxBytesError when it's over the limit, or any other error when it
// couldn't be read.
func readJSON(request *http.Request) (json.RawMessage, any, error) {
	mediaType, _, _ := strings.Cut(request.Header.Get("Content-Type"), ";")
	// Media types are case-insensitive
	if !strings.EqualFold(strings.TrimSpace(mediaType), "application/json") {
		return nil, nil, badRequest("body must be application/json")
	}

	data, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("reading the body: %w", err)
	}

	value, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return nil, nil, badRequest("body is not valid JSON")
	}

	return data, value, nil
}

// parseQuery reads a query string as a browser's URLSearchParams does
// (https://url.spec.whatwg.org/#urlencoded-parsing), and Hono with it: pairs are split on & alone, so a ; is part of
// a value, + is a space, and a % without two hex digits after it is kept as it is
// (https://url.spec.whatwg.org/#percent-decode). url.ParseQuery would instead drop a pair with a ; or a bad escape.
// Each name keeps its first value, as Hono reads a repeated parameter. A pair without a name is left out, as Hono
// leaves it out, rather than refused as a parameter the operation doesn't have.
func parseQuery(raw string) map[string]string {
	values := map[string]string{}

	for pair := range strings.SplitSeq(raw, "&") {
		name, value, _ := strings.Cut(pair, "=")

		name = decodeQueryComponent(name)
		if name == "" {
			continue
		}

		if _, ok := values[name]; !ok {
			values[name] = decodeQueryComponent(value)
		}
	}

	return values
}

// decodeQueryComponent replaces + with a space, then percent-decodes, keeping a % that doesn't start an escape.
func decodeQueryComponent(text string) string {
	text = strings.ReplaceAll(text, "+", " ")
	if !strings.Contains(text, "%") {
		return text
	}

	decoded := make([]byte, 0, len(text))

	for index := 0; index < len(text); index++ {
		if text[index] == '%' && index+3 <= len(text) && isHex(text[index+1:index+3]) {
			octet, _ := strconv.ParseUint(text[index+1:index+3], 16, 8)
			decoded = append(decoded, byte(octet))
			index += 2

			continue
		}

		decoded = append(decoded, text[index])
	}

	return string(decoded)
}

// operationInput is what a handler's request type is decoded from: its parameters, coerced and with their defaults,
// and its body.
type operationInput struct {
	Path  map[string]any  `json:"path"`
	Query map[string]any  `json:"query"`
	Body  json.RawMessage `json:"body,omitempty"`
}

// readInput is the request's parameters and body, once they match the document. Path and query parameters arrive
// as strings, so they are coerced to their schemas' types, with their defaults filled in.
func readInput(request *http.Request, compiled *route) (operationInput, error) {
	operation := compiled.operation
	path := parameterValues(operation, "path", func(name string) (string, bool) {
		return request.PathValue(name), true
	})

	queryValues := parseQuery(request.URL.RawQuery)
	query := parameterValues(operation, "query", func(name string) (string, bool) {
		value, ok := queryValues[name]

		return value, ok
	})

	// Names the operation doesn't have, for validation to refuse
	for name, value := range queryValues {
		if _, ok := query[name]; !ok {
			query[name] = value
		}
	}

	if err := compiled.validators.path.Validate(path); err != nil {
		return operationInput{}, badRequest(describe("path", err))
	}

	if err := compiled.validators.query.Validate(query); err != nil {
		return operationInput{}, badRequest(describe("query", err))
	}

	input := operationInput{Path: path, Query: query, Body: nil}
	if compiled.validators.body == nil {
		return input, nil
	}

	data, value, err := readJSON(request)
	if err != nil {
		return operationInput{}, err
	}

	if err := compiled.validators.body.Validate(value); err != nil {
		return operationInput{}, badRequest(describe("body", err))
	}

	input.Body = data

	return input, nil
}

// serve validates the request, calls the operation's handler, and validates its response.
func (s *server) serve(writer http.ResponseWriter, request *http.Request, compiled *route, caller Caller) {
	input, err := readInput(request, compiled)
	if tooLarge := new(http.MaxBytesError); errors.As(err, &tooLarge) {
		writeTooLarge(writer)

		return
	}

	if bad := new(badRequestError); errors.As(err, &bad) {
		writeProblem(writer, http.StatusBadRequest, "invalid_request", bad.message)

		return
	}

	if err != nil {
		s.internalError(writer, err)

		return
	}

	result, err := compiled.dispatch(request.Context(), s.config.Handlers, caller, encodeJSON(input))
	if err != nil {
		s.internalError(writer, err)

		return
	}

	status, body, err := checkResponse(compiled, result)
	if err != nil {
		s.internalError(writer, err)

		return
	}

	writeJSON(writer, status, body)
}

// checkResponse is the status and JSON body of a handler's result, or a ResponseError when the document doesn't allow
// them.
func checkResponse(compiled *route, result responder) (int, []byte, error) {
	operation := compiled.operation

	status, body, answered := result.Response()
	if !answered {
		return 0, nil, &ResponseError{OperationID: operation.ID, Reason: "the result sets no response, or more than one", Status: 0}
	}

	schema, ok := compiled.validators.responses[status]
	if !ok {
		return 0, nil, &ResponseError{OperationID: operation.ID, Reason: "the status is not documented", Status: status}
	}

	data := encodeJSON(body)

	// Decoded back, as the document's schemas check JSON values, not Go's
	value, _ := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err := schema.Validate(value); err != nil {
		return 0, nil, &ResponseError{OperationID: operation.ID, Reason: describe("body", err), Status: status}
	}

	return status, data, nil
}
