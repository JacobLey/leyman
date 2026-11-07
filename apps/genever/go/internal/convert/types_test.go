package convert_test

import (
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

type typeCase struct {
	want   *model.Type
	schema string
}

func runTypeCases(t *testing.T, cases map[string]typeCase, options convert.Options) {
	t.Helper()

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			expectRoot(t, testCase.schema, options, testCase.want)
		})
	}
}

func template(prefix, suffix bool) *model.Type {
	var parts []model.TemplatePart
	if prefix {
		parts = append(parts, model.TemplatePart{IsString: true, Text: ""})
	}

	parts = append(parts, model.TemplatePart{IsString: false, Text: "abc"})

	if suffix {
		parts = append(parts, model.TemplatePart{IsString: true, Text: ""})
	}

	return model.Template(parts)
}

func TestPrimitives(t *testing.T) {
	t.Parallel()

	runTypeCases(t, map[string]typeCase{
		"string":          {model.StringType, `{ "type": "string" }`},
		"number":          {model.NumberType, `{ "type": "number" }`},
		"integer":         {model.IntegerType, `{ "type": "integer", "minimum": 0 }`},
		"fraction const":  {model.Literal(1.5), `{ "type": "number", "const": 1.5 }`},
		"null enum":       {model.Union(model.NullType, model.Literal("a")), `{ "type": ["null", "string"], "enum": [null, "a"] }`},
		"bounds":          {model.NumberType, `{ "type": ["number", "integer"], "minimum": 1, "exclusiveMinimum": 1, "maximum": 4, "exclusiveMaximum": 3 }`},
		"one value":       {model.NumberType, `{ "type": "number", "minimum": 2, "maximum": 2 }`},
		"looser bounds":   {model.IntegerType, `{ "type": "integer", "exclusiveMinimum": 0, "minimum": 1, "maximum": 5, "exclusiveMaximum": 9 }`},
		"equal bounds":    {model.IntegerType, `{ "type": "integer", "minimum": 1, "exclusiveMinimum": 1, "maximum": 3, "exclusiveMaximum": 3 }`},
		"boolean":         {model.BooleanType, `{ "type": "boolean" }`},
		"null":            {model.NullType, `{ "type": "null" }`},
		"array of types":  {model.Union(model.StringType, model.NullType), `{ "type": ["string", "null"] }`},
		"integer number":  {model.NumberType, `{ "type": ["integer", "number"] }`},
		"true":            {model.UnknownType, `true`},
		"false":           {model.NeverType, `false`},
		"empty schema":    {model.UnknownType, `{ "description": "Anything" }`},
		"starts with":     {template(false, true), `{ "type": "string", "pattern": "^abc" }`},
		"ends with":       {template(true, false), `{ "type": "string", "pattern": "abc$" }`},
		"contains":        {template(true, true), `{ "type": "string", "pattern": "abc" }`},
		"exact":           {model.Literal("abc"), `{ "type": "string", "pattern": "^abc$" }`},
		"escaped":         {model.Template([]model.TemplatePart{{IsString: false, Text: "a.b-c$"}, {IsString: true, Text: ""}}), `{ "type": "string", "pattern": "^a\\.b\\x2dc\\$" }`},
		"bad hex escape":  {model.StringType, `{ "type": "string", "pattern": "^a\\xg1" }`},
		"short hex":       {model.StringType, `{ "type": "string", "pattern": "^a\\x2" }`},
		"class":           {model.StringType, `{ "type": "string", "pattern": "^\\d+" }`},
		"special":         {model.StringType, `{ "type": "string", "pattern": "^a.c" }`},
		"unicode escape":  {model.StringType, `{ "type": "string", "pattern": "^\\u0041" }`},
		"anchors alone":   {model.StringType, `{ "type": "string", "pattern": "^$" }`},
		"end anchor":      {model.StringType, `{ "type": "string", "pattern": "$" }`},
		"lookahead":       {model.StringType, `{ "type": "string", "pattern": "^(?=a)" }`},
		"backreference":   {model.StringType, `{ "type": "string", "pattern": "^(a)\\1" }`},
		"named group":     {model.StringType, `{ "type": "string", "pattern": "^(?<a>b)" }`},
		"enum":            {model.Union(model.Literal("a"), model.Literal(1.0), model.Literal(true), model.NullType), `{ "enum": ["a", 1, true, null] }`},
		"object enum":     {model.Union(object(property("a", false, model.Tuple([]model.Element{element(false, model.Literal(1.0)), element(false, model.Literal("b"))}, nil))), model.Tuple(nil, nil)), `{ "enum": [{ "a": [1, "b"] }, []] }`},
		"typed enum":      {model.Union(model.Tuple([]model.Element{element(false, model.Literal(1.0))}, nil), object(property("a", false, model.NullType)), model.Literal(false)), `{ "type": ["array", "object", "boolean"], "enum": [[1], { "a": null }, false] }`},
		"empty enum":      {model.NeverType, `{ "enum": [] }`},
		"const":           {model.Literal("a"), `{ "const": "a" }`},
		"const null":      {model.NullType, `{ "const": null }`},
		"const and enum":  {model.Literal("a"), `{ "const": "a", "enum": ["a", "b"] }`},
		"integer const":   {model.Literal(2.0), `{ "type": "integer", "const": 2 }`},
		"infinite const":  {model.Literal(1.0), `{ "type": "number", "enum": [1, 1e400], "const": 1 }`},
		"string integer":  {model.Literal("a"), `{ "type": ["string", "integer"], "const": "a" }`},
		"negative zero":   {model.NumberType, `{ "type": "number", "minimum": -0, "maximum": 0 }`},
		"exclusive lower": {model.NumberType, `{ "type": "number", "exclusiveMinimum": 1, "maximum": 2 }`},
	}, strict())
}

