package golang_test

import (
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/golang"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// A schema's named types, the first of which is Schema, with JSON values its types must read and write back
// unchanged, and values they must fail to read.
type testCase struct {
	name   string
	types  []convert.NamedType
	accept []string
	reject []string
}

func named(name string, typ *model.Type) convert.NamedType {
	return convert.NamedType{Doc: nil, Type: typ, Name: name, Pointer: ""}
}

func prop(name string, typ *model.Type, optional bool) model.Property {
	return model.Property{Doc: nil, Type: typ, Name: name, Pointer: "", Optional: optional}
}

func object(properties ...model.Property) *model.Type {
	return model.Object(properties, nil)
}

func openObject(value *model.Type, properties ...model.Property) *model.Type {
	return model.Object(properties, []model.Index{{Key: model.StringType, Value: value}})
}

func element(typ *model.Type, optional bool) model.Element {
	return model.Element{Type: typ, Optional: optional}
}

func template(prefix string) *model.Type {
	return model.Template([]model.TemplatePart{{Text: prefix, IsString: false}, {Text: "", IsString: true}})
}

func lit(value any) *model.Type {
	return model.Literal(value)
}

func ref(name string) *model.Type {
	return model.Reference(name)
}

//nolint:gochecknoglobals // Never changed
var doc = &model.Doc{
	Description: "A description.",
	Title:       "A title",
	Tags:        []model.Tag{{Name: "format", Text: "email"}},
	Deprecated:  true,
}

func objectCase() testCase {
	documented := prop("name", model.StringType, false)
	documented.Doc = doc

	schema := named("Schema", openObject(model.NumberType,
		documented,
		prop("nick", model.StringType, true),
		prop("note", model.Union(model.StringType, model.NullType), true),
		prop("meta", model.UnknownType, true),
		prop("gone", model.NeverType, true),
		prop("friend", ref("MaybeFriend"), false),
		prop("MarshalJSON", model.IntegerType, false),
		prop("a-b", model.BooleanType, false),
		prop("aB", model.StringType, true),
		prop("1x", model.NullType, false),
		prop("\u540d", model.ObjectType, true),
	))
	schema.Doc = doc

	return testCase{
		name: "objects",
		types: []convert.NamedType{
			schema,
			named("MaybeFriend", model.Union(ref("Friend"), model.NullType)),
			named("Friend", object(prop("id", model.StringType, false))),
		},
		accept: []string{
			`{"name": "a", "friend": null, "MarshalJSON": 1, "a-b": true, "1x": null}`,
			`{"name": "a", "nick": "n", "note": null, "meta": {"x": [1]}, "friend": {"id": "f"}, "MarshalJSON": 2,
				"a-b": false, "aB": "c", "1x": null, "\u540d": {"k": 1}, "extra": 1.5}`,
			`{"name": "a", "note": "b", "friend": null, "MarshalJSON": 1, "a-b": true, "1x": null}`,
		},
		reject: []string{`{"extra": "s"}`, `{"1x": 1}`, `[]`},
	}
}

func tupleCases() []testCase {
	return []testCase{
		{
			name: "tuples",
			types: []convert.NamedType{named("Schema", model.Tuple(
				[]model.Element{element(model.StringType, false), element(model.NumberType, true)},
				model.BooleanType,
			))},
			accept: []string{`["a"]`, `["a", 1]`, `["a", 1, true, false]`},
			reject: []string{`[]`, `[1]`, `["a", "b"]`, `["a", 1, 2]`, `{}`},
		},
		{
			name: "closedtuples",
			types: []convert.NamedType{named("Schema", model.Tuple([]model.Element{
				element(model.IntegerType, false),
				element(model.Union(model.StringType, model.NullType), true),
				element(model.UnknownType, true),
				element(model.NeverType, true),
			}, nil))},
			accept: []string{`[1]`, `[1, null]`, `[1, "a", {"x": 1}]`, `[1, "a", null]`},
			reject: []string{`[1, "a", 2, 3]`, `[1, "a", 2, 3, 4]`},
		},
	}
}

func unionCases() []testCase {
	loose := named("Loose", model.UnknownType)
	tagged := named("Schema", model.Union(
		object(prop("kind", lit("a"), false), prop("a", model.StringType, false)),
		object(prop("kind", model.Union(lit(1.0), lit(2.0)), false), prop("b", model.NumberType, true)),
		object(prop("kind", lit(true), false)),
		model.NumberType,
		ref("Loose"),
	))
	tagged.Doc = doc

	return append([]testCase{
		{
			name: "variants",
			types: []convert.NamedType{
				named("Schema", model.Union(
					template("a"), model.IntegerType, model.BooleanType, model.Array(model.StringType), ref("Friend"),
					model.Intersection(ref("Friend"), object(prop("z", model.NumberType, false))), ref("Loose"),
				)),
				named("Friend", openObject(model.NumberType, prop("id", model.StringType, false))),
				loose,
			},
			accept: []string{
				`"abc"`, `1`, `1.5`, `true`, `["s"]`, `[1]`, `{"id": "a"}`, `{"id": "a", "n": 2}`, `{"id": "a", "z": 1}`,
				`{"q": "x"}`, `null`,
			},
			reject: nil,
		},
		{
			name:   "tagged",
			types:  []convert.NamedType{tagged, loose},
			accept: []string{`{"kind": "a", "a": "x"}`, `{"kind": 2}`, `{"kind": 1, "b": 3}`, `{"kind": true}`, `{"kind": "z"}`, `"s"`, `1.5`},
			reject: nil,
		},
	}, objectUnionCases()...)
}

func objectUnionCases() []testCase {
	return []testCase{
		{
			name: "picked",
			types: []convert.NamedType{named("Schema", model.Union(
				object(prop("a", model.NumberType, false)),
				object(prop("b", model.NumberType, false), prop("c", model.NumberType, true)),
				object(prop("a", model.NumberType, false), prop("d", model.NumberType, false)),
			))},
			accept: []string{`{"a": 1}`, `{"b": 1, "c": 2}`, `{"b": 1}`, `{"a": 1, "d": 2}`},
			reject: []string{`{"z": 1}`, `{"a": 1, "z": 1}`, `"s"`},
		},
		{
			name: "untagged",
			types: []convert.NamedType{named("Schema", model.Union(
				object(prop("k", lit("a"), false), prop("m", lit("c"), false)),
				object(prop("j", lit("b"), false), prop("m", lit("c"), false)),
			))},
			accept: []string{`{"k": "a", "m": "c"}`, `{"j": "b", "m": "c"}`},
			reject: nil,
		},
		{
			name: "literals",
			types: []convert.NamedType{named("Schema", model.Union(
				lit("x"), lit("y"), lit(1.0), lit(-1.5), lit(1e21), lit(true), object(prop("k", lit("o"), false)),
			))},
			accept: []string{`"x"`, `1`, `-1.5`, `1e21`, `true`, `{"k": "o"}`},
			reject: []string{`null`, `[]`},
		},
		{
			name:   "enums",
			types:  []convert.NamedType{named("Schema", model.Union(lit("a"), lit("b"), lit("")))},
			accept: []string{`"a"`, `""`},
			reject: []string{`1`},
		},
	}
}

// namedTypes are the types namedCase's Schema references.
func namedTypes() []convert.NamedType {
	arrays := model.Intersection(
		model.Tuple([]model.Element{element(model.UnknownType, false)}, model.UnknownType),
		model.Tuple([]model.Element{element(model.UnknownType, true)}, nil),
		model.Array(model.StringType),
	)

	return []convert.NamedType{
		named("Anything", model.UnknownType),
		named("Anything2", model.UnknownType),
		named("Nothing", model.NeverType),
		named("Nil", model.NullType),
		named("Nil2", model.NullType),
		named("Text", model.StringType),
		named("Count", model.IntegerType),
		named("Yes", lit(true)),
		named("Flag", model.BooleanType),
		named("Half", lit(0.5)),
		named("Choice", model.Union(lit("a"), lit("b"))),
		named("Only", lit("only")),
		named("Prefixed", model.Intersection(template("a"), template("b"))),
		named("Both", model.Intersection(ref("Text"), ref("Prefixed"))),
		named("NumberBoth", model.Intersection(ref("Count"), ref("Half"))),
		named("BoolBoth", model.Intersection(ref("Yes"), ref("Flag"))),
		named("NullBoth", model.Intersection(ref("Nil"), ref("Nil2"))),
		named("Raw", model.Intersection(ref("Anything"), ref("Anything2"))),
		named("List", arrays),
		named("Loop", model.Intersection(ref("LoopB"), object(prop("x", model.NumberType, true)))),
		named("LoopB", model.Intersection(ref("Loop"), object(prop("y", model.NumberType, true)))),
		named("MaybeText", model.Union(model.StringType, model.NullType)),
		named("Alias", ref("Text")),
	}
}

func namedCase() testCase {
	sample := `{"u": {"any": 1}, "z": null, "s": "t", "i": 3, "t": true, "h": 0.5, "e": "a", "o": "only", "p": "ab",
		"w": "ab", "nb": 2, "bb": false, "nn": null, "r": [1], "l": ["a", 1], "loop": {"x": 1, "y": 2}, "mt": {{mt}},
		"al": "x", "nested": {"q": 1, "x": 2}, "en": "lit", "m": {"a": 1}, "empty": {}, {{tail}}}`

	return testCase{
		name: "named",
		types: append([]convert.NamedType{
			named("Schema", object(
				prop("u", ref("Anything"), false), prop("n", ref("Nothing"), true), prop("z", ref("Nil"), false),
				prop("s", ref("Text"), false), prop("i", ref("Count"), false), prop("t", ref("Yes"), false),
				prop("h", ref("Half"), false), prop("e", ref("Choice"), false), prop("o", ref("Only"), false),
				prop("p", ref("Prefixed"), false), prop("w", ref("Both"), false), prop("nb", ref("NumberBoth"), false),
				prop("bb", ref("BoolBoth"), false), prop("nn", ref("NullBoth"), false), prop("r", ref("Raw"), false),
				prop("l", ref("List"), false), prop("loop", ref("Loop"), true), prop("mt", ref("MaybeText"), false),
				prop("al", ref("Alias"), false),
				prop("nested", model.Intersection(ref("Loop"), object(prop("q", model.NumberType, true))), false),
				prop("en", lit("lit"), false),
				prop("m", openObject(model.IntegerType), false),
				prop("empty", openObject(model.NeverType), false),
				prop("mixed", model.Union(ref("Raw"), template("x")), false),
				prop("extra", openObject(model.NumberType, prop("gone", model.NeverType, true)), true),
				prop("either", model.Intersection(object(prop("a", model.NumberType, false)),
					model.Union(object(prop("b", lit("x"), false)), object(prop("b", lit("y"), false)),
						object(prop("c", model.NumberType, false)))), true),
				prop("anyObject", model.Intersection(model.ObjectType, ref("Loop")), true),
			)),
		}, namedTypes()...),
		accept: []string{
			strings.NewReplacer("{{mt}}", "null", "{{tail}}", `"mixed": "xy", "extra": {"k": 1},
				"either": {"a": 1, "b": "x"}, "anyObject": {"x": 1, "other": [true]}`).Replace(sample),
			strings.NewReplacer("{{mt}}", `"s"`, "{{tail}}", `"mixed": {"o": 1}`).Replace(sample),
		},
		reject: []string{`{"z": 1}`, `{"n": 1}`},
	}
}

func allCases() []testCase {
	return slices.Concat([]testCase{objectCase(), namedCase()}, tupleCases(), unionCases())
}

// compile generates a case's types and type checks them.
func compile(t *testing.T, schemaTypes []convert.NamedType) (*types.Package, *ast.File) {
	t.Helper()

	source, err := golang.Generate(schemaTypes, "schema")
	if err != nil {
		t.Fatal(err)
	}

	fset := token.NewFileSet()

	file, err := parser.ParseFile(fset, "schema.go", source, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}

	config := types.Config{Importer: importer.ForCompiler(fset, "source", nil)} //nolint:exhaustruct_v5 // Defaults

	pkg, err := config.Check("schema", fset, []*ast.File{file}, nil)
	if err != nil {
		t.Fatalf("%v\n%s", err, source)
	}

	return pkg, file
}

func typeString(pkg *types.Package, typ types.Type) string {
	return types.TypeString(typ, func(other *types.Package) string {
		if other == pkg {
			return ""
		}

		return other.Name()
	})
}

// aliasOf returns the type an alias names, or nothing if not an alias.
func aliasOf(pkg *types.Package, object *types.TypeName) string {
	if alias, ok := object.Type().(*types.Alias); ok {
		return typeString(pkg, alias.Rhs())
	}

	return ""
}

func lookup(t *testing.T, pkg *types.Package, name string) *types.TypeName {
	t.Helper()

	object, ok := pkg.Scope().Lookup(name).(*types.TypeName)
	if !ok {
		t.Fatalf("no type %s", name)
	}

	return object
}

// fields returns the types of a struct's fields, by name.
func fields(t *testing.T, pkg *types.Package, name string) map[string]string {
	t.Helper()

	structure, ok := lookup(t, pkg, name).Type().Underlying().(*types.Struct)
	if !ok {
		t.Fatalf("%s is not a struct", name)
	}

	result := map[string]string{}
	for field := range structure.Fields() {
		result[field.Name()] = typeString(pkg, field.Type())
	}

	return result
}

func expectFields(t *testing.T, got, expected map[string]string) {
	t.Helper()

	for name, goType := range expected {
		if got[name] != goType {
			t.Errorf("field %s: got %q, expected %q", name, got[name], goType)
		}
	}

	if len(got) != len(expected) {
		t.Errorf("got fields %v", got)
	}
}

func TestObjectFields(t *testing.T) {
	t.Parallel()

	pkg, file := compile(t, objectCase().types)

	expectFields(t, fields(t, pkg, "Schema"), map[string]string{
		"Name":                 "string",
		"Nick":                 "*string",
		"Note":                 "Optional[*string]",
		"Meta":                 "json.RawMessage",
		"Friend":               "MaybeFriend",
		"MarshalJSON2":         "int64",
		"AB":                   "bool",
		"AB2":                  "*string",
		"F1x":                  "Null",
		"F\u540d":              "*map[string]json.RawMessage",
		"AdditionalProperties": "map[string]float64",
	})

	if got := aliasOf(pkg, lookup(t, pkg, "MaybeFriend")); got != "*Friend" {
		t.Errorf("MaybeFriend is %s", got)
	}

	var comments strings.Builder
	for _, group := range file.Comments {
		comments.WriteString(group.Text())
	}

	for _, text := range []string{"A title", "A description.", "format: email", "Deprecated: the schema is deprecated."} {
		if !strings.Contains(comments.String(), text) {
			t.Errorf("no comment %q", text)
		}
	}
}

func TestNamedTypes(t *testing.T) {
	t.Parallel()

	pkg, _ := compile(t, namedCase().types)

	for name, expected := range map[string]string{
		"Anything": "json.RawMessage", "Nothing": "Never", "Nil": "Null", "NullBoth": "Null", "Raw": "json.RawMessage",
		"MaybeText": "*string", "Alias": "Text",
	} {
		object := lookup(t, pkg, name)
		if got := aliasOf(pkg, object); got != expected {
			t.Errorf("%s: got alias of %q, expected an alias of %s", name, got, expected)
		}
	}

	for name, expected := range map[string]string{
		"Text": "string", "Count": "int64", "Yes": "bool", "Half": "float64", "Choice": "string", "Only": "string",
		"Prefixed": "string", "Both": "string", "NumberBoth": "float64", "BoolBoth": "bool", "List": "[]json.RawMessage",
	} {
		object := lookup(t, pkg, name)
		if got := typeString(pkg, object.Type().Underlying()); object.IsAlias() || got != expected {
			t.Errorf("%s: got alias %t of %s, expected a defined type of %s", name, object.IsAlias(), got, expected)
		}
	}

	schema := fields(t, pkg, "Schema")
	for name, expected := range map[string]string{"M": "map[string]int64", "Mt": "MaybeText", "En": "SchemaEn"} {
		if schema[name] != expected {
			t.Errorf("field %s: got %q, expected %q", name, schema[name], expected)
		}
	}

	expectFields(t, fields(t, pkg, "Loop"), map[string]string{"X": "*float64", "Y": "*float64"})
	expectFields(t, fields(t, pkg, "SchemaExtra"), map[string]string{"AdditionalProperties": "map[string]float64"})
	expectFields(t, fields(t, pkg, "SchemaEither"), map[string]string{
		"A": "float64", "B": "*SchemaEitherB", "C": "*float64",
	})
	expectFields(t, fields(t, pkg, "SchemaAnyObject"), map[string]string{
		"X": "*float64", "Y": "*float64", "AdditionalProperties": "map[string]json.RawMessage",
	})
	expectFields(t, fields(t, pkg, "SchemaEmpty"), map[string]string{})
}

func TestRecursiveFields(t *testing.T) {
	t.Parallel()

	pkg, _ := compile(t, []convert.NamedType{
		named("Schema", object(
			prop("self", ref("Schema"), false), prop("pair", ref("Pair"), false),
			prop("nested", object(prop("back", ref("Schema"), false)), false), prop("leaf", ref("Leaf"), false),
			prop("alias", ref("SchemaAlias"), false), prop("items", model.Array(ref("Schema")), false),
		)),
		named("Pair", model.Tuple([]model.Element{element(ref("Schema"), false)}, nil)),
		named("Leaf", object(prop("n", model.NumberType, false))),
		named("SchemaAlias", ref("Schema")),
		named("A", object(prop("b", ref("B"), false), prop("leaf", ref("Leaf"), false))),
		named("B", object(prop("a", ref("A"), false))),
	})

	expectFields(t, fields(t, pkg, "Schema"), map[string]string{
		"Self": "*Schema", "Pair": "*Pair", "Nested": "SchemaNested", "Leaf": "Leaf", "Alias": "*SchemaAlias",
		"Items": "[]Schema",
	})
	expectFields(t, fields(t, pkg, "SchemaNested"), map[string]string{"Back": "*Schema"})
	expectFields(t, fields(t, pkg, "Pair"), map[string]string{"Item0": "*Schema"})
	expectFields(t, fields(t, pkg, "A"), map[string]string{"B": "*B", "Leaf": "Leaf"})
	expectFields(t, fields(t, pkg, "B"), map[string]string{"A": "*A"})
}

func TestUnionConstants(t *testing.T) {
	t.Parallel()

	cases := map[string]testCase{}
	for _, item := range unionCases() {
		cases[item.name] = item
	}

	literals, _ := compile(t, cases["literals"].types)
	enums, _ := compile(t, cases["enums"].types)

	for pkg, constants := range map[*types.Package][]string{
		literals: {"SchemaStringX", "SchemaStringY", "SchemaNumber1", "SchemaNumberMinus1Point5", "SchemaNumber1E21"},
		enums:    {"SchemaA", "SchemaB", "SchemaEmpty"},
	} {
		for _, name := range constants {
			if _, ok := pkg.Scope().Lookup(name).(*types.Const); !ok {
				t.Errorf("no constant %s", name)
			}
		}
	}

	if got := typeString(literals, lookup(t, literals, "SchemaBoolean").Type().Underlying()); got != "bool" {
		t.Errorf("SchemaBoolean is %s", got)
	}
}

func TestGenerateFails(t *testing.T) {
	t.Parallel()

	if _, err := golang.Generate(objectCase().types, "1"); err == nil {
		t.Fatal("generated an invalid package name")
	}
}

func TestIdentifier(t *testing.T) {
	t.Parallel()

	for text, expected := range map[string]string{
		"": "Field", "--": "Field", "good-boy": "GoodBoy", "goodBoy": "GoodBoy", "user_id": "UserID", "1x": "F1x",
		"\u540d\u524d": "F\u540d\u524d", "url": "URL", "HTTPServer": "HTTPServer",
	} {
		if got := golang.Identifier(text, "Field"); got != expected {
			t.Errorf("%q: got %s, expected %s", text, got, expected)
		}
	}
}

// The harness reads each value into a case's Schema type, printing a line for each accepted value that isn't written
// back as the same JSON, and each rejected value that is read.
const harness = `package main

import (
	"encoding/json"
	"fmt"
	"reflect"
{{imports}})

func check[T any](name string, accept, reject []string) {
	for _, sample := range accept {
		var value T
		if err := json.Unmarshal([]byte(sample), &value); err != nil {
			fmt.Printf("%s: %s: %v\n", name, sample, err)
			continue
		}
		out, err := json.Marshal(value)
		var before, after any
		_ = json.Unmarshal([]byte(sample), &before)
		if err != nil || json.Unmarshal(out, &after) != nil || !reflect.DeepEqual(before, after) {
			fmt.Printf("%s: %s came back as %s (%v)\n", name, sample, out, err)
		}
	}
	for _, sample := range reject {
		var value T
		if err := json.Unmarshal([]byte(sample), &value); err == nil {
			fmt.Printf("%s: read %s\n", name, sample)
		}
	}
}

func main() {
{{calls}}}
`

func TestGeneratedJSON(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	var imports, calls strings.Builder

	for _, item := range allCases() {
		source, err := golang.Generate(item.types, item.name)
		if err != nil {
			t.Fatal(err)
		}

		writeFile(t, filepath.Join(dir, item.name, "schema.go"), source)

		imports.WriteString("\t\"harness/" + item.name + "\"\n")
		calls.WriteString("\tcheck[" + item.name + ".Schema](\"" + item.name + "\", " + goStrings(item.accept) + ", " +
			goStrings(item.reject) + ")\n")
	}

	writeFile(t, filepath.Join(dir, "go.mod"), []byte("module harness\n\ngo 1.24\n"))
	writeFile(t, filepath.Join(dir, "main.go"), []byte(strings.NewReplacer(
		"{{imports}}", imports.String(), "{{calls}}", calls.String()).Replace(harness)))

	command := exec.CommandContext(t.Context(), "go", "run", ".")
	command.Dir = dir

	output, err := command.CombinedOutput()
	if err != nil || len(output) > 0 {
		t.Fatalf("%v\n%s", err, output)
	}
}

// goStrings writes strings as a Go slice literal.
func goStrings(items []string) string {
	quoted := make([]string, len(items))
	for i, item := range items {
		quoted[i] = strconv.Quote(item)
	}

	return "[]string{" + strings.Join(quoted, ", ") + "}"
}

func writeFile(t *testing.T, name string, data []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(name), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(name, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
