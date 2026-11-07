package convert_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

type namedCase struct {
	want   map[string]*model.Type
	schema string
}

// expectTypes checks a schema converts to exactly the named types of want.
func expectTypes(t *testing.T, schema string, options convert.Options, want map[string]*model.Type) {
	t.Helper()

	types := convertSchema(t, schema, options)
	if len(types) != len(want) {
		t.Errorf("schema %s: got %d types, want %d", schema, len(types), len(want))
	}

	for _, named := range types {
		wanted, ok := want[named.Name]
		if !ok {
			t.Errorf("schema %s: unexpected type %s", schema, named.Name)

			continue
		}

		if named.Type.Key() != wanted.Key() {
			t.Errorf("schema %s, type %s:\n got %s\nwant %s", schema, named.Name, named.Type.Key(), wanted.Key())
		}
	}
}

func runNamedCases(t *testing.T, cases map[string]namedCase, options convert.Options) {
	t.Helper()

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			expectTypes(t, testCase.schema, options, testCase.want)
		})
	}
}

func ref(name string) *model.Type {
	return model.Reference(name)
}

func TestDefinitions(t *testing.T) {
	t.Parallel()

	runNamedCases(t, map[string]namedCase{
		"$defs": {
			map[string]*model.Type{
				rootName:  open(property("home", true, ref("Address"))),
				"Address": open(property("city", false, model.StringType)),
			},
			`{ "type": "object", "properties": { "home": { "$ref": "#/$defs/Address" } }, "$defs": { "Address": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] } } }`,
		},
		"group": {
			map[string]*model.Type{rootName: open(property("a", true, ref("A"))), "A": model.StringType},
			`{ "type": "object", "properties": { "a": { "$ref": "#/$defs/Group/$defs/A" } }, "$defs": { "Group": { "title": "Shared", "$defs": { "A": { "type": "string" } } } } }`,
		},
		"referenced group": {
			map[string]*model.Type{rootName: open(property("group", true, ref("Group"))), "Group": model.UnknownType},
			`{ "type": "object", "properties": { "group": { "$ref": "#/$defs/Group" } }, "$defs": { "Group": { "$defs": {} } } }`,
		},
		"not a group": {
			map[string]*model.Type{rootName: model.UnknownType, "A": model.StringType},
			`{ "$defs": { "A": { "type": "string", "$defs": {} } } }`,
		},
		"definitions": {
			map[string]*model.Type{rootName: model.StringType, "Other": model.NumberType},
			`{ "type": "string", "definitions": { "Other": { "type": "number" } } }`,
		},
		"recursive": {
			map[string]*model.Type{rootName: ref("Tree"), "Tree": open(property("children", false, model.Array(ref("Tree"))))},
			`{ "$ref": "#/$defs/Tree", "$defs": { "Tree": { "type": "object", "properties": { "children": { "type": "array", "items": { "$ref": "#/$defs/Tree" } } }, "required": ["children"] } } }`,
		},
		"recursive root": {
			map[string]*model.Type{rootName: open(property("parent", true, model.Union(ref(rootName), model.NullType)))},
			`{ "type": "object", "properties": { "parent": { "anyOf": [{ "$ref": "#" }, { "type": "null" }] } } }`,
		},
		"property": {
			map[string]*model.Type{rootName: open(property("a", true, model.StringType), property("b", true, ref("PropertiesA"))), "PropertiesA": model.StringType},
			`{ "type": "object", "properties": { "a": { "type": "string" }, "b": { "$ref": "#/properties/a" } } }`,
		},
		"escaped": {
			map[string]*model.Type{rootName: open(property("a", true, ref("ABC")), property("b", true, ref("ABC"))), "ABC": model.StringType},
			`{ "type": "object", "properties": { "a": { "$ref": "#/$defs/a~1b~0c" }, "b": { "$ref": "#/%24defs/a~1b~0c" } }, "$defs": { "a/b~c": { "type": "string" } } }`,
		},
		"into an array": {
			map[string]*model.Type{rootName: open(property("a", true, ref("AllOf0"))), "AllOf0": model.ObjectType},
			`{ "type": "object", "properties": { "a": { "$ref": "#/allOf/0" } }, "allOf": [{ "type": "object" }] }`,
		},
		"extension keyword": {
			map[string]*model.Type{rootName: open(property("a", true, ref("XShared"))), "XShared": ref("A"), "A": model.StringType},
			`{ "type": "object", "properties": { "a": { "$ref": "#/x-shared" } }, "x-shared": { "$ref": "#/$defs/A" }, "$defs": { "A": { "type": "string" } } }`,
		},
	}, lax())
}

