package convert_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// expectYAML parses YAML, and expects the JSON it holds.
func expectYAML(t *testing.T, text, expected string) {
	t.Helper()

	got, err := convert.ParseYAML([]byte(text))
	if err != nil {
		t.Fatalf("%q: %v", text, err)
	}

	want, err := jsonv.Parse([]byte(expected))
	if err != nil {
		t.Fatal(err)
	}

	if !jsonv.Equal(got, want) || jsonv.Stringify(got) != jsonv.Stringify(want) {
		t.Errorf("%q: got %s, expected %s", text, jsonv.Stringify(got), jsonv.Stringify(want))
	}
}

// expectYAMLError parses YAML, and expects an error of a kind, whose message has each of parts.
func expectYAMLError(t *testing.T, text string, kind error, parts ...string) {
	t.Helper()

	_, err := convert.ParseYAML([]byte(text))
	if !errors.Is(err, kind) {
		t.Fatalf("%q: got %v, expected %v", text, err, kind)
	}

	for _, part := range parts {
		if !strings.Contains(err.Error(), part) {
			t.Errorf("%q: %q has no %q", text, err.Error(), part)
		}
	}
}

func TestParseYAML(t *testing.T) {
	t.Parallel()

	expectYAML(t, "type: array\nitems: { type: string }\n", `{"type": "array", "items": {"type": "string"}}`)
	expectYAML(t, `{ "type": "string", "enum": ["on"] }`, `{"type": "string", "enum": ["on"]}`)
	expectYAML(t, "", `null`)
	expectYAML(t, "z: 1\na: 2\n", `{"z": 1, "a": 2}`)
	// Invalid schemas, for the converter to reject
	expectYAML(t, "properties: 1\nallOf: { a: 1 }\n", `{"properties": 1, "allOf": {"a": 1}}`)
}

func TestYAMLCoreSchema(t *testing.T) {
	t.Parallel()

	expectYAML(t, "[~, null, Null, NULL, ]", "[null,null,null,null]")
	expectYAML(t, "[true, True, FALSE, yes, on, n]", `[true, true, false, "yes", "on", "n"]`)
	expectYAML(t, "[0, -12, +7, 010, 0o17, 0x1F, 0b1, 1_000]", `[0, -12, 7, 10, 15, 31, "0b1", "1_000"]`)
	expectYAML(t, "[1.5, -.5, 2e3, 1., 1.5_0]", `[1.5, -0.5, 2000, 1, "1.5_0"]`)
	expectYAML(t, `[!!str 1, "2", '3', !!bool maybe]`, `["1", "2", "3", "maybe"]`)
	expectYAML(t, "{1: a, null: b, true: c}", `{"1": "a", "null": "b", "true": "c"}`)
	expectYAML(t, "x: 9007199254740993\n", `{"x": 9007199254740992}`)
}

func TestYAMLAliases(t *testing.T) {
	t.Parallel()

	expectYAML(t, "a: &a { b: [1] }\nc: *a\nd: &d 1\ne: *d\n",
		`{"a": {"b": [1]}, "c": {"b": [1]}, "d": 1, "e": 1}`)
	expectYAML(t, "&node\ntype: object\nproperties:\n  children: { type: array, items: *node }\n",
		`{"type": "object", "properties": {"children": {"type": "array", "items": {"$ref": "#"}}}}`)
	expectYAML(t, "$defs:\n  'a b': &n { items: *n }\n", `{"$defs": {"a b": {"items": {"$ref": "#/$defs/a%20b"}}}}`)
	expectYAML(t, "allOf: [&n { not: *n }]\n", `{"allOf": [{"not": {"$ref": "#/allOf/0"}}]}`)
	expectYAML(t, "$defs:\n  a: &a\n    $id: a.json\n    items: *a\n", `{"$defs": {"a": {"$id": "a.json", "items": {"$ref": "#"}}}}`)
	expectYAML(t, "$defs:\n  a: &a\n    $id: '#plain'\n    items: *a\n",
		`{"$defs": {"a": {"$id": "#plain", "items": {"$ref": "#/$defs/a"}}}}`)
}

func TestYAMLRecursiveAliasErrors(t *testing.T) {
	t.Parallel()

	expectYAMLError(t, "const: &c [*c]\n", gerr.ErrInvalidSchema, "only a schema can be recursive")
	expectYAMLError(t, "&s\nconst: *s\n", gerr.ErrInvalidSchema)
	// A collection of schemas isn't a schema
	expectYAMLError(t, "anyOf: &s [{ items: *s }]\n", gerr.ErrInvalidSchema)
	expectYAMLError(t, "&s\n$defs: { a: { $id: a.json, items: *s } }\n", gerr.ErrUnsupported, "$id in between")
}

