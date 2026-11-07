package convert_test

import (
	"errors"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
)

func openAPI30() convert.Options {
	options := strict()
	options.Dialect = convert.OpenAPI30

	return options
}

func TestErrorDetails(t *testing.T) {
	t.Parallel()

	err := convertError(t, `{ "type": "object", "properties": { "a": { "type": "foo" } } }`, strict())
	if !errors.Is(err, gerr.ErrInvalidSchema) || err.Pointer != "#/properties/a/type" {
		t.Errorf("got %v", err)
	}
}

func TestInvalidSchema(t *testing.T) {
	t.Parallel()

	runInvalid(t, map[string]string{
		"schema is not an object":                      `{ "type": "array", "items": "string" }`,
		"schema is an array":                           `[]`,
		"type is empty":                                `{ "type": [] }`,
		"type is unknown":                              `{ "type": "date" }`,
		"type is not a string":                         `{ "type": ["string", 1] }`,
		"prefix item is invalid":                       `{ "type": "array", "prefixItems": [{ "type": 1 }] }`,
		"enum is not an array":                         `{ "enum": "a" }`,
		"allOf is empty":                               `{ "allOf": [] }`,
		"anyOf is not an array":                        `{ "anyOf": {} }`,
		"properties is not an object":                  `{ "type": "object", "properties": [] }`,
		"required is not strings":                      `{ "type": "object", "required": [1] }`,
		"required is not an array":                     `{ "type": "object", "required": "a" }`,
		"patternProperties is not an object":           `{ "type": "object", "patternProperties": true }`,
		"pattern is not a string":                      `{ "type": "string", "pattern": 1 }`,
		"pattern is not a regular expression":          `{ "type": "string", "pattern": "(" }`,
		"property pattern is not a regular expression": `{ "type": "object", "patternProperties": { "(": true } }`,
		"minItems is negative":                         `{ "type": "array", "minItems": -1 }`,
		"minItems is not an integer":                   `{ "type": "array", "minItems": 1.5 }`,
		"prefixItems is not an array":                  `{ "type": "array", "prefixItems": {} }`,
		"dependentRequired is not an object":           `{ "type": "object", "dependentRequired": [] }`,
		"dependentRequired is not strings":             `{ "type": "object", "dependentRequired": { "a": [1] } }`,
		"nullable is not a boolean":                    `{ "type": "string", "nullable": "yes" }`,
		"minLength is not an integer":                  `{ "type": "string", "minLength": "a" }`,
		"maxLength is not an integer":                  `{ "type": "string", "maxLength": "a" }`,
		"maxItems is negative":                         `{ "type": "array", "maxItems": -1 }`,
		"minProperties is negative":                    `{ "type": "object", "minProperties": -1 }`,
		"maxProperties is negative":                    `{ "type": "object", "maxProperties": -1 }`,
		"minimum is not a number":                      `{ "type": "number", "minimum": "1" }`,
		"exclusiveMaximum is not a boolean":            `{ "type": "number", "exclusiveMaximum": "1" }`,
		"discriminator is not an object":               `{ "type": "object", "discriminator": 1 }`,
		"discriminator has no propertyName":            `{ "type": "object", "discriminator": {} }`,
		"discriminator mapping is not object":          `{ "type": "object", "required": ["a"], "properties": { "a": true }, "discriminator": { "propertyName": "a", "mapping": 1 } }`,
		"additionalProperties is not a schema":         `{ "type": "object", "additionalProperties": 1 }`,
		"items is not a schema":                        `{ "type": "array", "items": 1 }`,
		"propertyNames is not a schema":                `{ "type": "object", "propertyNames": 1 }`,
		"not is not a schema":                          `{ "not": 1 }`,
		"if is not a schema":                           `{ "if": 1 }`,
		"dependentSchemas is not a schema":             `{ "type": "object", "dependentSchemas": { "a": 1 } }`,
		"property is not a schema":                     `{ "type": "object", "properties": { "a": 1 } }`,
		"anyOf member is not a schema":                 `{ "anyOf": [1] }`,
		"patternProperties value not a schema":         `{ "type": "object", "patternProperties": { "^a": 1 } }`,
	})
}

