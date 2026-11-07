package genever_test

import (
	"errors"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

// Each type generated from a schema, and each field of a property, is listed where it is declared, with the pointer
// of the schema it is generated from.
func TestGenerateSourceNames(t *testing.T) {
	t.Parallel()

	source, err := genever.GenerateSource([]byte(`{
		"type": "object",
		"properties": {
			"note": {"$ref": "#/$defs/Note"},
			"home": {"type": "object", "properties": {"city": {"type": "string"}}},
			"tags": {"type": "array", "items": {"type": "string"}}
		},
		"additionalProperties": {"type": "number"},
		"$defs": {
			"Note": {"type": "object", "properties": {"body": {"type": "string"}, "AdditionalProperties": {}}},
			"Pair": {"type": "array", "prefixItems": [{"type": "string"}], "items": false}
		}
	}`), genever.Options{
		Name: "Root", Package: "", BaseURI: "", OpenAPI30: false, NoStrict: false, ParameterDefaults: false,
	})
	if err != nil {
		t.Fatal(err)
	}

	expected := []genever.Name{
		{Name: "Root", Pointer: "#", Offset: 0},
		{Name: "Note", Pointer: "#/properties/note", Offset: 0},
		{Name: "Home", Pointer: "#/properties/home", Offset: 0},
		{Name: "Tags", Pointer: "#/properties/tags", Offset: 0},
		// In RootHome, declared after Root
		{Name: "City", Pointer: "#/properties/home/properties/city", Offset: 0},
		{Name: "Note", Pointer: "#/$defs/Note", Offset: 0},
		{Name: "Body", Pointer: "#/$defs/Note/properties/body", Offset: 0},
		// Renamed, as the extra properties' map has the name
		{Name: "AdditionalProperties2", Pointer: "#/$defs/Note/properties/AdditionalProperties", Offset: 0},
		{Name: "Pair", Pointer: "#/$defs/Pair", Offset: 0},
	}

	expectNames(t, source, expected)
}

// An OpenAPI document's operation types are generated from the operation, and each response's from the response.
func TestGenerateSourceOperationNames(t *testing.T) {
	t.Parallel()

	source, err := genever.GenerateSource([]byte(`{
		"openapi": "3.1.0",
		"info": {"title": "API", "version": "1"},
		"paths": {"/notes": {"post": {
			"operationId": "addNote",
			"parameters": [{"name": "q", "in": "query", "schema": {"type": "string"}}],
			"responses": {"201": {"content": {"application/json": {"schema": {"type": "string"}}}}}
		}}},
		"components": {"schemas": {}}
	}`), genever.Options{
		Name: "", Package: "", BaseURI: "", OpenAPI30: false, NoStrict: false, ParameterDefaults: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	expectNames(t, source, []genever.Name{
		{Name: "AddNoteInput", Pointer: "#/paths/~1notes/post", Offset: 0},
		{Name: "AddNoteRequest", Pointer: "#/paths/~1notes/post", Offset: 0},
		{Name: "AddNoteResponse201", Pointer: "#/paths/~1notes/post/responses/201", Offset: 0},
	})
}

// GenerateSource fails as Generate does.
func TestGenerateSourceErrors(t *testing.T) {
	t.Parallel()

	options := genever.Options{
		Name: "", Package: "", BaseURI: "", OpenAPI30: false, NoStrict: false, ParameterDefaults: false,
	}

	if _, err := genever.GenerateSource([]byte(`{`), options); !errors.Is(err, genever.ErrSyntax) {
		t.Errorf("got %v", err)
	}

	if _, err := genever.GenerateSource([]byte(`{"type": 5}`), options); !errors.Is(err, genever.ErrInvalidSchema) {
		t.Errorf("got %v", err)
	}
}

// expectNames expects exactly the names, in order, each at an offset where the source has it.
func expectNames(t *testing.T, source genever.Source, expected []genever.Name) {
	t.Helper()

	if len(source.Names) != len(expected) {
		t.Fatalf("got %+v", source.Names)
	}

	for index, name := range source.Names {
		if name.Name != expected[index].Name || name.Pointer != expected[index].Pointer {
			t.Errorf("%d: got %+v, expected %+v", index, name, expected[index])
		}

		if end := name.Offset + len(name.Name); end > len(source.Text) || string(source.Text[name.Offset:end]) != name.Name {
			t.Errorf("%s: not at %d", name.Name, name.Offset)
		}

		if index > 0 && name.Offset <= source.Names[index-1].Offset {
			t.Errorf("%s: before %s", name.Name, source.Names[index-1].Name)
		}
	}
}
