package genever_test

import (
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

// typeNames returns the names of the types a file declares, and its package name.
func typeNames(t *testing.T, source []byte) (map[string]bool, string) {
	t.Helper()

	file, err := parser.ParseFile(token.NewFileSet(), "schema.go", source, 0)
	if err != nil {
		t.Fatal(err)
	}

	names := map[string]bool{}

	for _, decl := range file.Decls {
		if general, ok := decl.(*ast.GenDecl); ok {
			for _, spec := range general.Specs {
				if typeSpec, ok := spec.(*ast.TypeSpec); ok {
					names[typeSpec.Name.Name] = true
				}
			}
		}
	}

	return names, file.Name.Name
}

func TestGenerateDefaults(t *testing.T) {
	t.Parallel()

	source, err := genever.Generate([]byte(`{"type": "object", "properties": {"a": {"type": "string"}}}`),
		genever.Options{Name: "", Package: "", BaseURI: "", OpenAPI30: false, NoStrict: false})
	if err != nil {
		t.Fatal(err)
	}

	if names, pkg := typeNames(t, source); !names["Schema"] || pkg != "schema" {
		t.Fatalf("got types %v in package %s", names, pkg)
	}
}

func TestGenerateOptions(t *testing.T) {
	t.Parallel()

	source, err := genever.Generate([]byte(`{"$id": "item.json", "type": "string", "nullable": true}`), genever.Options{
		Name: "Root", Package: "api", BaseURI: "https://example.com/schemas/", OpenAPI30: true, NoStrict: false,
	})
	if err != nil {
		t.Fatal(err)
	}

	if names, pkg := typeNames(t, source); !names["Root"] || pkg != "api" {
		t.Fatalf("got types %v in package %s", names, pkg)
	}
}

func TestGenerateErrors(t *testing.T) {
	t.Parallel()

	if _, err := genever.Generate([]byte(`{`), genever.Options{}); !errors.Is(err, genever.ErrSyntax) { //nolint:exhaustruct_v5 // Defaults
		t.Errorf("got %v", err)
	}

	_, err := genever.Generate([]byte(`{"type": "string", "unknown": 1}`), genever.Options{}) //nolint:exhaustruct_v5 // Defaults

	var schemaErr *genever.Error
	if !errors.Is(err, genever.ErrStrictMode) || !errors.As(err, &schemaErr) || schemaErr.Pointer == "" {
		t.Errorf("got %v", err)
	}
}
