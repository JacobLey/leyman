package idempotencykeys

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"maps"
	"net/http"
	"slices"
	"strings"
)

// ProblemKind is why [Keys.Handle] answered a request itself.
type ProblemKind string

const (
	// ProblemMissingKey is a request without a key, for an operation that requires one: a 400.
	ProblemMissingKey ProblemKind = "missing-key"
	// ProblemInvalidKey is an Idempotency-Key header that can't be read: a 400.
	ProblemInvalidKey ProblemKind = "invalid-key"
	// ProblemConflict is a request whose key is still running, after waiting for it ran out: a 409.
	ProblemConflict ProblemKind = "conflict"
	// ProblemMismatch is a key used on a different request: a 422.
	ProblemMismatch ProblemKind = "mismatch"
)

// ProblemWriter answers a request with a problem.
type ProblemWriter func(w http.ResponseWriter, r *http.Request, kind ProblemKind)

// ErrorHandler answers a request that [Keys.Handle] couldn't handle, before it ran: its body couldn't be read, or the
// store failed, so it never runs unprotected.
type ErrorHandler func(w http.ResponseWriter, r *http.Request, err error)

// WithProblem answers each problem of [Keys.Handle]. [WriteProblem] by default.
func WithProblem(problem ProblemWriter) Option {
	return func(k *Keys) { k.problem = problem }
}

// WithErrorHandler answers a request that [Keys.Handle] couldn't handle. By default, a body over an
// [net/http.MaxBytesReader]'s limit is a 413 problem document, and any other error a 500.
func WithErrorHandler(handler ErrorHandler) Option {
	return func(k *Keys) { k.errorHandler = handler }
}

// HandleOptions identify a request's key in [Keys.Handle].
type HandleOptions struct {
	// Scope is who is calling: a user or tenant id. Not empty.
	Scope string
	// Operation is which operation the request is for, e.g. an OpenAPI operationId, or "" for none.
	Operation string
	// Required is whether a request without a key is a 400. Otherwise it runs as it would without the library.
	Required bool
}

type problemDocument struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	Status int    `json:"status"`
}

// problem is a problem document with no type of its own, so its title is its status's, as RFC 9110 names it:
// https://www.rfc-editor.org/rfc/rfc9457#section-4.2.1
func problem(status int, title, detail string) problemDocument {
	return problemDocument{Type: "about:blank", Title: title, Detail: detail, Status: status}
}

// WriteProblem is the default answer to each problem: an RFC 9457 problem document
// (https://www.rfc-editor.org/rfc/rfc9457), with the status code the IETF draft gives
// (https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07).
func WriteProblem(writer http.ResponseWriter, _ *http.Request, kind ProblemKind) {
	var document problemDocument

	switch kind {
	case ProblemMissingKey:
		document = problem(http.StatusBadRequest, "Bad Request", "This operation requires an Idempotency-Key header.")
	case ProblemInvalidKey:
		document = problem(
			http.StatusBadRequest,
			"Bad Request",
			"The Idempotency-Key header must be one key of 1 to 255 printable ASCII characters, or a Structured Field String holding one.",
		)
	case ProblemConflict:
		document = problem(http.StatusConflict, "Conflict", "A request with this Idempotency-Key is still being processed.")
	case ProblemMismatch:
		document = problem(http.StatusUnprocessableEntity, "Unprocessable Content", "This Idempotency-Key was already used on a different request.")
	}

	writeProblemDocument(writer, document)
}

func writeProblemDocument(writer http.ResponseWriter, document problemDocument) {
	writer.Header().Set("Content-Type", "application/problem+json")
	writer.WriteHeader(document.Status)
	_ = json.NewEncoder(writer).Encode(document) //nolint:errchkjson // A failed write is the client's, with no one to tell
}

func defaultErrorHandler(writer http.ResponseWriter, _ *http.Request, err error) {
	if tooLarge := new(http.MaxBytesError); errors.As(err, &tooLarge) {
		writeProblemDocument(writer, problem(http.StatusRequestEntityTooLarge, "Content Too Large", "The request body is too large."))

		return
	}

	writeProblemDocument(writer, problem(http.StatusInternalServerError, "Internal Server Error", "The request could not be handled."))
}

// Middleware is [Keys.Handle] as net/http middleware, with each request's options from options (its scope from
// authentication that ran before it, its operation from its route).
func (k *Keys) Middleware(options func(r *http.Request) HandleOptions) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			k.Handle(w, r, options(r), next)
		})
	}
}