func TestResources(t *testing.T) {
	t.Parallel()

	runNamedCases(t, map[string]namedCase{
		"embedded resource": {
			map[string]*model.Type{rootName: model.UnknownType, "Currency": model.NumberType, "Money": open(property("currency", true, ref("Currency2"))), "Currency2": model.Union(model.Literal("USD"), model.Literal("EUR"))},
			`{ "$defs": { "Currency": { "type": "number" }, "Money": { "$id": "https://example.test/money", "type": "object", "properties": { "currency": { "$ref": "#/$defs/Currency" } }, "$defs": { "Currency": { "enum": ["USD", "EUR"] } } } } }`,
		},
		"# in a resource": {
			map[string]*model.Type{rootName: model.UnknownType, "Tree": open(property("children", false, model.Array(ref("Tree"))))},
			`{ "$defs": { "Tree": { "$id": "tree.json", "type": "object", "properties": { "children": { "type": "array", "items": { "$ref": "#" } } }, "required": ["children"] } } }`,
		},
		"relative": {
			map[string]*model.Type{rootName: open(property("home", true, ref("CommonAddressJson"))), "CommonAddressJson": open(property("country", true, ref("CommonCountryJson"))), "CommonCountryJson": model.Union(model.Literal("US"), model.Literal("FR"))},
			`{ "type": "object", "properties": { "home": { "$ref": "./common/address.json" } }, "$defs": { "common/address.json": { "$id": "common/address.json", "type": "object", "properties": { "country": { "$ref": "country.json" } } }, "common/country.json": { "$id": "common/country.json", "enum": ["US", "FR"] } } }`,
		},
		"absolute root": {
			map[string]*model.Type{rootName: open(property("home", true, ref("Address")), property("self", true, ref(rootName))), "Address": model.StringType},
			`{ "$id": "https://example.test/schemas/user.json", "type": "object", "properties": { "home": { "$ref": "address.json" }, "self": { "$ref": "user.json" } }, "$defs": { "Address": { "$id": "https://example.test/schemas/address.json", "type": "string" } } }`,
		},
		"alias": {
			map[string]*model.Type{rootName: open(property("a", true, ref("Real"))), "Real": model.StringType},
			`{ "type": "object", "properties": { "a": { "$ref": "alias.json" } }, "$defs": { "Alias": { "$id": "alias.json", "$ref": "real.json" }, "Real": { "$id": "real.json", "type": "string" } } }`,
		},
	}, lax())
}

func TestAnchors(t *testing.T) {
	t.Parallel()

	runNamedCases(t, map[string]namedCase{
		"anchor": {
			map[string]*model.Type{rootName: open(property("email", true, ref("Email"))), "Email": model.StringType},
			`{ "type": "object", "properties": { "email": { "$ref": "#email" } }, "$defs": { "Email": { "$anchor": "email", "type": "string" } } }`,
		},
		"anchor in resource": {
			map[string]*model.Type{rootName: open(property("code", true, ref("Code")), property("amount", true, ref("Amount"))), "Code": model.StringType, "Amount": model.NumberType},
			`{ "type": "object", "properties": { "code": { "$ref": "money.json#code" }, "amount": { "$ref": "money.json#/$defs/Amount" } }, "$defs": { "Money": { "$id": "money.json", "$defs": { "Code": { "$anchor": "code", "type": "string" }, "Amount": { "type": "number" } } } } }`,
		},
		"draft 7 anchor": {
			map[string]*model.Type{rootName: open(property("email", true, ref("Email"))), "Email": model.StringType},
			`{ "type": "object", "properties": { "email": { "$ref": "#email" } }, "definitions": { "Email": { "$id": "#email", "type": "string" } } }`,
		},
		"dynamic anchor": {
			map[string]*model.Type{rootName: open(property("node", true, ref("Node"))), "Node": model.StringType},
			`{ "type": "object", "properties": { "node": { "$ref": "#node" } }, "$defs": { "Node": { "$dynamicAnchor": "node", "type": "string" } } }`,
		},
	}, lax())
}