func TestInvalidReferences(t *testing.T) {
	t.Parallel()

	runInvalid(t, map[string]string{
		"$ref is not a string":                        `{ "$ref": 1 }`,
		"$ref does not resolve":                       `{ "$ref": "#/$defs/Missing" }`,
		"$ref through a primitive":                    `{ "$ref": "#/type/foo", "type": "string" }`,
		"$ref through an array":                       `{ "$ref": "#/allOf/1", "allOf": [true] }`,
		"$ref to an array index that is not a number": `{ "$ref": "#/allOf/a", "allOf": [true] }`,
		"$ref is not encoded":                         `{ "$ref": "#/%E0%A4%A" }`,
		"$ref is not a URI":                           `{ "$ref": "https://[" }`,
		"$ref names a missing anchor":                 `{ "$ref": "#missing" }`,
		"$ref through aliases to itself": `{
			"$ref": "a.json",
			"$defs": { "A": { "$id": "a.json", "$ref": "b.json" }, "B": { "$id": "b.json", "$ref": "a.json" } }
		}`,
		"$ref through an alias that does not resolve": `{
			"$ref": "a.json", "$defs": { "A": { "$id": "a.json", "$ref": "#/missing" } }
		}`,
		"$id is not a string":               `{ "$id": 1 }`,
		"$id has a fragment":                `{ "$defs": { "A": { "$id": "a.json#b" } } }`,
		"$id is not a URI":                  `{ "$defs": { "A": { "$id": "https://[" } } }`,
		"$id declared twice":                `{ "$defs": { "A": { "$id": "a.json" }, "B": { "$id": "a.json" } } }`,
		"anchor declared twice":             `{ "$defs": { "A": { "$anchor": "a" }, "B": { "$anchor": "a" } } }`,
		"anchor is not a name":              `{ "$defs": { "A": { "$anchor": "1a" } } }`,
		"anchor is not a string":            `{ "$defs": { "A": { "$anchor": 1 } } }`,
		"anchor is null":                    `{ "$defs": { "A": { "$anchor": null } } }`,
		"$defs is not an object":            `{ "$defs": [] }`,
		"definitions is not an object":      `{ "definitions": 1 }`,
		"definition is not a schema":        `{ "$defs": { "A": 1 } }`,
		"referenced schema is not a schema": `{ "$ref": "#/$defs/A/const", "$defs": { "A": { "const": 1 } } }`,
		"root $id is not a URI":             `{ "$id": "%zz" }`,
	})
}

func runInvalid(t *testing.T, invalid map[string]string) {
	t.Helper()

	for name, schema := range invalid {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			if err := convertError(t, schema, openAPI30()); !errors.Is(err, gerr.ErrInvalidSchema) {
				t.Errorf("got %v", err)
			}
		})
	}
}

func TestStrictMode(t *testing.T) {
	t.Parallel()

	nonStrict := map[string]string{
		"unknown keyword":                  `{ "type": "string", "foo": 1 }`,
		"OpenAPI 3.0 keyword":              `{ "type": "string", "nullable": true }`,
		"OpenAPI keyword":                  `{ "type": "string", "xml": {} }`,
		"type keyword without a type":      `{ "maxLength": 1 }`,
		"keyword for another type":         `{ "type": "number", "maxLength": 1 }`,
		"required property not declared":   `{ "type": "object", "properties": { "a": true }, "required": ["b"] }`,
		"then without if":                  `{ "type": "string", "then": { "maxLength": 1 } }`,
		"else without if":                  `{ "type": "string", "else": { "maxLength": 1 } }`,
		"enum value of another type":       `{ "type": "string", "enum": ["a", 1] }`,
		"const of another type":            `{ "type": "integer", "const": 1.5 }`,
		"minLength greater than maxLength": `{ "type": "string", "minLength": 3, "maxLength": 2 }`,
		"minimum greater than maximum":     `{ "type": "number", "minimum": 3, "maximum": 2 }`,
		"no integer between bounds":        `{ "type": "integer", "exclusiveMinimum": 1, "maximum": 1.5 }`,
		"minItems greater than maxItems":   `{ "type": "array", "minItems": 3, "maxItems": 2 }`,
		"minContains greater than maxContains": `{
			"type": "array", "contains": true, "minContains": 3, "maxContains": 2
		}`,
		"minItems more than the tuple":     `{ "type": "array", "prefixItems": [true], "items": false, "minItems": 2 }`,
		"maxItems less than prefixItems":   `{ "type": "array", "prefixItems": [true, true], "maxItems": 1 }`,
		"required property never valid":    `{ "type": "object", "properties": { "a": false }, "required": ["a"] }`,
		"more required than maxProperties": `{ "type": "object", "properties": { "a": true }, "required": ["a"], "maxProperties": 0 }`,
		"minProperties more than allowed":  `{ "type": "object", "additionalProperties": false, "minProperties": 1 }`,
		"reference back to itself":         `{ "anyOf": [{ "$ref": "#" }, { "type": "string" }] }`,
		"discriminator not required":       `{ "type": "object", "discriminator": { "propertyName": "a" } }`,
		"discriminator required by one":    `{ "type": "object", "discriminator": { "propertyName": "a" }, "oneOf": [{ "required": ["a"] }, true] }`,
		"discriminator mapping missing":    `{ "type": "object", "required": ["a"], "properties": { "a": true }, "discriminator": { "propertyName": "a", "mapping": { "b": "B" } } }`,
		"discriminator mapping not a $ref": `{ "type": "object", "required": ["a"], "properties": { "a": true }, "discriminator": { "propertyName": "a", "mapping": { "b": 1 } } }`,
		"id outside draft-04":              `{ "type": "string", "id": "a" }`,
		"dependentSchemas inherits object": `{ "type": "object", "dependentSchemas": { "a": { "maxLength": 1 } } }`,
		"propertyNames inherits string":    `{ "type": "object", "propertyNames": { "minimum": 1 } }`,
	}
	for name, schema := range nonStrict {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			if err := convertError(t, schema, strict()); !errors.Is(err, gerr.ErrStrictMode) {
				t.Errorf("got %v", err)
			}

			convertSchema(t, schema, lax())
		})
	}
}