// Handle serves a request: it reads its Idempotency-Key header, runs next at most once per key, and stores its
// response by the respond policy. A replay has the header Idempotent-Replayed: true.
//
// The fingerprint is the method, the request target ([RequestTarget] of the raw target, so "/a/../notes" and "/notes"
// are one), the headers named by [WithFingerprintHeaders] (Host from the request's Host), and the body. Handle reads
// the whole body, and next gets it unread, so put a body-size limit ([net/http.MaxBytesReader]) before it.
//
// next writes to a recorder, so its response is buffered and sent once it returns: it can't flush, hijack the
// connection, or send informational (1xx) responses. Go's Header is a map, so its response headers are stored by name
// in byte order, each name's values in order.
//
// A request without a key runs as is, unless Required. When next panics, the attempt doesn't end: its lease runs out,
// and a later request with the key runs. When the store fails to complete or release the response, it is still
// sent, and the failure goes to the [WithOnError] hook.
func (k *Keys) Handle(writer http.ResponseWriter, request *http.Request, options HandleOptions, next http.Handler) {
	values := request.Header.Values("Idempotency-Key")
	if len(values) == 0 {
		if options.Required {
			k.problem(writer, request, ProblemMissingKey)
		} else {
			next.ServeHTTP(writer, request)
		}

		return
	}

	key, err := ParseKey(values)
	if err != nil {
		k.problem(writer, request, ProblemInvalidKey)

		return
	}

	var body []byte
	if request.Body != nil {
		body, err = io.ReadAll(request.Body)
		if err != nil {
			k.errorHandler(writer, request, err)

			return
		}
	}

	k.handleKey(writer, request, BeginParams{
		Scope:       options.Scope,
		Operation:   options.Operation,
		Key:         key,
		Fingerprint: k.fingerprint(request, body),
	}, body, next)
}

func (k *Keys) handleKey(
	writer http.ResponseWriter,
	request *http.Request,
	params BeginParams,
	body []byte,
	next http.Handler,
) {
	result, err := k.Begin(request.Context(), params)
	if err != nil {
		k.errorHandler(writer, request, err)

		return
	}

	switch result.Outcome {
	case OutcomeReplay:
		writeReplay(writer, *result.Response)
	case OutcomeConflict:
		k.problem(writer, request, ProblemConflict)
	case OutcomeMismatch:
		k.problem(writer, request, ProblemMismatch)
	case OutcomeRun:
		k.run(writer, request, result.Attempt, body, next)
	}
}

func (k *Keys) run(writer http.ResponseWriter, request *http.Request, attempt *Attempt, body []byte, next http.Handler) {
	run := request.WithContext(request.Context())
	run.Body = io.NopCloser(bytes.NewReader(body))
	recorder := &recorder{header: make(http.Header), sent: nil, body: bytes.Buffer{}, status: 0}
	next.ServeHTTP(recorder, run)
	response := recorder.response()

	// The request ran, so storing its response doesn't depend on its caller still waiting for it
	if _, err := attempt.Respond(context.WithoutCancel(request.Context()), response); err != nil {
		k.onError(err, attempt.Identity())
	}

	maps.Copy(writer.Header(), recorder.sent)
	writer.WriteHeader(response.Status)
	_, _ = writer.Write(response.Body)
}

func (k *Keys) fingerprint(request *http.Request, body []byte) string {
	headers := request.Header
	// Go moves Host out of the headers, where fetch's Request has it
	if slices.ContainsFunc(k.fingerprintHeaders, func(name string) bool { return strings.EqualFold(name, "host") }) {
		headers = headers.Clone()
		headers.Set("Host", request.Host)
	}

	target := request.RequestURI
	if target == "" {
		// A request built for a handler, not read by a server
		target = request.URL.RequestURI()
	}

	return ComputeFingerprint(FingerprintInput{
		Headers: headers,
		Method:  request.Method,
		Target:  RequestTarget(target),
		Named:   k.fingerprintHeaders,
		Body:    body,
	})
}

func writeReplay(writer http.ResponseWriter, response StoredResponse) {
	header := writer.Header()
	for _, pair := range response.Headers {
		header.Add(pair[0], pair[1])
	}

	header.Set("Idempotent-Replayed", "true")
	writer.WriteHeader(response.Status)
	_, _ = writer.Write(response.Body)
}

// recorder buffers a handler's response, as [Keys.Handle] stores it before sending it.
type recorder struct {
	header http.Header
	// sent is the header when the response was written, as a server sends it: later changes aren't sent
	sent   http.Header
	body   bytes.Buffer
	status int
}

func (rec *recorder) Header() http.Header {
	return rec.header
}

func (rec *recorder) WriteHeader(status int) {
	// Informational responses can't be replayed, and a server takes only the first final status
	if rec.status != 0 || (status >= http.StatusContinue && status < http.StatusOK) {
		return
	}

	rec.status = status
	rec.sent = rec.header.Clone()
}

func (rec *recorder) Write(data []byte) (int, error) {
	rec.WriteHeader(http.StatusOK)
	_, _ = rec.body.Write(data) // Never fails: it panics when out of memory

	return len(data), nil
}

func (rec *recorder) response() StoredResponse {
	rec.WriteHeader(http.StatusOK)
	names := slices.SortedFunc(maps.Keys(rec.sent), func(a, b string) int {
		return strings.Compare(strings.ToLower(a), strings.ToLower(b))
	})

	var headers [][2]string

	for _, name := range names {
		for _, value := range rec.sent[name] {
			headers = append(headers, [2]string{name, value})
		}
	}

	return StoredResponse{Headers: headers, Body: rec.body.Bytes(), Status: rec.status}
}
