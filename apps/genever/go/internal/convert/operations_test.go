package convert_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
	testvectors "github.com/JacobLey/leyman/apps/genever/test-vectors"
)

// field is a property with its type first, as an operation's types are read.
func field(name string, typ *model.Type, optional bool) model.Property {
	return property(name, optional, typ)
}

// operationsDocument is an OpenAPI 3.1 document with paths, and components written as JSON members.
func operationsDocument(paths, components string) string {
	return `{"openapi": "3.1.0", "info": {"title": "API", "version": "1"}, "paths": ` + paths +
		`, "components": {` + components + `}}`
}

// namedTypes converts a document, and returns its types by name.
func namedTypes(t *testing.T, text string) map[string]convert.NamedType {
	t.Helper()

	converted, err := convertDocument(t, text)
	if err != nil {
		t.Fatalf("%s: %v", text, err)
	}

	types := make(map[string]convert.NamedType, len(converted))
	for _, named := range converted {
		types[named.Name] = named
	}

	return types
}

const usersPaths = `{
	"/users/{id}": {
		"parameters": [
			{"name": "id", "in": "path", "schema": {"type": "string"}},
			{"name": "trace", "in": "header", "schema": {"type": "string"}}
		],
		"get": {
			"operationId": "getUser",
			"summary": "Get a user",
			"description": "By id",
			"deprecated": true,
			"parameters": [
				{"name": "fields", "in": "query", "schema": {"type": "string"}},
				{"name": "page", "in": "query", "required": true, "schema": {"$ref": "#/components/schemas/Page"}},
				{"name": "trace", "in": "header", "required": true, "schema": {"type": "boolean"}},
				{"$ref": "#/components/parameters/Session"},
				{"name": "filter", "in": "query", "content": {"application/json": {"schema": {"type": "number"}}}},
				{"name": "raw", "in": "query"},
				{"name": "empty", "in": "query", "content": {}}
			],
			"responses": {
				"200": {"description": "The user", "headers": {"X-Rate": {"schema": {"type": "integer"}}}, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/User"}}}},
				"204": {"description": "Nothing"},
				"304": {"content": {"text/plain": {}}},
				"default": {"$ref": "#/components/responses/Problem"}
			}
		},
		"put": {
			"operationId": "update-user",
			"requestBody": {"$ref": "#/components/requestBodies/Update"},
			"responses": {"2XX": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/User"}}}}}
		},
		"post": {"responses": {"201": {"content": {"application/json": {}}}}},
		"delete": {"operationId": 5}
	},
	"/notes": {
		"post": {"operationId": "addNote", "requestBody": {"content": {"application/json": {}}}},
		"put": {"operationId": "upload", "requestBody": {"content": {"text/plain": {}}}}
	}
}`

const usersComponents = `
	"schemas": {
		"User": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"], "additionalProperties": false},
		"Page": {"type": "integer", "default": 1}
	},
	"parameters": {"Session": {"name": "session", "in": "cookie", "schema": {"type": "string"}}},
	"responses": {"Problem": {"description": "A problem", "content": {"application/json": {"schema": {"type": "string"}}}}},
	"requestBodies": {"Update": {"required": true, "content": {"application/json": {"schema": {"type": "boolean"}}}}}
`

// Each operation with an operationId has a type for its input, and one for each of its JSON responses.
func TestOperationTypes(t *testing.T) {
	t.Parallel()

	expectDocumentTypes(t, operationsDocument(usersPaths, usersComponents), []string{
		"Page", "User",
		"GetUserInput", "GetUserResponse200", "GetUserResponseDefault",
		"UpdateUserInput", "UpdateUserResponse2XX",
		"UploadInput", "AddNoteInput",
	}, map[string]*model.Type{
		"GetUserInput": object(
			field("path", object(field("id", model.StringType, false)), false),
			field("query", object(
				field("fields", model.StringType, true),
				field("page", model.Reference("Page"), false),
				field("filter", model.NumberType, true),
				field("raw", model.UnknownType, true),
				field("empty", model.UnknownType, true),
			), false),
			// Replaced by the operation's, where the path item's was
			field("header", object(field("trace", model.BooleanType, false)), false),
			field("cookie", object(field("session", model.StringType, true)), true),
		),
		"GetUserResponse200":     model.Reference("User"),
		"GetUserResponseDefault": model.StringType,
		"UpdateUserInput": object(
			field("body", model.BooleanType, false),
			field("path", object(field("id", model.StringType, false)), false),
			field("header", object(field("trace", model.StringType, true)), true),
		),
		"UpdateUserResponse2XX": model.Reference("User"),
		"AddNoteInput":          object(field("body", model.UnknownType, true)),
		"UploadInput":           object(),
	})
}

