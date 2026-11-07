// Package genever generates Go types from JSON Schema, with strict schema checks.
//
// The root schema becomes a type named Schema (or Options.Name), and each definition in its `$defs` (or draft 7
// `definitions`) a type named after its key. Objects are structs, unions are a struct holding one of their variants,
// tuples are structs written as JSON arrays, and an optional property is a pointer, or Optional where a pointer can't
// tell an absent value from null. The output has no dependency on genever: the few helper types it uses are written
// into the file.
//
// An OpenAPI 3.0 or 3.1 document (one with an `openapi` version) is read too: each of its `components.schemas` becomes
// a type named after its key, and its schemas are in the document's dialect. Its operations have no types.
//
// The types only decide which Go value holds a JSON value. They don't validate: check values against the schema with
// a validator, such as github.com/santhosh-tekuri/jsonschema.
package genever

import (
	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/golang"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
)

// Options of Generate. The zero value generates type Schema in package schema, in strict mode.
type Options struct {
	// Name of the root schema's type. Defaults to Schema. An OpenAPI document has no root schema.
	Name string
	// Package of the generated file. Defaults to schema.
	Package string
	// BaseURI is where the schema was read from, which relative `$id`s and `$ref`s resolve against. Defaults to a
	// placeholder, so only references within the document resolve.
	BaseURI string
	// OpenAPI30 reads the schema as an OpenAPI 3.0 schema, which allows `nullable` and `example`. An OpenAPI document
	// is read in the version it states.
	OpenAPI30 bool
	// NoStrict accepts schemas that are valid, but most likely mistakes, such as an unknown keyword. The types then
	// follow what a validator accepts, and are never narrower.
	NoStrict bool
}

// An Error is a problem with a schema, at a JSON Pointer. Match its kind with errors.Is: ErrInvalidSchema,
// ErrStrictMode, ErrUnsupported or ErrLoad.
type Error = gerr.Error

// Kinds of Error.
var (
	// ErrInvalidSchema is a schema that is not valid JSON Schema, e.g. `properties` is not an object, or a `$ref` that
	// does not resolve.
	ErrInvalidSchema = gerr.ErrInvalidSchema
	// ErrStrictMode is a schema strict mode rejects: valid, but most likely a mistake.
	ErrStrictMode = gerr.ErrStrictMode
	// ErrUnsupported is a schema using a feature genever can't generate types for, such as `$dynamicRef`.
	ErrUnsupported = gerr.ErrUnsupported
	// ErrLoad is a file or URL the schema references that could not be loaded.
	ErrLoad = gerr.ErrLoad
	// ErrSyntax is input that is not JSON.
	ErrSyntax = jsonv.ErrSyntax
)

// Generate generates Go types from a JSON Schema, and returns the source of a Go file, formatted as gofmt does. It
// reads one document, and loads nothing: a `$ref` to another document fails with ErrUnsupported. GenerateFile loads
// the files and URLs a schema refers to.
func Generate(schema []byte, options Options) ([]byte, error) {
	root, err := jsonv.Parse(schema)
	if err != nil {
		return nil, err //nolint:wrapcheck // ErrSyntax is the error, already saying what is wrong
	}

	return generate(root, options, nil)
}

// generate generates Go types from a schema or OpenAPI document, with the files it refers to, as Load returns them.
func generate(root jsonv.Value, options Options, files map[string]convert.OpenAPIFile) ([]byte, error) {
	name := options.Name
	if name == "" {
		name = "Schema"
	}

	pkg := options.Package
	if pkg == "" {
		pkg = "schema"
	}

	baseURI := options.BaseURI
	if baseURI == "" {
		baseURI = convert.DefaultBaseURI
	}

	documentDialect, isDocument, err := convert.DocumentDialect(root)
	if err != nil {
		return nil, err //nolint:wrapcheck // An Error, whose kind and pointer callers read
	}

	dialect := convert.Draft202012
	if options.OpenAPI30 {
		dialect = convert.OpenAPI30
	}

	if isDocument {
		dialect = documentDialect
	}

	convertOptions := convert.Options{BaseURI: baseURI, Dialect: dialect, Files: files, Strict: !options.NoStrict}

	var types []convert.NamedType
	if isDocument {
		types, err = convert.Document(root, convertOptions)
	} else {
		types, err = convert.Convert(root, name, convertOptions)
	}

	if err != nil {
		return nil, err //nolint:wrapcheck // An Error, whose kind and pointer callers read
	}

	return golang.Generate(types, pkg) //nolint:wrapcheck // Only fails on a bug in genever, which the error says
}
