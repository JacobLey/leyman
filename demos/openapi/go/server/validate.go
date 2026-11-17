package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

	"github.com/JacobLey/leyman/demos/openapi/go/internal/openapi"
)

// documentURL is where the compiler keeps the document. Every schema is compiled from a pointer into it, or refers
// into it, so its $refs resolve exactly as they do in the document.
const documentURL = "mem:///openapi.json"

// validators are an operation's schemas, compiled once.
type validators struct {
	// path and query are each one object schema of the parameters in that location, so they validate together.
	path  *jsonschema.Schema
	query *jsonschema.Schema
	// body is nil without a request body.
	body      *jsonschema.Schema
	responses map[int]*jsonschema.Schema
}

// ecmaRegexp compiles a pattern written for ECMAScript, as JSON Schema's are
// (https://json-schema.org/draft/2020-12/json-schema-core#section-6.4), with Go's regexp. The one difference the
// document needs is \uXXXX, which Go writes \x{XXXX}: the patterns refuse NUL as ^[^\u0000]*$.
func ecmaRegexp(pattern string) (jsonschema.Regexp, error) { //nolint:ireturn // As UseRegexpEngine takes it
	var builder strings.Builder

	for index := 0; index < len(pattern); index++ {
		if pattern[index] != '\\' || index+1 == len(pattern) {
			builder.WriteByte(pattern[index])

			continue
		}

		if pattern[index+1] == 'u' && index+6 <= len(pattern) && isHex(pattern[index+2:index+6]) {
			builder.WriteString(`\x{` + pattern[index+2:index+6] + `}`)
			index += 5
		} else {
			builder.WriteString(pattern[index : index+2])
			index++
		}
	}

	compiled, err := regexp.Compile(builder.String())
	if err != nil {
		return nil, fmt.Errorf("pattern %q: %w", pattern, err)
	}

	return compiled, nil
}

func isHex(text string) bool {
	for _, char := range text {
		if !unicode.Is(unicode.ASCII_Hex_Digit, char) {
			return false
		}
	}

	return true
}

// newCompiler is a JSON Schema 2020-12 compiler (as OpenAPI 3.1 uses) holding the whole document, asserting formats
// (uuid, date-time) as the TypeScript server's ajv-formats does.
func newCompiler(document []byte) (*jsonschema.Compiler, error) {
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	compiler.AssertFormat()
	compiler.UseRegexpEngine(ecmaRegexp)

	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(document))
	if err != nil {
		return nil, fmt.Errorf("reading the document: %w", err)
	}

	// A new compiler, so nothing is at the URL yet
	_ = compiler.AddResource(documentURL, doc)

	return compiler, nil
}

// compileParameters compiles one object schema for an operation's parameters in a location, each property a $ref to
// the parameter's schema in the document, with additionalProperties false.
func compileParameters(
	compiler *jsonschema.Compiler,
	operation openapi.Operation,
	location string,
) (*jsonschema.Schema, error) {
	properties := map[string]any{}
	required := []any{}

	for _, parameter := range operation.Parameters {
		if parameter.In != location {
			continue
		}

		properties[parameter.Name] = map[string]any{"$ref": documentURL + "#" + parameter.Pointer}
		if parameter.Required {
			required = append(required, parameter.Name)
		}
	}

	url := "mem:///operations/" + operation.ID + "/" + location + ".json"
	if err := compiler.AddResource(url, map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	}); err != nil {
		return nil, fmt.Errorf("adding %s's %s parameters: %w", operation.ID, location, err)
	}

	return compileSchema(compiler, url)
}

func compileSchema(compiler *jsonschema.Compiler, url string) (*jsonschema.Schema, error) {
	schema, err := compiler.Compile(url)
	if err != nil {
		return nil, fmt.Errorf("compiling %s: %w", url, err)
	}

	return schema, nil
}

// compileOperation compiles every schema of an operation.
func compileOperation(compiler *jsonschema.Compiler, operation openapi.Operation) (validators, error) {
	compiled := validators{path: nil, query: nil, body: nil, responses: map[int]*jsonschema.Schema{}}

	var err error

	if compiled.path, err = compileParameters(compiler, operation, "path"); err != nil {
		return validators{}, err
	}

	if compiled.query, err = compileParameters(compiler, operation, "query"); err != nil {
		return validators{}, err
	}

	if operation.BodyPointer != "" {
		if compiled.body, err = compileSchema(compiler, documentURL+"#"+operation.BodyPointer); err != nil {
			return validators{}, err
		}
	}

	for status, pointer := range operation.Responses {
		if compiled.responses[status], err = compileSchema(compiler, documentURL+"#"+pointer); err != nil {
			return validators{}, err
		}
	}

	return compiled, nil
}