// The types are documented with what they are, then the operation's or response's own documentation.
func TestOperationDocs(t *testing.T) {
	t.Parallel()

	types := namedTypes(t, operationsDocument(usersPaths, usersComponents))

	input := types["GetUserInput"]
	if !strings.HasPrefix(input.Doc.Title, `GetUserInput is what a call to operation "getUser" sends`) ||
		input.Doc.Description != "Get a user\n\nBy id" || !input.Doc.Deprecated || input.Pointer != "#/paths/~1users~1{id}/get" {
		t.Errorf("got %+v at %s", input.Doc, input.Pointer)
	}

	response := types["GetUserResponseDefault"]
	if response.Doc.Title != `GetUserResponseDefault is the JSON body of operation "getUser"'s default response.` ||
		response.Doc.Description != "A problem" || response.Pointer != "#/components/responses/Problem" {
		t.Errorf("got %+v at %s", response.Doc, response.Pointer)
	}
}

// An operation, or parameter, without documentation is documented only with what its type is.
func TestOperationWithoutDocs(t *testing.T) {
	t.Parallel()

	types := namedTypes(t, operationsDocument(usersPaths, usersComponents))

	if doc := types["UploadInput"].Doc; doc.Description != "" || doc.Deprecated {
		t.Errorf("got %+v", doc)
	}

	query := types["GetUserInput"].Type.Properties[1].Type
	if query.Properties[0].Doc != nil {
		t.Errorf("got %+v", query.Properties[0].Doc)
	}
}

// The types of operations are named after the components, and other named schemas, so they keep their names.
func TestOperationNames(t *testing.T) {
	t.Parallel()

	text := operationsDocument(`{
		"/a": {"get": {"operationId": "getA", "responses": {"200": {"content": {"application/json": {
			"schema": {"$ref": "#/$defs/GetAInput"}
		}}}}}},
		"/b": {"get": {"operationId": "get a"}}
	}`, `"schemas": {"GetAResponse200": {"type": "string"}}`)

	expectDocumentTypes(t, strings.TrimSuffix(text, "}")+`, "$defs": {"GetAInput": {"type": "number"}}}`, []string{
		"GetAInput", "GetAResponse200", "GetAInput2", "GetAResponse2002", "GetAInput3",
	}, nil)
}

// A parameter's schema references are followed to one with a default, wherever they end.
func TestOperationParameterReferences(t *testing.T) {
	t.Parallel()

	expectDocumentTypes(t, operationsDocument(`{"/a": {"get": {"operationId": "a", "parameters": [
		{"name": "a", "in": "query", "schema": {"$ref": "#/components/schemas/A"}},
		{"name": "b", "in": "query", "schema": {"$ref": "#/components/schemas/B"}}
	]}}}`, `"schemas": {"A": {"$ref": "#/components/schemas/True"}, "True": true, "B": {"type": "string"}}`), []string{
		"A", "B", "True", "AInput",
	}, nil)

	// References that only refer to each other are reported where the schema is converted
	_, err := convertDocument(t, operationsDocument(`{"/a": {"get": {"parameters": [
		{"name": "a", "in": "query", "schema": {"$ref": "#/components/schemas/A"}}
	]}}}`, `"schemas": {"A": {"$ref": "#/components/schemas/B"}, "B": {"$ref": "#/components/schemas/A"}}`))
	if err == nil {
		t.Error("expected an error")
	}
}

// The shared vectors' OpenAPI documents fail here as they do through genever, the kind of error at the same pointer.
func TestDocumentErrorVectors(t *testing.T) {
	t.Parallel()

	var cases map[string]map[string]struct {
		Schema  json.RawMessage `json:"schema"`
		Pointer string          `json:"pointer"`
	}
	if err := json.Unmarshal(testvectors.Errors, &cases); err != nil {
		t.Fatal(err)
	}

	kinds := map[string]error{
		"invalid": gerr.ErrInvalidSchema, "strict": gerr.ErrStrictMode, "unsupported": gerr.ErrUnsupported,
	}

	for kind, byName := range cases {
		for name, item := range byName {
			if !strings.Contains(string(item.Schema), `"openapi"`) {
				continue
			}

			t.Run(kind+"/"+name, func(t *testing.T) {
				t.Parallel()

				_, err := convertDocument(t, string(item.Schema))

				var geneverError *gerr.Error
				if !errors.As(err, &geneverError) || !errors.Is(err, kinds[kind]) || geneverError.Pointer != item.Pointer {
					t.Errorf("got %v, expected %s at %s", err, kind, item.Pointer)
				}
			})
		}
	}
}