func TestNaming(t *testing.T) {
	t.Parallel()

	runNamedCases(t, map[string]namedCase{
		"pascal case": {
			map[string]*model.Type{rootName: model.UnknownType, "UserProfile": model.StringType},
			`{ "$defs": { "user-profile": { "type": "string" } } }`,
		},
		"numbered": {
			map[string]*model.Type{rootName: model.UnknownType, "Schema2": model.StringType, "Schema3": model.NumberType},
			`{ "$defs": { "Schema": { "type": "string" }, "schema": { "type": "number" } } }`,
		},
		"prefixed": {
			map[string]*model.Type{rootName: model.UnknownType, "T1st": model.NumberType, "T_été": model.StringType, "Été": model.BooleanType},
			`{ "$defs": { "1st": { "type": "number" }, "_été": { "type": "string" }, "été": { "type": "boolean" } } }`,
		},
		"helper names": {
			map[string]*model.Type{rootName: model.UnknownType, "Nullable2": model.ObjectType},
			`{ "$defs": { "nullable": { "type": "object" } } }`,
		},
		"no letters": {
			map[string]*model.Type{rootName: model.UnknownType, "Type": model.StringType},
			`{ "$defs": { "": { "type": "string" } } }`,
		},
	}, lax())
}

func TestReferenceCycles(t *testing.T) {
	t.Parallel()

	runNamedCases(t, map[string]namedCase{
		"anyOf":    {map[string]*model.Type{rootName: model.StringType}, `{ "anyOf": [{ "$ref": "#" }, { "type": "string" }] }`},
		"allOf":    {map[string]*model.Type{rootName: model.NeverType}, `{ "allOf": [{ "$ref": "#" }, { "type": "string" }] }`},
		"inlined":  {map[string]*model.Type{rootName: model.UnknownType, "A": model.Union(model.NumberType, model.StringType), "B": model.Union(model.StringType, model.NumberType)}, `{ "$defs": { "A": { "anyOf": [{ "$ref": "#/$defs/B" }, { "type": "string" }] }, "B": { "anyOf": [{ "$ref": "#/$defs/A" }, { "type": "number" }] } } }`},
		"guarded":  {map[string]*model.Type{rootName: model.UnknownType, "A": model.Union(ref("B"), model.StringType), "B": model.Array(ref("A"))}, `{ "$defs": { "A": { "anyOf": [{ "$ref": "#/$defs/B" }, { "type": "string" }] }, "B": { "type": "array", "items": { "$ref": "#/$defs/A" } } } }`},
		"repeated": {map[string]*model.Type{rootName: model.UnknownType, "A": model.Intersection(ref("C"), ref("C")), "C": model.Intersection(model.StringType, ref("C2")), "C2": model.UnknownType}, `{ "$defs": { "A": { "allOf": [{ "$ref": "#/$defs/C" }, { "$ref": "#/$defs/C" }] }, "C": { "type": "string", "allOf": [{ "$ref": "#/$defs/C2" }] }, "C2": true } }`},
	}, lax())

	shapes := map[string]string{
		"allOf":            `{ "allOf": [{ "$ref": "%s" }] }`,
		"oneOf":            `{ "oneOf": [{ "$ref": "%s" }] }`,
		"if":               `{ "if": { "$ref": "%s" } }`,
		"then":             `{ "if": true, "then": { "$ref": "%s" } }`,
		"else":             `{ "if": false, "else": { "$ref": "%s" } }`,
		"not":              `{ "not": { "$ref": "%s" } }`,
		"dependentSchemas": `{ "type": "object", "dependentSchemas": { "a": { "$ref": "%s" } } }`,
		"dependencies":     `{ "type": "object", "dependencies": { "a": { "$ref": "%s" }, "b": ["a"] } }`,
	}
	for keyword, shape := range shapes {
		t.Run(keyword, func(t *testing.T) {
			t.Parallel()

			schema := `{ "$defs": { "A": ` + sprintf(shape, "#/$defs/B") + `, "B": ` + sprintf(shape, "#/$defs/A") + ` } }`
			if err := convertError(t, schema, strict()); !errors.Is(err, gerr.ErrStrictMode) {
				t.Errorf("got %v", err)
			}
		})
	}

	t.Run("invalid reference in a cycle", func(t *testing.T) {
		t.Parallel()

		err := convertError(t, `{ "$defs": { "A": { "anyOf": [{ "$ref": "#/$defs/B" }] }, "B": { "anyOf": [{ "$ref": "#/$defs/A" }, { "$ref": "#/$defs/Missing" }] } } }`, lax())
		if !errors.Is(err, gerr.ErrInvalidSchema) {
			t.Errorf("got %v", err)
		}
	})
}