// jsWhitespace is what ECMAScript's StringToNumber trims: WhiteSpace and LineTerminator
// (https://tc39.es/ecma262/#sec-tonumber-applied-to-the-string-type).
func jsWhitespace(char rune) bool {
	return unicode.Is(unicode.Zs, char) || strings.ContainsRune("\t\n\v\f\r\u2028\u2029\ufeff", char)
}

// decimalLiteral is ECMAScript's StrDecimalLiteral, without Infinity.
var decimalLiteral = regexp.MustCompile(`^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`)

// jsNumber is a string as ECMAScript's StringToNumber reads it, for the strings Ajv coerces to numbers: any whose
// Number() equals it, so "5", " 5", "0x10" and "1e2" but not "" or "5px"
// (https://ajv.js.org/coercion.html). Only a finite number is returned: Ajv would coerce "Infinity", which no
// schema here accepts.
func jsNumber(text string) (float64, bool) {
	trimmed := strings.TrimFunc(text, jsWhitespace)
	if text == "" {
		return 0, false
	}

	if trimmed == "" {
		return 0, true
	}

	for prefix, base := range radixPrefixes {
		if digits, ok := strings.CutPrefix(trimmed, prefix); ok {
			value, err := strconv.ParseUint(digits, base, 64)

			return float64(value), err == nil
		}
	}

	if !decimalLiteral.MatchString(trimmed) {
		return 0, false
	}

	value, err := strconv.ParseFloat(trimmed, 64)

	return value, err == nil
}

// radixPrefixes are ECMAScript's NonDecimalIntegerLiteral prefixes, and the base of each.
//
//nolint:gochecknoglobals,mnd // Never changed, and the bases are what the prefixes mean
var radixPrefixes = map[string]int{"0x": 16, "0X": 16, "0o": 8, "0O": 8, "0b": 2, "0B": 2}

// maxSafeInteger is ECMAScript's Number.MAX_SAFE_INTEGER, the largest integer a float64 holds exactly.
const maxSafeInteger = 1<<53 - 1

// coerce converts a parameter's string to its schema's type, as Ajv's coerceTypes does: a string is left alone when
// the schema allows strings or has no type, and is otherwise tried as each type in turn. A string none fits is left
// as it is, for validation to refuse.
func coerce(text string, types []string) any {
	if len(types) == 0 || slices.Contains(types, "string") {
		return text
	}

	for _, kind := range types {
		if value, ok := coerceTo(text, kind); ok {
			return value
		}
	}

	return text
}

// coerceTo converts a string to one type, if it can be.
func coerceTo(text, kind string) (any, bool) {
	switch kind {
	case "number", "integer":
		value, ok := jsNumber(text)
		if !ok {
			return nil, false
		}

		if value == math.Trunc(value) && math.Abs(value) <= maxSafeInteger {
			return json.Number(strconv.FormatInt(int64(value), 10)), true
		}

		return json.Number(strconv.FormatFloat(value, 'g', -1, 64)), true
	case "boolean":
		return text == "true", text == "true" || text == "false"
	case "null":
		return nil, text == ""
	default:
		return nil, false
	}
}

// parameterValues are an operation's parameters in a location, coerced to their schemas' types, with each absent
// parameter's default filled in. Names the operation doesn't have stay as strings, for validation to refuse.
func parameterValues(operation openapi.Operation, location string, lookup func(name string) (string, bool)) map[string]any {
	values := map[string]any{}

	for _, parameter := range operation.Parameters {
		if parameter.In != location {
			continue
		}

		if text, ok := lookup(parameter.Name); ok {
			values[parameter.Name] = coerce(text, parameter.Schema.Types())
		} else if parameter.Schema.Default != nil {
			value, _ := jsonschema.UnmarshalJSON(bytes.NewReader(parameter.Schema.Default)) // Read from the document already
			values[parameter.Name] = value
		}
	}

	return values
}

//nolint:gochecknoglobals // Never changed
var printer = message.NewPrinter(language.English)

// describe says why a value doesn't match a schema, in one line: each failed keyword, where in the value it failed.
func describe(location string, err error) string {
	// Validate only fails with a ValidationError
	validation := new(jsonschema.ValidationError)
	errors.As(err, &validation)

	var reasons []string

	var walk func(*jsonschema.ValidationError)

	walk = func(current *jsonschema.ValidationError) {
		if len(current.Causes) == 0 {
			where := location
			if len(current.InstanceLocation) > 0 {
				where += "/" + strings.Join(current.InstanceLocation, "/")
			}

			reasons = append(reasons, where+" "+current.ErrorKind.LocalizedString(printer))
		}

		for _, cause := range current.Causes {
			walk(cause)
		}
	}

	walk(validation)

	return strings.Join(reasons, ", ")
}
