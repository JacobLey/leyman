// Package client calls the notes API: one method per operation, typed by the notes package that genever-go generated
// from the OpenAPI document, with each operation's method, path and statuses read from the same document at runtime,
// so a route can't drift from it.
package client

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
	"strings"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/openapi"
	"github.com/JacobLey/leyman/demos/openapi/go/notes"
)

// ErrOptions is Options that New can't use.
var ErrOptions = errors.New("client: invalid options")

// UnexpectedStatusError is a status the document doesn't give the operation, such as a 500. It is returned, rather
// than a result that would pretend to match a type.
type UnexpectedStatusError struct {
	OperationID string
	Status      int
}

func (e *UnexpectedStatusError) Error() string {
	return fmt.Sprintf("%s answered %d, which the spec does not document", e.OperationID, e.Status)
}

// TokenSource returns the bearer token for a request, so a token that expires can be refreshed. "" sends none.
type TokenSource func(ctx context.Context) (string, error)

// StaticToken is a TokenSource that always returns token.
func StaticToken(token string) TokenSource {
	return func(context.Context) (string, error) { return token, nil }
}

// Options configure New.
type Options struct {
	// HTTPClient makes the requests. http.DefaultClient when nil.
	HTTPClient *http.Client
	// Token is called before each request for its bearer token. Every operation needs one: set this, or an
	// HTTPClient whose transport adds one.
	Token TokenSource
	// BaseURL is where the API is served, e.g. http://localhost:3000. The document's paths are appended to its path.
	BaseURL string
}

// Client calls the notes API.
type Client struct {
	http    *http.Client
	token   TokenSource
	baseURL string
}

// New is a client for the API at options.BaseURL.
func New(options Options) (*Client, error) {
	base, err := url.Parse(options.BaseURL)
	if err != nil || !base.IsAbs() {
		return nil, fmt.Errorf("%w: BaseURL %q is not an absolute URL", ErrOptions, options.BaseURL)
	}

	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	return &Client{http: httpClient, token: options.Token, baseURL: strings.TrimSuffix(base.String(), "/")}, nil
}

// ListNotes calls listNotes: the caller's newest notes.
func (c *Client) ListNotes(ctx context.Context, input notes.ListNotesInput) (notes.ListNotesResult, error) {
	return call[notes.ListNotesResult](ctx, c, "listNotes", input)
}

// CreateNote calls createNote: add a note, as the caller's. Send the same Idempotency-Key with every retry of one
// note, and a new one for the next, so a retry can't add it twice.
func (c *Client) CreateNote(ctx context.Context, input notes.CreateNoteInput) (notes.CreateNoteResult, error) {
	return call[notes.CreateNoteResult](ctx, c, "createNote", input)
}

// GetNote calls getNote: one of the caller's notes.
func (c *Client) GetNote(ctx context.Context, input notes.GetNoteInput) (notes.GetNoteResult, error) {
	return call[notes.GetNoteResult](ctx, c, "getNote", input)
}

// input is an operation's input as genever-go's <Id>Input encodes it: each location's parameters, and the body.
type input struct {
	Path   map[string]any  `json:"path"`
	Query  map[string]any  `json:"query"`
	Header map[string]any  `json:"header"`
	Body   json.RawMessage `json:"body"`
}

var pathParameter = regexp.MustCompile(`\{(\w+)\}`)

// format is a parameter's value as text: a string as it is, a number or boolean as JSON writes it.
func format(value any) string {
	if text, ok := value.(string); ok {
		return text
	}

	data, _ := json.Marshal(value) //nolint:errchkjson // A number or boolean, from genever-go's types

	return string(data)
}

// request builds an operation's request from its input.
func (c *Client) request(ctx context.Context, operation openapi.Operation, operationInput any) (*http.Request, error) {
	var parsed input

	// Encoding and decoding genever-go's types, which always succeed
	encoded, _ := json.Marshal(operationInput) //nolint:errchkjson // genever-go's types always encode
	_ = json.Unmarshal(encoded, &parsed)

	path := pathParameter.ReplaceAllStringFunc(operation.Path, func(match string) string {
		return url.PathEscape(format(parsed.Path[match[1:len(match)-1]]))
	})

	query := url.Values{}
	for name, value := range parsed.Query {
		query.Set(name, format(value))
	}

	target := c.baseURL + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	var body io.Reader
	if parsed.Body != nil {
		body = bytes.NewReader(parsed.Body)
	}

	request, err := http.NewRequestWithContext(ctx, operation.Method, target, body)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", operation.ID, err)
	}

	request.Header.Set("Accept", "application/json")
	// OpenAPI ignores header parameters named Accept, Content-Type or Authorization, so none is overwritten below:
	// https://spec.openapis.org/oas/v3.1.0#fixed-fields-9
	for name, value := range parsed.Header {
		request.Header.Set(name, format(value))
	}

	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	if c.token != nil {
		token, err := c.token(ctx)
		if err != nil {
			return nil, fmt.Errorf("%s: getting a token: %w", operation.ID, err)
		}

		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
	}

	return request, nil
}

// result is a genever-go <Id>Result, which decodes a response into its field for the status.
type result[Result any] interface {
	*Result
	UnmarshalResponse(status int, data []byte) (bool, error)
}

// call calls an operation, and decodes its response into the result's field for its status.
//
//nolint:ireturn // The result type each method names
func call[Result any, Target result[Result]](
	ctx context.Context,
	notesClient *Client,
	operationID string,
	operationInput any,
) (Result, error) {
	var result Result

	operation, _ := openapi.ByID(operationID) // Each method names an operation of the document, as the tests check

	request, err := notesClient.request(ctx, operation, operationInput)
	if err != nil {
		return result, err
	}

	response, err := notesClient.http.Do(request)
	if err != nil {
		return result, fmt.Errorf("%s: %w", operationID, err)
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return result, fmt.Errorf("%s: reading the response: %w", operationID, err)
	}

	if _, documented := operation.Responses[response.StatusCode]; !documented {
		return result, &UnexpectedStatusError{OperationID: operationID, Status: response.StatusCode}
	}

	// genever-go generates a field for every status the document gives the operation
	if _, err := Target(&result).UnmarshalResponse(response.StatusCode, data); err != nil {
		return result, fmt.Errorf("%s: decoding the %d response: %w", operationID, response.StatusCode, err)
	}

	return result, nil
}
