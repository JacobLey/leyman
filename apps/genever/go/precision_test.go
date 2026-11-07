package genever_test

import (
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"maps"
	"strings"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

// Helpers every file may declare, which internal/golang's tests cover.
//
//nolint:gochecknoglobals // Never changed
var helperTypes = map[string]bool{"Optional": true, "Null": true, "Never": true}

// declarations describes the types and constants a package declares, by name: an alias as `= T`, a struct as its
// fields' names and types, a constant as its type and value, and any other type as its underlying type.
func declarations(pkg *types.Package) map[string]string {
	qualifier := func(other *types.Package) string {
		if other == pkg {
			return ""
		}

		return other.Name()
	}

	result := map[string]string{}

	for _, name := range pkg.Scope().Names() {
		switch object := pkg.Scope().Lookup(name).(type) {
		case *types.Const:
			result[name] = "const " + types.TypeString(object.Type(), qualifier) + " " + object.Val().ExactString()
		case *types.TypeName:
			if helperTypes[name] {
				continue
			}

			if alias, ok := object.Type().(*types.Alias); ok {
				result[name] = "= " + types.TypeString(alias.Rhs(), qualifier)

				continue
			}

			structure, ok := object.Type().Underlying().(*types.Struct)
			if !ok {
				result[name] = types.TypeString(object.Type().Underlying(), qualifier)

				continue
			}

			fields := make([]string, 0, structure.NumFields())
			for field := range structure.Fields() {
				fields = append(fields, field.Name()+" "+types.TypeString(field.Type(), qualifier))
			}

			result[name] = "{" + strings.Join(fields, "; ") + "}"
		}
	}

	return result
}

func checkSource(t *testing.T, source []byte) *types.Package {
	t.Helper()

	fset := token.NewFileSet()

	file, err := parser.ParseFile(fset, "schema.go", source, 0)
	if err != nil {
		t.Fatal(err)
	}

	config := types.Config{Importer: importer.ForCompiler(fset, "source", nil)} //nolint:exhaustruct_v5 // Defaults

	pkg, err := config.Check("schema", fset, []*ast.File{file}, nil)
	if err != nil {
		t.Fatalf("%v\n%s", err, source)
	}

	return pkg
}

// Each fixture's types are as narrow as Go can write its schema: the round trip shows they hold every value the
// schema accepts, and these show they hold little more.
func TestFixturePrecision(t *testing.T) {
	t.Parallel()

	fixtures := readFixtures(t)

	for name := range fixtures {
		if _, ok := precision[name]; !ok {
			t.Errorf("no expected declarations for fixture %s", name)
		}
	}

	for name, expected := range precision {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			source, err := genever.Generate(fixtures[name].Schema, genever.Options{
				Name: "", Package: "schema", BaseURI: "", OpenAPI30: false, NoStrict: true,
			})
			if err != nil {
				t.Fatal(err)
			}

			got := declarations(checkSource(t, source))
			for declared, description := range expected {
				if got[declared] != description {
					t.Errorf("%s: got %q, expected %q", declared, got[declared], description)
				}
			}

			for declared, description := range got {
				if _, ok := expected[declared]; !ok {
					t.Errorf("unexpected %s %q", declared, description)
				}
			}
		})
	}
}