func TestArrays(t *testing.T) {
	t.Parallel()

	tuple := func(rest *model.Type, elements ...model.Element) *model.Type { return model.Tuple(elements, rest) }

	runTypeCases(t, map[string]typeCase{
		"items":               {model.Array(model.StringType), `{ "type": "array", "items": { "type": "string" } }`},
		"no items":            {model.Array(model.UnknownType), `{ "type": "array", "uniqueItems": true }`},
		"items false":         {tuple(nil), `{ "type": "array", "items": false }`},
		"minItems is untyped": {model.Array(model.StringType), `{ "type": "array", "items": { "type": "string" }, "minItems": 1 }`},
		"tuple":               {tuple(nil, element(false, model.StringType), element(false, model.NumberType)), `{ "type": "array", "prefixItems": [{ "type": "string" }, { "type": "number" }], "items": false, "minItems": 2 }`},
		"tuple with items":    {tuple(model.BooleanType, element(false, model.StringType)), `{ "type": "array", "prefixItems": [{ "type": "string" }], "items": { "type": "boolean" }, "minItems": 1 }`},
		"tuple no items":      {tuple(model.UnknownType, element(false, model.StringType)), `{ "type": "array", "prefixItems": [{ "type": "string" }], "minItems": 1 }`},
		"optional items":      {tuple(nil, element(false, model.StringType), element(true, model.Union(model.NumberType, model.NullType))), `{ "type": "array", "prefixItems": [{ "type": "string" }, { "type": ["number", "null"] }], "items": false, "minItems": 1 }`},
		"truncated":           {tuple(nil, element(false, model.StringType)), `{ "type": "array", "prefixItems": [{ "type": "string" }, true], "maxItems": 1, "minItems": 1 }`},
		"draft 7":             {tuple(model.NullType, element(false, model.StringType), element(false, model.NumberType)), `{ "type": "array", "items": [{ "type": "string" }, { "type": "number" }], "additionalItems": { "type": "null" }, "minItems": 2 }`},
		"draft 7 no rest":     {tuple(model.UnknownType, element(false, model.StringType)), `{ "type": "array", "items": [{ "type": "string" }], "minItems": 1 }`},
		"contains":            {model.Array(model.UnknownType), `{ "type": "array", "contains": true, "minContains": 1, "maxContains": 2 }`},
		"maxContains alone":   {model.Array(model.UnknownType), `{ "type": "array", "maxContains": 0 }`},
	}, lax())
}

