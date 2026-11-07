package convert_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
)

// splitFiles are an OpenAPI document whose operations are spread across files of OpenAPI objects.
func splitFiles() map[string]string {
	return map[string]string{
		"paths.json": `{"pets": {"$ref": "pets.json"}}`,
		"pets.json": `{"get": {
			"operationId": "listPets",
			"parameters": [{"name": "limit", "in": "query", "schema": {"$ref": "#/Limit"}}],
			"responses": {"200": {"content": {"application/json": {"schema": {"type": "array", "items": {"$ref": "pet.json"}}}}}}
		}, "Limit": {"type": "integer"}}`,
		"pet.json":    `{"title": "Pet", "type": "object", "properties": {"name": {"type": "string"}}}`,
		"params.yaml": "Id:\n  name: id\n  in: path\n  schema: {type: string}\n",
		"responses.json": `{
			"User": {"headers": {"X-Rate": {"$ref": "#/Rate"}}, "content": {"application/json": {"schema": {"type": "boolean"}}}},
			"Rate": {"schema": {"type": "integer"}}
		}`,
	}
}

// An operation's objects may be in other files, referenced from the document or from each other.
func TestLoadObjects(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, splitFiles())

	types := loadAndConvert(t, `{"openapi": "3.1.0", "paths": {
		"/pets": {"$ref": "paths.json#/pets"},
		"/users/{id}": {
			"parameters": [{"$ref": "params.yaml#/Id"}],
			"get": {"operationId": "getUser", "responses": {"200": {"$ref": "responses.json#/User"}}}
		}
	}}`, base+"api.json")

	expectTypeNames(t, types, "Limit", "Pet", "ListPetsInput", "ListPetsResponse200", "GetUserInput",
		"GetUserResponse200")

	expected := loadAndConvert(t, `{"openapi": "3.1.0", "paths": {
		"/pets": {"get": {"operationId": "listPets",
			"parameters": [{"name": "limit", "in": "query", "schema": {"$ref": "#/components/schemas/Limit"}}],
			"responses": {"200": {"content": {"application/json": {"schema": {"type": "array", "items": {
				"$ref": "#/components/schemas/Pet"
			}}}}}}
		}},
		"/users/{id}": {
			"parameters": [{"name": "id", "in": "path", "schema": {"type": "string"}}],
			"get": {"operationId": "getUser", "responses": {"200": {"content": {"application/json": {"schema": {"type": "boolean"}}}}}}
		}
	}, "components": {"schemas": {"Limit": {"type": "integer"}, "Pet": {"type": "object", "properties": {"name": {"type": "string"}}}}}}`,
		base+"single.json")

	for name, key := range expected {
		if types[name] != key {
			t.Errorf("%s: got %s, expected %s", name, types[name], key)
		}
	}
}

// A file of objects has the dialect of the file that refers to it, as it has no version of its own.
func TestLoadObjectsDialect(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, map[string]string{
		"params.json": `{"Nick": {"name": "nick", "in": "query", "schema": {"type": "string", "nullable": true}}}`,
		"more.json":   `{"Nick": {"$ref": "params.json#/Nick"}}`,
		"old.json": `{"openapi": "3.0.3", "info": {"title": "API", "version": "1"}, "components": {"parameters": {
			"Nick": {"$ref": "more.json#/Nick"}
		}}}`,
	})

	operation := func(ref string) string {
		return `{"get": {"operationId": "a", "parameters": [{"$ref": "` + ref + `"}]}}`
	}

	// The 3.0 input's file, and the file that file refers to, are 3.0
	loadAndConvert(t, `{"openapi": "3.0.3", "paths": {"/a": `+operation("more.json#/Nick")+`}}`, base+"api.json")

	// The 3.0 document's are too, though the input is 3.1
	loadAndConvert(t, `{"openapi": "3.1.0", "paths": {"/a": `+operation("old.json#/components/parameters/Nick")+`}}`,
		base+"api.json")

	err := convertLoaded(t, `{"openapi": "3.1.0", "paths": {"/a": `+operation("params.json#/Nick")+`}}`, base+"api.json")
	if !errors.Is(err, gerr.ErrStrictMode) || !strings.HasSuffix(err.Pointer, "params.json#/Nick/schema/nullable") {
		t.Errorf("got %v", err)
	}
}

// convertLoaded loads what a document refers to, and converts it, returning its error.
func convertLoaded(t *testing.T, input, baseURI string) *gerr.Error {
	t.Helper()

	bundle, err := loadBundle(t, mustParse(t, input), baseURI, noLoading())
	if err != nil {
		return asGeneverError(t, err)
	}

	dialect, _, _ := convert.DocumentDialect(bundle.Input)
	options := strict()
	options.BaseURI = baseURI
	options.Dialect = dialect
	options.Files = bundle.Files

	if _, err := convert.Document(bundle.Input, options); err != nil {
		return asGeneverError(t, err)
	}

	return nil
}

func asGeneverError(t *testing.T, err error) *gerr.Error {
	t.Helper()

	var geneverError *gerr.Error
	if !errors.As(err, &geneverError) {
		t.Fatalf("%v is not a *gerr.Error", err)
	}

	return geneverError
}

func TestLoadObjectsFailures(t *testing.T) {
	t.Parallel()

	base := writeFiles(t, map[string]string{
		"old.json":   `{"swagger": 2, "openapi": "2.0"}`,
		"paths.json": `{"a": {}, "loop": {"$ref": "#/back"}, "back": {"$ref": "#/loop"}}`,
	})

	document := func(pathItem string) string {
		return `{"openapi": "3.1.0", "paths": {"/a": ` + pathItem + `}}`
	}

	err := convertLoaded(t, document(`{"$ref": "old.json#/paths/~1a"}`), base+"api.json")
	expectLoadError(t, err, "#/paths/~1a/$ref", base+"api.json", "Only OpenAPI 3.0 and 3.1")

	err = convertLoaded(t, document(`{"$ref": "none.json#/a"}`), base+"api.json")
	expectLoadError(t, err, "#/paths/~1a/$ref", base+"api.json", "none.json")

	for pathItem, message := range map[string]string{
		`{"$ref": "paths.json#/b"}`:    "does not resolve",
		`{"$ref": "paths.json#a"}`:     "does not resolve",
		`{"$ref": "paths.json#/%E0"}`:  "Invalid $ref",
		`{"$ref": 1}`:                  "$ref must be a string",
		`{"$ref": "paths.json#/loop"}`: "only refers to itself",
	} {
		err := convertLoaded(t, document(pathItem), base+"api.json")
		if !errors.Is(err, gerr.ErrInvalidSchema) || !strings.Contains(err.Message, message) ||
			err.Pointer != "#/paths/~1a/$ref" {
			t.Errorf("%s: got %v", pathItem, err)
		}
	}
}