//nolint:gochecknoglobals // Never changed
var precision = map[string]map[string]string{
	"allOf": {
		"Schema": "{A string; B *float64; AdditionalProperties map[string]json.RawMessage}",
	},
	"annotated": {
		"Schema": "{Old *string; AdditionalProperties map[string]json.RawMessage}",
	},
	"anyOf": {
		"Schema":        "{Value SchemaVariant}",
		"SchemaNumber":  "float64",
		"SchemaString":  "string",
		"SchemaVariant": "interface{isSchemaVariant()}",
	},
	"anything": {
		"Schema": "= json.RawMessage",
	},
	"array": {
		"Schema": "[]string",
	},
	"arrayContains": {
		"Schema": "[]float64",
	},
	"boolean": {
		"Schema": "bool",
	},
	"contains": {
		"Schema": "string",
	},
	"definitions": {
		"Address": "{City string; Zip *string; AdditionalProperties map[string]json.RawMessage}",
		"Schema":  "{Home Address; Work Optional[*Address]; Others *[]Address; AdditionalProperties map[string]json.RawMessage}",
	},
	"dependentRequired": {
		"Schema": "{Card *string; Address *string; AdditionalProperties map[string]json.RawMessage}",
	},
	"dependentSchemas": {
		"Schema": "{Card *string; Address *string; Cvv *float64; AdditionalProperties map[string]json.RawMessage}",
	},
	"describedReference": {
		"Address": "{City string; Zip *string; AdditionalProperties map[string]json.RawMessage}",
		"Schema":  "{Home *Address; AdditionalProperties map[string]json.RawMessage}",
	},
	"discriminatedOneOf": {
		"Schema":           "{Value SchemaVariant}",
		"SchemaCat":        "{Kind SchemaCatKind; Lives float64; AdditionalProperties map[string]json.RawMessage}",
		"SchemaCatKind":    "string",
		"SchemaCatKindCat": "const SchemaCatKind \"cat\"",
		"SchemaDog":        "{Kind SchemaDogKind; GoodBoy *bool; AdditionalProperties map[string]json.RawMessage}",
		"SchemaDogKind":    "string",
		"SchemaDogKindDog": "const SchemaDogKind \"dog\"",
		"SchemaVariant":    "interface{isSchemaVariant()}",
	},
	"endsWith": {
		"Schema": "string",
	},
	"enumValues": {
		"Schema":             "= *SchemaValue",
		"SchemaValue":        "{Value SchemaValueVariant}",
		"SchemaValueBoolean": "bool",
		"SchemaValueNumber":  "float64",
		"SchemaValueNumber1": "const SchemaValueNumber 1",
		"SchemaValueString":  "string",
		"SchemaValueStringA": "const SchemaValueString \"a\"",
		"SchemaValueStringB": "const SchemaValueString \"b\"",
		"SchemaValueVariant": "interface{isSchemaValueVariant()}",
	},
	"extended": {
		"Schema": "{ID string; Name Optional[*string]; Age float64; Email string}",
	},
	"integer": {
		"Schema": "= *int64",
	},
	"mergeNotNull": {
		"Schema": "string",
	},
	"nestedArray": {
		"Schema": "[][]*float64",
	},
	"never": {
		"Schema": "= Never",
	},
	"notNull": {
		"Schema": "string",
	},
	"nullValue": {
		"Schema": "= Null",
	},
	"nullableObject": {
		"Schema":      "= *SchemaValue",
		"SchemaValue": "{ID string; Name Optional[*string]; Age float64}",
	},
	"nullableString": {
		"Schema": "= *string",
	},
	"nullableTuple": {
		"Schema":      "= *SchemaValue",
		"SchemaValue": "{Item0 bool}",
	},
	"number": {
		"Schema": "float64",
	},
	"object": {
		"Schema": "{ID string; Name Optional[*string]; Age float64}",
	},
	"omitted": {
		"Schema": "{ID string; Name Optional[*string]}",
	},
	"oneOf": {
		"Schema":           "{Value SchemaVariant}",
		"SchemaCat":        "{Kind SchemaCatKind; Lives float64; AdditionalProperties map[string]json.RawMessage}",
		"SchemaCatKind":    "string",
		"SchemaCatKindCat": "const SchemaCatKind \"cat\"",
		"SchemaDog":        "{Kind SchemaDogKind; GoodBoy bool; AdditionalProperties map[string]json.RawMessage}",
		"SchemaDogKind":    "string",
		"SchemaDogKindDog": "const SchemaDogKind \"dog\"",
		"SchemaVariant":    "interface{isSchemaVariant()}",
	},
	"openObject": {
		"Schema": "{A *string; AdditionalProperties map[string]json.RawMessage}",
	},
	"optionalPrefixItems": {
		"Schema": "{Item0 *float64; Rest []string}",
	},
	"partial": {
		"Schema": "{ID *string; Name Optional[*string]; Age *float64}",
	},
	"partlyRequiredPrefixItems": {
		"Schema": "{Item0 float64; Item1 *float64; Rest []string}",
	},
	"patternObject": {
		"Schema": "{AdditionalProperties map[string]string}",
	},
	"picked": {
		"Schema": "{ID string; Name Optional[*string]}",
	},
	"recordObject": {
		"Schema": "{A string; AdditionalProperties map[string]float64}",
	},
	"recordWithPatterns": {
		"Schema":             "{A *string; AdditionalProperties map[string]SchemaValue}",
		"SchemaValue":        "{Value SchemaValueVariant}",
		"SchemaValueBoolean": "bool",
		"SchemaValueNumber":  "float64",
		"SchemaValueVariant": "interface{isSchemaValueVariant()}",
	},
	"recursive": {
		"Schema":   "= TreeNode",
		"TreeNode": "{Value float64; Children []TreeNode; Parent Optional[*TreeNode]; AdditionalProperties map[string]json.RawMessage}",
	},
	"singleEnum": {
		"Schema":     "string",
		"SchemaOnly": "const Schema \"only\"",
	},
	"startsAndEndsWith": {
		"Schema": "string",
	},
	"startsWith": {
		"Schema": "string",
	},
	"string": {
		"Schema": "string",
	},
	"stringAllOf": {
		"Schema": "string",
	},
	"tuple": {
		"Schema": "{Item0 string; Item1 float64}",
	},
	"unevaluated": {
		"Schema": "{A json.RawMessage}",
	},
}