func TestObjects(t *testing.T) {
	t.Parallel()

	noKeys := model.Object(nil, []model.Index{index(model.StringType, model.NeverType)})
	xKey := model.Template([]model.TemplatePart{{IsString: false, Text: "x-"}, {IsString: true, Text: ""}})
	absent := func(name string) *model.Type { return object(property(name, true, model.NeverType)) }

	runTypeCases(t, map[string]typeCase{
		"properties":           {open(property("a", false, model.StringType), property("b", true, model.NumberType)), `{ "type": "object", "properties": { "a": { "type": "string" }, "b": { "type": "number" } }, "required": ["a"] }`},
		"never property":       {open(property("a", true, model.NeverType)), `{ "type": "object", "properties": { "a": false } }`},
		"any object":           {model.ObjectType, `{ "type": "object" }`},
		"no properties":        {noKeys, `{ "type": "object", "additionalProperties": false }`},
		"additional true":      {model.Object([]model.Property{property("a", true, model.StringType)}, []model.Index{index(model.StringType, model.UnknownType)}), `{ "type": "object", "properties": { "a": { "type": "string" } }, "additionalProperties": true }`},
		"additional false":     {object(property("a", true, model.StringType)), `{ "type": "object", "properties": { "a": { "type": "string" } }, "additionalProperties": false }`},
		"record":               {model.Object(nil, []model.Index{index(model.StringType, model.NumberType)}), `{ "type": "object", "additionalProperties": { "type": "number" } }`},
		"additional alone":     {model.Object([]model.Property{property("a", false, model.StringType)}, []model.Index{index(model.StringType, model.NumberType)}), `{ "type": "object", "properties": { "a": { "type": "string" } }, "required": ["a"], "additionalProperties": { "type": "number" } }`},
		"pattern":              {model.Object(nil, []model.Index{index(xKey, model.StringType), index(model.StringType, model.UnknownType)}), `{ "type": "object", "patternProperties": { "^x-": { "type": "string" } } }`},
		"exact pattern":        {open(property("abc", true, model.StringType)), `{ "type": "object", "patternProperties": { "^abc$": { "type": "string" } } }`},
		"pattern additional":   {model.Object(nil, []model.Index{index(xKey, model.StringType), index(model.StringType, model.NumberType)}), `{ "type": "object", "patternProperties": { "^x-": { "type": "string" } }, "additionalProperties": { "type": "number" } }`},
		"propertyNames":        {model.Object(nil, []model.Index{index(xKey, model.NumberType)}), `{ "type": "object", "propertyNames": { "pattern": "^x-" }, "additionalProperties": { "type": "number" } }`},
		"name enum":            {object(property("a", true, model.StringType), property("b", true, model.NumberType), property("c", true, model.NumberType)), `{ "type": "object", "properties": { "a": { "type": "string" } }, "propertyNames": { "enum": ["a", "b", "c"] }, "additionalProperties": { "type": "number" } }`},
		"name intersection":    {model.Object(nil, []model.Index{index(model.StringType, model.UnknownType)}), `{ "type": "object", "propertyNames": { "maxLength": 3, "allOf": [{ "pattern": "^a" }, { "pattern": "b$" }] }, "additionalProperties": true }`},
		"names true":           {model.Object(nil, []model.Index{index(model.StringType, model.NumberType)}), `{ "type": "object", "propertyNames": true, "additionalProperties": { "type": "number" } }`},
		"names false":          {noKeys, `{ "type": "object", "propertyNames": false, "additionalProperties": { "type": "number" } }`},
		"names not strings":    {noKeys, `{ "type": "object", "propertyNames": { "type": "string", "enum": [1] } }`},
		"unevaluated false":    {object(property("a", true, model.StringType)), `{ "type": "object", "properties": { "a": { "type": "string" } }, "unevaluatedProperties": false }`},
		"name enum open":       {object(property("a", true, model.StringType), property("b", true, model.UnknownType)), `{ "type": "object", "properties": { "a": { "type": "string" } }, "propertyNames": { "enum": ["a", "b"] } }`},
		"names false open":     {object(property("a", true, model.StringType)), `{ "type": "object", "properties": { "a": { "type": "string" } }, "propertyNames": false }`},
		"names no additional":  {model.Object([]model.Property{property("a", true, model.UnknownType)}, []model.Index{index(model.Template([]model.TemplatePart{{IsString: false, Text: "a"}, {IsString: true, Text: ""}}), model.UnknownType)}), `{ "type": "object", "properties": { "a": true }, "propertyNames": { "pattern": "^a" } }`},
		"required in allOf":    {model.Intersection(open(property("a", true, model.StringType)), open(property("a", false, model.StringType))), `{ "type": "object", "properties": { "a": { "type": "string" } }, "allOf": [{ "required": ["a"] }] }`},
		"required undeclared":  {open(property("a", false, model.UnknownType)), `{ "type": "object", "required": ["a"] }`},
		"dependentRequired":    {model.Intersection(open(property("a", true, model.StringType), property("b", true, model.NumberType)), model.Union(absent("a"), object(property("b", false, model.NumberType)))), `{ "type": "object", "properties": { "a": { "type": "string" }, "b": { "type": "number" } }, "dependentRequired": { "a": ["b"] } }`},
		"undeclared dependent": {model.Intersection(open(property("a", true, model.StringType)), model.Union(absent("a"), object(property("b", false, model.UnknownType)))), `{ "type": "object", "properties": { "a": { "type": "string" } }, "dependentRequired": { "a": ["b"] } }`},
		"dependentSchemas":     {model.Intersection(open(property("a", true, model.StringType), property("b", true, model.NumberType)), model.Union(absent("a"), open(property("b", false, model.NumberType)))), `{ "type": "object", "properties": { "a": { "type": "string" }, "b": { "type": "number" } }, "dependentSchemas": { "a": { "required": ["b"] } } }`},
		"dependencies":         {model.Intersection(open(property("a", true, model.StringType), property("c", true, model.BooleanType)), model.Union(absent("a"), object(property("c", false, model.BooleanType))), model.Union(absent("c"), open(property("a", false, model.StringType)))), `{ "type": "object", "properties": { "a": { "type": "string" }, "c": { "type": "boolean" } }, "dependencies": { "a": ["c"], "c": { "required": ["a"] } } }`},
		"empty dependent":      {model.Intersection(model.ObjectType, model.Union(absent("a"), object())), `{ "type": "object", "dependentRequired": { "a": [] } }`},
		"escaped pointer":      {open(property("a/b~c", true, model.StringType)), `{ "type": "object", "properties": { "a/b~c": { "type": "string" } } }`},
	}, lax())
}