func TestInvalidBaseURI(t *testing.T) {
	t.Parallel()

	options := lax()
	options.BaseURI = "%zz"

	err := convertError(t, `{ "type": "array", "items": { "$ref": "#" } }`, options)
	if !errors.Is(err, gerr.ErrInvalidSchema) || err.Error() != `Invalid $ref "#" (at #/items/$ref)` {
		t.Errorf("got %v", err)
	}
}

func sprintf(shape, ref string) string {
	for i := range len(shape) - 1 {
		if shape[i:i+2] == "%s" {
			return shape[:i] + ref + shape[i+2:]
		}
	}

	return shape
}

func TestDraft04(t *testing.T) {
	t.Parallel()

	runNamedCases(t, map[string]namedCase{
		"id": {
			map[string]*model.Type{rootName: open(property("a", true, ref("A"))), "A": model.StringType},
			`{ "$schema": "http://json-schema.org/draft-04/schema#", "type": "object", "properties": { "a": { "$ref": "a.json" } }, "definitions": { "A": { "id": "a.json", "type": "string" } } }`,
		},
		"root id": {
			map[string]*model.Type{rootName: open(property("self", true, ref(rootName)))},
			`{ "$schema": "http://json-schema.org/draft-04/schema#", "id": "https://example.test/a.json", "type": "object", "properties": { "self": { "$ref": "a.json" } } }`,
		},
		"$id wins": {
			map[string]*model.Type{rootName: model.StringType},
			`{ "$schema": "http://json-schema.org/draft-04/schema#", "$id": "https://example.test/a.json", "id": 1, "type": "string" }`,
		},
		"exclusive booleans": {
			map[string]*model.Type{rootName: model.IntegerType},
			`{ "$schema": "http://json-schema.org/draft-04/schema#", "type": "integer", "minimum": 1, "exclusiveMinimum": true, "maximum": 2 }`,
		},
		"nested declaration": {
			map[string]*model.Type{rootName: model.UnknownType, "A": model.NumberType},
			`{ "$defs": { "A": { "$schema": "http://json-schema.org/draft-04/schema#", "type": "number", "properties": {}, "exclusiveMaximum": false, "maximum": 1 } } }`,
		},
	}, lax())

	err := convertError(t, `{ "$schema": "http://json-schema.org/draft-04/schema#", "type": "integer", "minimum": 1, "exclusiveMinimum": true, "maximum": 1 }`, strict())
	if !errors.Is(err, gerr.ErrStrictMode) {
		t.Errorf("got %v", err)
	}
}

func TestOrder(t *testing.T) {
	t.Parallel()

	types := convertSchema(t, `{ "type": "object", "properties": { "b": { "$ref": "#/$defs/b" } }, "$defs": { "c": true, "a": true, "b": true } }`, lax())

	names := make([]string, len(types))
	for i, named := range types {
		names[i] = named.Name
	}

	if !slices.Equal(names, []string{rootName, "A", "B", "C"}) {
		t.Errorf("got %v", names)
	}
}

func TestDocs(t *testing.T) {
	t.Parallel()

	types := convertSchema(t, `{
		"type": "object", "title": "Root", "description": "Described", "deprecated": true,
		"properties": {
			"constrained": { "type": "string", "format": "email", "minLength": 3, "default": "abc", "examples": ["def"] },
			"wrong": { "type": "string", "title": 42, "description": false }
		}
	}`, lax())

	root := types[0]
	if root.Doc == nil || root.Doc.Title != "Root" || root.Doc.Description != "Described" || !root.Doc.Deprecated {
		t.Errorf("root doc %+v", root.Doc)
	}

	constrained := root.Type.Properties[0].Doc
	want := []model.Tag{{Name: "format", Text: `"email"`}, {Name: "minLength", Text: "3"}, {Name: "default", Text: `"abc"`}, {Name: "example", Text: `"def"`}}

	if constrained == nil || !slices.Equal(constrained.Tags, want) {
		t.Errorf("constrained doc %+v", constrained)
	}

	if root.Type.Properties[1].Doc != nil {
		t.Errorf("wrong doc %+v", root.Type.Properties[1].Doc)
	}
}

func TestExampleDocs(t *testing.T) {
	t.Parallel()

	example := convertSchema(t, `{ "type": "string", "example": "abc" }`, openAPI30())[0].Doc
	if example == nil || !slices.Equal(example.Tags, []model.Tag{{Name: "example", Text: `"abc"`}}) {
		t.Errorf("example doc %+v", example)
	}

	if doc := convertSchema(t, `{ "$defs": { "A": true } }`, lax())[1].Doc; doc != nil {
		t.Errorf("boolean schema doc %+v", doc)
	}
}
