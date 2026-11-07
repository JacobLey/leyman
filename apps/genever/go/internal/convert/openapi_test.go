package convert_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// document is an OpenAPI document of a version, with component schemas, and other members of the document.
func document(version, schemas, rest string) string {
	if rest != "" {
		rest = ", " + rest
	}

	return `{"openapi": "` + version + `", "info": {"title": "API", "version": "1"}, ` +
		`"components": {"schemas": ` + schemas + `}` + rest + `}`
}

// convertDocument reads a document's dialect, and converts it in strict mode.
func convertDocument(t *testing.T, text string) ([]convert.NamedType, error) {
	t.Helper()

	value, err := jsonv.Parse([]byte(text))
	if err != nil {
		t.Fatal(err)
	}

	dialect, isDocument, err := convert.DocumentDialect(value)
	if err != nil || !isDocument {
		t.Fatalf("got %v, %t", err, isDocument)
	}

	options := strict()
	options.Dialect = dialect

	return convert.Document(value, options) //nolint:wrapcheck // The error under test
}

// expectDocumentTypes converts a document, and expects exactly the named types, by name, in that order.
func expectDocumentTypes(t *testing.T, text string, names []string, types map[string]*model.Type) {
	t.Helper()

	converted, err := convertDocument(t, text)
	if err != nil {
		t.Fatalf("%s: %v", text, err)
	}

	got := make([]string, 0, len(converted))
	for _, named := range converted {
		got = append(got, named.Name)

		if want, ok := types[named.Name]; ok && named.Type.Key() != want.Key() {
			t.Errorf("%s: got %s, expected %s", named.Name, named.Type.Key(), want.Key())
		}
	}

	if strings.Join(got, ",") != strings.Join(names, ",") {
		t.Errorf("got types %v, expected %v", got, names)
	}
}

func TestDocumentComponents(t *testing.T) {
	t.Parallel()

	expectDocumentTypes(t, document("3.1.0", `{
		"User": {
			"type": "object",
			"properties": {"name": {"type": ["string", "null"]}, "address": {"$ref": "#/components/schemas/Address"}},
			"required": ["name"]
		},
		"Address": {"type": "object", "properties": {"city": {"type": "string"}}},
		"Group": {"$defs": {"A": true}},
		"Alias": {"$id": "https://example.com/a", "$ref": "#/components/schemas/Address"}
	}`, `"paths": {}`), []string{"Address", "User"}, map[string]*model.Type{
		"User": open(
			property("name", false, model.Union(model.StringType, model.NullType)),
			property("address", true, model.Reference("Address")),
		),
		"Address": open(property("city", true, model.StringType)),
	})

	expectDocumentTypes(t, document("3.0.3", `{"Name": {"type": "string", "nullable": true, "example": "Ada"}}`, ""),
		[]string{"Name"}, map[string]*model.Type{"Name": model.Union(model.StringType, model.NullType)})

	expectDocumentTypes(t, `{"openapi": "3.1.0", "info": {"title": "API", "version": "1"}}`, []string{}, nil)
	expectDocumentTypes(t, `{"openapi": "3.1.0", "components": {}}`, []string{}, nil)
}

func TestDocumentKeywords(t *testing.T) {
	t.Parallel()

	expectDocumentTypes(t, document("3.1.0", `{
		"Pet": {
			"oneOf": [{"$ref": "#/components/schemas/Cat"}, {"$ref": "#/components/schemas/Dog"}],
			"discriminator": {"propertyName": "kind", "mapping": {"cat": "Cat", "dog": "#/components/schemas/Dog"}},
			"externalDocs": {"url": "https://example.com"}
		},
		"Cat": {
			"type": "object", "properties": {"kind": {"const": "cat"}}, "required": ["kind"],
			"xml": {"name": "cat"}, "example": {"kind": "cat"}
		},
		"Dog": {"type": "object", "properties": {"kind": {"const": "dog"}}, "required": ["kind"]}
	}`, ""), []string{"Cat", "Dog", "Pet"}, map[string]*model.Type{
		"Pet": model.Union(model.Reference("Cat"), model.Reference("Dog")),
	})

	_, err := convertDocument(t, document("3.1.0", `{"Name": {"type": "string", "nullable": true}}`, ""))
	if !errors.Is(err, gerr.ErrStrictMode) {
		t.Errorf("nullable in 3.1: got %v", err)
	}

	_, err = convertDocument(t, document("3.1.0", `{"Pet": {"type": "object", "oneOf": [true], "required": ["k"], "properties": {"k": true}, "discriminator": {"propertyName": "k",
		"mapping": {"x": "Missing"}}}}`, ""))
	if !errors.Is(err, gerr.ErrStrictMode) {
		t.Errorf("mapping to a missing component: got %v", err)
	}
}

