// Package openapi reads the notes API's operations from its OpenAPI document, which the spec module embeds, so the
// server's routes and the client's calls come from the same document as TypeScript's, and can't drift from it.
package openapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/JacobLey/leyman/demos/openapi/spec"
)

// ErrDocument is a document this package can't read: not JSON, or an operation it doesn't support.
var ErrDocument = errors.New("openapi: unsupported document")

// Parameter is one of an operation's parameters, with the JSON Pointer of its schema in the document.
type Parameter struct {
	// Schema is the parameter's schema, as written in the document.
	Schema SchemaInfo
	Name   string
	// In is where it is sent: "path", "query", "header" or "cookie".
	In string
	// Pointer is the JSON Pointer of its schema in the document, e.g. "/paths/~1notes/get/parameters/1/schema".
	Pointer  string
	Required bool
}

// SchemaInfo is what the server reads of a parameter's schema itself, to coerce the strings parameters arrive as.
type SchemaInfo struct {
	// Default is the schema's default, or nil without one.
	Default json.RawMessage `json:"default"`
	// Type is the schema's type keyword: a name, a list of names, or nil without one.
	Type json.RawMessage `json:"type"`
}

// Types is the schema's types, from its type keyword: one name or a list. Nil without one.
func (s SchemaInfo) Types() []string {
	var types []string
	if json.Unmarshal(s.Type, &types) == nil {
		return types
	}

	var single string
	if json.Unmarshal(s.Type, &single) == nil {
		return []string{single}
	}

	return nil
}

// Operation is everything the client and server read of one operation.
type Operation struct {
	// ID is its operationId.
	ID string
	// Method is its HTTP method, in upper case.
	Method string
	// Path is its path template, e.g. "/notes/{noteId}". Go's ServeMux patterns use the same syntax.
	Path string
	// Scopes are those its bearer security requirement names.
	Scopes []string
	// Parameters are the path item's and the operation's own, the operation's replacing one of the same name and
	// location.
	Parameters []Parameter
	// BodyPointer is the JSON Pointer of the schema of its application/json request body, or "" without one.
	BodyPointer string
	// Responses are the JSON Pointer of each documented response's application/json schema, by status.
	Responses map[int]string
}

// Statuses are the operation's documented statuses, in order.
func (o Operation) Statuses() []int {
	statuses := make([]int, 0, len(o.Responses))
	for status := range o.Responses {
		statuses = append(statuses, status)
	}

	slices.Sort(statuses)

	return statuses
}

// methods are those OpenAPI 3.1 allows in a path item: https://spec.openapis.org/oas/v3.1.0#path-item-object
//
//nolint:gochecknoglobals // Never changed
var methods = []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"}

type documentParameter struct {
	Name     string     `json:"name"`
	In       string     `json:"in"`
	Schema   SchemaInfo `json:"schema"`
	Required bool       `json:"required"`
}

type documentContent map[string]struct{}

type documentOperation struct {
	RequestBody *struct {
		Content documentContent `json:"content"`
	} `json:"requestBody"`
	Responses map[string]struct {
		Content documentContent `json:"content"`
	} `json:"responses"`
	OperationID string                `json:"operationId"`
	Security    []map[string][]string `json:"security"`
	Parameters  []documentParameter   `json:"parameters"`
}

type document struct {
	Paths orderedObject `json:"paths"`
}

// orderedObject is a JSON object's members, with its keys in the document's order.
type orderedObject struct {
	members map[string]json.RawMessage
	keys    []string
}

func (o *orderedObject) UnmarshalJSON(data []byte) error {
	if err := json.Unmarshal(data, &o.members); err != nil {
		return err //nolint:wrapcheck // Unmarshal wraps it
	}

	o.keys = objectKeys(data)

	return nil
}

// escape is a key as a JSON Pointer token: https://www.rfc-editor.org/rfc/rfc6901#section-3
func escape(key string) string {
	return strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1")
}

// Pointer joins keys into a JSON Pointer.
func Pointer(keys ...string) string {
	var builder strings.Builder
	for _, key := range keys {
		builder.WriteString("/" + escape(key))
	}

	return builder.String()
}

// Parse reads every operation of a document, in its order: paths as the document lists them, and each path's methods
// as it lists them. That is the order the TypeScript server reads them in (a JavaScript object keeps its keys in
// order), so the routes, a 405's Allow header and the metadata's scopes_supported come out as they do there. Every
// request body and response must be application/json, and every operation needs an operationId and one bearer
// security requirement: the notes API has nothing else, so nothing else is supported.
func Parse(data []byte) ([]Operation, error) {
	var doc document
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrDocument, err)
	}

	var operations []Operation

	for _, path := range doc.Paths.keys {
		parsed, err := parsePathItem(path, doc.Paths.members[path])
		if err != nil {
			return nil, err
		}

		operations = append(operations, parsed...)
	}

	return operations, nil
}

