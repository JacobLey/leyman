package comparison

import (
	"path/filepath"
	"testing"
)

// The tools fail on documents they can't read, which the report shows as their result.
func TestToolErrors(t *testing.T) {
	t.Parallel()

	for name, generate := range map[string]Generate{
		"genever-go":    GeneverTool.JSONSchema,
		"go-jsonschema": goJSONSchema,
		"oapi-codegen":  oapiCodegen,
	} {
		if _, err := generate([]byte(`{`)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}

	if _, err := goJSONSchema([]byte(`{"type": "object", "properties": {"a": {"$ref": "#/$defs/missing"}}}`)); err == nil {
		t.Error("go-jsonschema: expected an error")
	}

	if _, err := oapiCodegen([]byte(`{"openapi": "3.0.3", "info": {"title": "a", "version": "1"}, "paths": {},
		"components": {"schemas": {"A": {"$ref": "#/components/schemas/Missing"}}}}`)); err == nil {
		t.Error("oapi-codegen: expected an error")
	}

	if _, err := oapiCodegen([]byte(`{"openapi": "3.0.3", "info": {"title": "a", "version": "1"}, "paths": {"/a": {
		"get": {"parameters": [{"name": "x", "in": "query"}], "responses": {}}
	}}}`)); err == nil {
		t.Error("oapi-codegen: expected an error generating")
	}
}

// Writing the harness fails when a file can't be written.
func TestHarnessDirError(t *testing.T) {
	t.Parallel()

	if _, err := harnessDir(t.TempDir(), map[string][]byte{filepath.Join("missing", "a"): nil}); err == nil {
		t.Error("expected an error")
	}
}