// Schemas of the document's other objects are only types when a component refers to them, but references to them
// resolve, and each is read in its own resource.
func TestDocumentOtherSchemas(t *testing.T) {
	t.Parallel()

	refs := []string{
		"#/components/parameters/P/schema",
		"#/components/headers/H/content/text~1plain/schema",
		"#/components/requestBodies/B/content/application~1json/schema",
		"#/components/responses/R/headers/X-Rate/schema",
		"#/components/pathItems/I/parameters/0/schema",
		"#/paths/~1users/get/parameters/0/schema",
		"#/paths/~1users/post/requestBody/content/application~1json/schema",
		"#/paths/~1users/post/responses/201/content/application~1json/schema",
		"https://example.com/inside#/$defs/D",
	}

	properties := make([]string, len(refs))
	for i, ref := range refs {
		properties[i] = `"p` + string(rune('a'+i)) + `": {"$ref": "` + ref + `"}`
	}

	text := document("3.1.0", `{"All": {"type": "object", "properties": {`+strings.Join(properties, ", ")+`}}}`, `
		"paths": {
			"/users": {
				"parameters": [{"$ref": "#/components/parameters/P"}],
				"get": {"parameters": [{"name": "q", "in": "query", "schema": {"type": "integer"}}]},
				"post": {
					"requestBody": {"content": {"application/json": {"schema": {"type": "boolean"}}, "text/plain": {}}},
					"responses": {"201": {"content": {"application/json": {"schema": {"type": "null"}}}}}
				},
				"summary": "Users"
			},
			"/other": "not a path item"
		},
		"x-extension": {"type": "string"}`)
	text = strings.Replace(text, `"components": {`, `"components": {
		"parameters": {"P": {"name": "p", "in": "query", "schema": {"type": "string"}}},
		"headers": {"H": {"content": {"text/plain": {"schema": {
			"$id": "https://example.com/inside", "$defs": {"D": {"type": "number"}}
		}}}}},
		"requestBodies": {"B": {"content": {"application/json": {"schema": {"type": "array"}}}}},
		"responses": {"R": {"headers": {"X-Rate": {"schema": {"type": "integer"}}}}},
		"pathItems": {"I": {"parameters": [{"name": "i", "in": "path", "schema": {"type": "string"}}]}},
	`, 1)

	converted, err := convertDocument(t, text)
	if err != nil {
		t.Fatal(err)
	}

	if len(converted) != 1+len(refs) {
		for _, named := range converted {
			t.Log(named.Name, named.Pointer)
		}

		t.Errorf("got %d types", len(converted))
	}
}

func TestDocumentErrors(t *testing.T) {
	t.Parallel()

	for text, kind := range map[string]error{
		`{"openapi": "3.1.0", "components": []}`:                                   gerr.ErrInvalidSchema,
		`{"openapi": "3.1.0", "components": {"schemas": 1}}`:                       gerr.ErrInvalidSchema,
		`{"openapi": "3.1.0", "components": {"schemas": {"A": {"$id": 1}}}}`:       gerr.ErrInvalidSchema,
		`{"openapi": "3.1.0", "components": {"schemas": {"A": {"type": "date"}}}}`: gerr.ErrInvalidSchema,
	} {
		if _, err := convertDocument(t, text); !errors.Is(err, kind) {
			t.Errorf("%s: got %v, expected %v", text, err, kind)
		}
	}
}

func TestDocumentDialect(t *testing.T) {
	t.Parallel()

	for text, expected := range map[string]convert.Dialect{
		`{"openapi": "3.0.0"}`: convert.OpenAPI30,
		`{"openapi": "3.1.1"}`: convert.OpenAPI31,
	} {
		dialect, isDocument, err := convert.DocumentDialect(mustParse(t, text))
		if dialect != expected || !isDocument || err != nil {
			t.Errorf("%s: got %v, %t, %v", text, dialect, isDocument, err)
		}
	}
}

func TestNotDocument(t *testing.T) {
	t.Parallel()

	for _, text := range []string{`{"type": "string"}`, `true`} {
		if _, isDocument, err := convert.DocumentDialect(mustParse(t, text)); isDocument || err != nil {
			t.Errorf("%s: got %t, %v", text, isDocument, err)
		}
	}
}

func TestDocumentVersion(t *testing.T) {
	t.Parallel()

	for text, version := range map[string]string{`{"openapi": "2.0"}`: `"2.0"`, `{"openapi": 3}`: `"3"`} {
		_, isDocument, err := convert.DocumentDialect(mustParse(t, text))

		var unsupported *gerr.Error
		if !isDocument || !errors.As(err, &unsupported) || !errors.Is(err, gerr.ErrUnsupported) ||
			unsupported.Pointer != "#/openapi" || !strings.Contains(err.Error(), version) {
			t.Errorf("%s: got %t, %v", text, isDocument, err)
		}
	}
}