// objectKeys are the keys of a JSON object, which json.Unmarshal has already read, in the order the document has them,
// each once. Nothing is read from anything but an object.
func objectKeys(object json.RawMessage) []string {
	decoder := json.NewDecoder(bytes.NewReader(object))
	if token, _ := decoder.Token(); token != json.Delim('{') {
		return nil
	}

	var keys []string

	for decoder.More() {
		token, _ := decoder.Token()
		key, _ := token.(string)

		var value json.RawMessage

		_ = decoder.Decode(&value)

		if !slices.Contains(keys, key) {
			keys = append(keys, key)
		}
	}

	return keys
}

func parsePathItem(path string, data json.RawMessage) ([]Operation, error) {
	var item orderedObject
	if err := json.Unmarshal(data, &item); err != nil {
		return nil, fmt.Errorf("%w: path %s: %w", ErrDocument, path, err)
	}

	var shared []documentParameter
	if raw, ok := item.members["parameters"]; ok {
		if err := json.Unmarshal(raw, &shared); err != nil {
			return nil, fmt.Errorf("%w: parameters of %s: %w", ErrDocument, path, err)
		}
	}

	var operations []Operation

	for _, method := range item.keys {
		raw := item.members[method]
		// Its other members (parameters, summary...) aren't operations
		if !slices.Contains(methods, method) {
			continue
		}

		var operation documentOperation
		if err := json.Unmarshal(raw, &operation); err != nil {
			return nil, fmt.Errorf("%w: %s %s: %w", ErrDocument, method, path, err)
		}

		parsed, err := parseOperation(path, method, shared, operation)
		if err != nil {
			return nil, err
		}

		operations = append(operations, parsed)
	}

	return operations, nil
}

func parseOperation(path, method string, shared []documentParameter, operation documentOperation) (Operation, error) {
	base := Pointer("paths", path, method)
	if operation.OperationID == "" {
		return Operation{}, fmt.Errorf("%w: %s %s has no operationId", ErrDocument, method, path)
	}

	if len(operation.Security) != 1 || len(operation.Security[0]["bearer"]) == 0 {
		return Operation{}, fmt.Errorf("%w: %s needs one bearer security requirement", ErrDocument, operation.OperationID)
	}

	parsed := Operation{
		ID:          operation.OperationID,
		Method:      strings.ToUpper(method),
		Path:        path,
		Scopes:      operation.Security[0]["bearer"],
		Parameters:  parameters(path, method, shared, operation.Parameters),
		BodyPointer: "",
		Responses:   make(map[int]string, len(operation.Responses)),
	}

	if operation.RequestBody != nil {
		if _, ok := operation.RequestBody.Content["application/json"]; !ok {
			return Operation{}, fmt.Errorf("%w: %s's request body is not application/json", ErrDocument, parsed.ID)
		}

		parsed.BodyPointer = base + Pointer("requestBody", "content", "application/json", "schema")
	}

	for key, response := range operation.Responses {
		status, err := strconv.Atoi(key)
		if err != nil {
			return Operation{}, fmt.Errorf("%w: %s's response %q is not a status", ErrDocument, parsed.ID, key)
		}

		if _, ok := response.Content["application/json"]; !ok {
			return Operation{}, fmt.Errorf("%w: %s's %d response is not application/json", ErrDocument, parsed.ID, status)
		}

		parsed.Responses[status] = base + Pointer("responses", key, "content", "application/json", "schema")
	}

	return parsed, nil
}

// parameters merges a path item's parameters with an operation's, which replace those of the same name and location:
// https://spec.openapis.org/oas/v3.1.0#operation-object
func parameters(path, method string, shared, own []documentParameter) []Parameter {
	var merged []Parameter

	for index, parameter := range shared {
		overridden := slices.ContainsFunc(own, func(o documentParameter) bool {
			return o.Name == parameter.Name && o.In == parameter.In
		})
		if !overridden {
			merged = append(merged, Parameter{
				Schema:   parameter.Schema,
				Name:     parameter.Name,
				In:       parameter.In,
				Pointer:  Pointer("paths", path, "parameters", strconv.Itoa(index), "schema"),
				Required: parameter.Required,
			})
		}
	}

	for index, parameter := range own {
		merged = append(merged, Parameter{
			Schema:   parameter.Schema,
			Name:     parameter.Name,
			In:       parameter.In,
			Pointer:  Pointer("paths", path, method, "parameters", strconv.Itoa(index), "schema"),
			Required: parameter.Required,
		})
	}

	return merged
}

// mustParse parses the embedded document, which the tests check is readable.
func mustParse(data []byte) []Operation {
	operations, err := Parse(data)
	if err != nil {
		panic(err)
	}

	return operations
}

// Operations are the embedded document's, parsed once.
//
//nolint:gochecknoglobals // Read only
var Operations = mustParse(spec.OpenAPI)

// ByID finds an operation of the embedded document.
func ByID(id string) (Operation, bool) {
	for _, operation := range Operations {
		if operation.ID == id {
			return operation, true
		}
	}

	var none Operation

	return none, false
}