func TestStrictModeAllows(t *testing.T) {
	t.Parallel()

	for _, schema := range []string{
		`{ "type": "string", "x-foo": 1 }`,
		`{ "type": "integer", "minimum": 0 }`,
		`{ "type": "string", "nullable": true, "example": "a" }`,
		`{ "type": "object", "properties": { "a": true }, "discriminator": { "propertyName": "a" }, "anyOf": [{ "required": ["a"] }, { "allOf": [{ "required": ["a"] }] }] }`,
		`{ "type": "object", "discriminator": { "propertyName": "a", "mapping": { "b": "#/$defs/B" } }, "oneOf": [{ "$ref": "#/$defs/B" }], "$defs": { "B": { "type": "object", "required": ["a"], "properties": { "a": true } } } }`,
		`{ "type": "object", "discriminator": { "propertyName": "a" }, "allOf": [{ "$ref": "#/$defs/missing" }] }`,
	} {
		t.Run(schema, func(t *testing.T) {
			t.Parallel()

			if _, err := convertJSON(t, schema, openAPI30()); err != nil && !errors.Is(err, gerr.ErrInvalidSchema) {
				t.Errorf("got %v", err)
			}
		})
	}
}

func TestUnsupported(t *testing.T) {
	t.Parallel()

	for _, schema := range []string{`{ "$ref": "other.json#/$defs/A" }`, `{ "$dynamicRef": "#node" }`} {
		if err := convertError(t, schema, lax()); !errors.Is(err, gerr.ErrUnsupported) {
			t.Errorf("%s: got %v", schema, err)
		}
	}
}

func TestErrorPointers(t *testing.T) {
	t.Parallel()

	cases := []struct{ schema, pointer, message string }{
		{`{ "type": "string", "foo": 1 }`, "#/foo", `Unknown keyword "foo"`},
		{`{ "type": "number", "maxLength": 1 }`, "#/maxLength", `"maxLength" only applies to type "string", not "number"`},
		{`{ "maxLength": 1 }`, "#/maxLength", `"maxLength" only applies to type "string", but the schema has no type`},
		{`{ "type": "string", "enum": ["a", 1] }`, "#", `1 is never valid, as it is not of the schema's type`},
		{`{ "type": "string", "minLength": 3, "maxLength": 2 }`, "#", `"minLength" is greater than "maxLength", so no value is valid`},
		{`{ "type": "number", "minimum": 3, "maximum": 2 }`, "#", `The minimum and maximum allow no number, so no value is valid`},
		{`{ "type": "string", "then": true }`, "#/then", `"then" has no effect without "if"`},
		{`{ "type": "object", "properties": { "a": true }, "required": ["b"] }`, "#/required", `Required property "b" is not in "properties"`},
		{`{ "type": "array", "prefixItems": [true, true], "maxItems": 1 }`, "#", `"maxItems" is less than the number of "prefixItems", so the last are never valid`},
		{`{ "$ref": "#/$defs/Missing" }`, "#/$ref", `$ref "#/$defs/Missing" does not resolve to a schema in the document`},
		{`{ "$defs": { "A": { "$id": "a.json" }, "B": { "$id": "a.json" } } }`, "#/$defs/B/$id", `"https://genever.invalid/a.json" is already declared at #/$defs/A`},
		{`{ "$dynamicRef": "#a" }`, "#/$dynamicRef", `"$dynamicRef" is not supported`},
		{`{ "type": "string", "pattern": "(" }`, "#/pattern", `Invalid regular expression "("`},
		{`{ "type": ["string", "date"] }`, "#/type", "type must be one of, or an array of, array, boolean, integer, null, number, object, string"},
		{`{ "type": "object", "discriminator": {} }`, "#/discriminator/propertyName", "discriminator must have a propertyName"},
		{`{ "anyOf": [{ "$ref": "#" }, true] }`, "#/anyOf/0/$ref", `$ref "#" refers back to a schema it is part of, without a property or item in between, so it never matches`},
	}
	for _, testCase := range cases {
		err := convertError(t, testCase.schema, strict())

		var geneverError *gerr.Error
		if !errors.As(err, &geneverError) || geneverError.Pointer != testCase.pointer ||
			geneverError.Message != testCase.message {
			t.Errorf("%s:\n got %v\nwant %s (at %s)", testCase.schema, err, testCase.message, testCase.pointer)
		}
	}
}