// Each OpenAPI document has the same components, in its version's dialect, so the same types.
func TestDocumentPrecision(t *testing.T) {
	t.Parallel()

	expected := map[string]string{
		"Address":        "{City string; Zip Optional[*string]; AdditionalProperties map[string]json.RawMessage}",
		"TreeNode":       "{Value float64; Children []TreeNode; AdditionalProperties map[string]json.RawMessage}",
		"User":           "{ID string; Home Address; Work Optional[*Address]; Role *UserRole; Tags *[]string}",
		"UserRole":       "string",
		"UserRoleAdmin":  `const UserRole "admin"`,
		"UserRoleMember": `const UserRole "member"`,
	}

	documents := readDocuments(t)
	if len(documents) != 2 {
		t.Fatalf("got %d documents", len(documents))
	}

	for version, document := range documents {
		source, err := genever.Generate(document.Document, genever.Options{
			Name: "", Package: "schema", BaseURI: "", OpenAPI30: false, NoStrict: false,
		})
		if err != nil {
			t.Fatalf("%s: %v", version, err)
		}

		if got := declarations(checkSource(t, source)); !maps.Equal(got, expected) {
			t.Errorf("%s: got %v", version, got)
		}
	}
}

// An OpenAPI document's operations each have a struct of what a call sends, and a type for each JSON response body.
func TestOperationPrecision(t *testing.T) {
	t.Parallel()

	source, err := genever.Generate([]byte(`{
		"openapi": "3.1.0",
		"info": {"title": "API", "version": "1"},
		"paths": {"/users/{id}": {
			"parameters": [{"name": "id", "in": "path", "schema": {"type": "string"}}],
			"put": {
				"operationId": "update-user",
				"parameters": [
					{"name": "dryRun", "in": "query", "schema": {"type": "boolean"}},
					{"name": "X-Trace", "in": "header", "required": true, "schema": {"type": "string"}}
				],
				"requestBody": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/User"}}}},
				"responses": {
					"200": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/User"}}}},
					"default": {"content": {"application/json": {"schema": {"type": "string"}}}}
				}
			}
		}},
		"components": {"schemas": {"User": {
			"type": "object", "properties": {"name": {"type": "string"}}, "additionalProperties": false
		}}}
	}`), genever.Options{Name: "", Package: "schema", BaseURI: "", OpenAPI30: false, NoStrict: false})
	if err != nil {
		t.Fatal(err)
	}

	expected := map[string]string{
		"User":                      "{Name *string}",
		"UpdateUserInput":           "{Body *User; Path UpdateUserInputPath; Query *UpdateUserInputQuery; Header UpdateUserInputHeader}",
		"UpdateUserInputPath":       "{ID string}",
		"UpdateUserInputQuery":      "{DryRun *bool}",
		"UpdateUserInputHeader":     "{XTrace string}",
		"UpdateUserResponse200":     "= User",
		"UpdateUserResponseDefault": "string",
	}

	got := declarations(checkSource(t, source))
	for declared, description := range got {
		if expected[declared] != description {
			t.Errorf("%s: got %q, expected %q", declared, description, expected[declared])
		}
	}

	if len(got) != len(expected) {
		t.Errorf("got %v", got)
	}
}