func TestCompositions(t *testing.T) {
	t.Parallel()

	runTypeCases(t, map[string]typeCase{
		"allOf objects":     {model.Intersection(open(property("a", false, model.StringType)), open(property("b", true, model.NumberType))), `{ "allOf": [{ "type": "object", "properties": { "a": { "type": "string" } }, "required": ["a"] }, { "type": "object", "properties": { "b": { "type": "number" } } }] }`},
		"allOf contradicts": {model.NeverType, `{ "allOf": [{ "type": "string" }, { "type": "number" }] }`},
		"anyOf":             {model.Union(model.StringType, model.NumberType), `{ "anyOf": [{ "type": "string" }, { "type": "number" }] }`},
		"oneOf":             {model.Union(model.StringType, model.NumberType), `{ "oneOf": [{ "type": "string" }, { "type": "number" }] }`},
		"inherited type":    {model.Union(template(false, true), model.NullType), `{ "type": ["string", "null"], "allOf": [{ "pattern": "^abc" }] }`},
		"if then else":      {model.Union(model.Literal("a"), model.NumberType), `{ "if": { "type": "string" }, "then": { "const": "a" }, "else": { "type": "number" } }`},
		"if alone":          {model.UnknownType, `{ "if": { "type": "string" } }`},
		"not unknown":       {model.NeverType, `{ "type": "string", "not": {} }`},
		"not null":          {model.StringType, `{ "type": ["string", "null"], "not": { "type": "null" } }`},
		"not literals":      {model.Literal("b"), `{ "enum": ["a", "b", "c"], "not": { "enum": ["a", "c"] } }`},
		"not other":         {model.StringType, `{ "type": "string", "not": { "maxLength": 1 } }`},
		"discriminated":     {model.Union(open(property("kind", false, model.Literal("cat"))), open(property("kind", false, model.Literal("dog")))), `{ "type": "object", "discriminator": { "propertyName": "kind" }, "oneOf": [{ "properties": { "kind": { "const": "cat" } }, "required": ["kind"] }, { "properties": { "kind": { "const": "dog" } }, "required": ["kind"] }] }`},
	}, lax())
}

func TestDialects(t *testing.T) {
	t.Parallel()

	runTypeCases(t, map[string]typeCase{
		"nullable":         {model.Union(model.StringType, model.NullType), `{ "type": "string", "nullable": true }`},
		"not nullable":     {model.StringType, `{ "type": "string", "nullable": false }`},
		"boolean bounds":   {model.NumberType, `{ "type": "number", "minimum": 1, "exclusiveMinimum": true, "maximum": 2 }`},
		"openapi keywords": {model.StringType, `{ "type": "string", "example": "a", "xml": {}, "externalDocs": {} }`},
	}, openAPI30())

	openAPI31 := strict()
	openAPI31.Dialect = convert.OpenAPI31
	runTypeCases(t, map[string]typeCase{
		"openapi keywords": {model.StringType, `{ "type": "string", "example": "a" }`},
		"nullable ignored": {model.StringType, `{ "type": "string", "x-nullable": true }`},
	}, openAPI31)
}