func TestYAMLErrors(t *testing.T) {
	t.Parallel()

	expectYAMLError(t, "a: 1\na: 2\n", convert.ErrYAML, "line 2, column 1")
	expectYAMLError(t, "const: .inf\n", gerr.ErrInvalidSchema, ".inf")
	expectYAMLError(t, "const: -.Inf\n", gerr.ErrInvalidSchema)
	expectYAMLError(t, "const: .NaN\n", gerr.ErrInvalidSchema)
	expectYAMLError(t, "const: 1e400\n", gerr.ErrInvalidSchema)
	expectYAMLError(t, "const: 0x"+strings.Repeat("F", 300)+"\n", gerr.ErrInvalidSchema)
	expectYAMLError(t, "a: [\n", convert.ErrYAML)
	expectYAMLError(t, "a: 1\n---\nb: 2\n", convert.ErrYAML, "more than one document")
	expectYAMLError(t, "a: !!binary aGk=\n", convert.ErrYAML, "!!binary")
	expectYAMLError(t, "a: !thing [1]\n", convert.ErrYAML, "!thing")
	expectYAMLError(t, "a: !thing { b: 1 }\n", convert.ErrYAML, "!thing")
	expectYAMLError(t, "? [a]\n: 1\n", convert.ErrYAML, "not a string")
	// yaml.v3 names the anchor, but not where its alias is
	expectYAMLError(t, "type: object\nproperties:\n  a: *b\n", convert.ErrYAML, "anchor 'b'")
}

func TestYAMLMerge(t *testing.T) {
	t.Parallel()

	expectYAML(t, "m: &m { b: 1 }\ns: &s [*m, { c: 2 }]\nd: { <<: *s }\ne: { <<: [*m, { f: 3 }] }\ng: { <<: [] }\n",
		`{"m": {"b": 1}, "s": [{"b": 1}, {"c": 2}], "d": {"b": 1, "c": 2}, "e": {"b": 1, "f": 3}, "g": {}}`)
	expectYAML(t, "a: &a { b: 1 }\nc: { <<: *a }\nd: { \"<<\": 2 }\n", `{"a": {"b": 1}, "c": {"b": 1}, "d": {"<<": 2}}`)
	expectYAML(t, "a: &a { b: 1, c: 2 }\nd: { b: 0, <<: *a, c: 3 }\n", `{"a": {"b": 1, "c": 2}, "d": {"b": 0, "c": 3}}`)
	expectYAML(t, "<<: { properties: { a: { type: string } } }\n", `{"properties": {"a": {"type": "string"}}}`)
}

func TestYAMLMergeErrors(t *testing.T) {
	t.Parallel()

	for text, position := range map[string]string{
		"properties: &p\n  a: { type: string }\n  <<: *p\n": "line 3, column 7",
		"a: &a\n  b: { <<: [{ c: 1 }, *a] }\n":              "line 2, column 23",
		"a: &a [{ <<: *a }]\n":                              "line 1, column 14",
		"a: &a { b: &s [*a], <<: *s }\n":                    "line 1, column 16",
	} {
		expectYAMLError(t, text, convert.ErrYAML, "is inside the map", position)
	}

	for text, position := range map[string]string{
		"a: { <<: 1 }\n":             "line 1, column 10",
		"a: { <<: [{ b: 1 }, 2] }\n": "line 1, column 21",
		"a: { <<: [[{ b: 1 }]] }\n":  "line 1, column 11",
		"n: &n 1\na: { <<: *n }\n":   "line 2, column 10",
		"n: &n 1\na: { <<: [*n] }\n": "line 2, column 11",
		"? <<\n":                     "line 1, column 3",
		"a: { <<: }\n":               "line 1, column 6",
		"a:\n  <<:\n":                "line 2, column 3",
	} {
		expectYAMLError(t, text, convert.ErrYAML, "can only merge a map or a sequence of maps", position)
	}

	expectYAMLError(t, "a: { <<: *x }\n", convert.ErrYAML, "x")
	expectYAMLError(t, "<<: { const: .inf }\n", gerr.ErrInvalidSchema)
	expectYAMLError(t, "a: { <<: [{ b: !!binary aGk= }] }\n", convert.ErrYAML, "!!binary")
}
