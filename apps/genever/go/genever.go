// Package genever generates Go types from JSON Schema, with strict schema checks.
//
// The root schema becomes a type named Schema (or Options.Name), and each definition in its `$defs` (or draft 7
// `definitions`) a type named after its key. Objects are structs, unions are a struct holding one of their variants,
// tuples are structs written as JSON arrays, and an optional property is a pointer, or Optional where a pointer can't
// tell an absent value from null. The output has no dependency on genever: the few helper types it uses are written
// into the file.
//
// An OpenAPI 3.0 or 3.1 document (one with an `openapi` version) is read too: each of its `components.schemas` becomes
// a type named after its key, and its schemas are in the document's dialect. Each operation has a struct of what a call
// to it sends (e.g. GetUserInput, with its JSON Body and its parameters by location), with Options.ParameterDefaults
// one of what its handler gets (e.g. GetUserRequest), and a type for its JSON request body (e.g. GetUserBody) and for
// that of each of its responses (e.g. GetUserResponse200). They are named after its `operationId`, or, without one (or
// with one without a letter or digit), after its method and path (e.g. GetUsersIdInput).
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
	// ParameterDefaults also generates, for each operation of an OpenAPI document, a Request type (e.g.
	// GetUserRequest): what a handler gets once a validator filled in parameters' defaults, so a parameter with a
	// default is always set.
	ParameterDefaults bool
}

// An Error is a problem with a schema, at a JSON Pointer. Match its Kind with errors.Is: ErrInvalidSchema,
// ErrStrictMode, ErrUnsupported or ErrLoad. Its Message says what is wrong, Pointer where (in another file, starting
// with that file's URI), Cause is the underlying error if there is one, such as the file system's, and ReferencedFrom
// is the file or URL whose `$ref` needed a file that failed to load.
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
	// ErrSyntax is input that is not JSON. It is not an Error, as there is no schema to point into.
	ErrSyntax = jsonv.ErrSyntax
	// ErrYAML is a .yaml or .yml input of GenerateFile that is not a YAML document JSON can hold, e.g. a syntax error
	// or more than one document. It is not an Error either.
	ErrYAML = convert.ErrYAML
)

// Generate generates Go types from a JSON Schema, and returns the source of a Go file, formatted as gofmt does. It
// reads one document, and loads nothing: a `$ref` to another document fails with ErrUnsupported. GenerateFile loads
// the files and URLs a schema refers to.
func Generate(schema []byte, options Options) ([]byte, error) {
	source, err := GenerateSource(schema, options)

	return source.Text, err
}

// A Name is a type's or field's name in the source GenerateSource generates, and what it is generated from.
type Name struct {
	// Name is the identifier in the source.
	Name string
	// Pointer is the JSON Pointer to what the name is generated from in the document: a type's schema (e.g.
	// `#/$defs/Note`), an operation for its Input and Request (`#/paths/~1notes/post`), its request body or a
	// response for their body's type (`#/paths/~1notes/post/requestBody`), and a field's schema under `properties`
	// (`#/$defs/Note/properties/body`) or `patternProperties`. The same form as an Error's Pointer.
	Pointer string
	// Offset is the name's byte offset in the source, where the type or field is declared.
	Offset int
}

// Source is what GenerateSource generates.
type Source struct {
	// Text is the Go source Generate returns.
	Text []byte
	// Names are each named type, and each field of a property under `properties` (or a `patternProperties` pattern
	// matching one name, such as `^id$`), in the order they are in the source. Helper types, and types and fields that
	// aren't generated from part of the document (such as an operation input's Path), aren't listed.
	Names []Name
}

// GenerateSource generates Go types as Generate does, with where each type's and field's name is, such as for an
// editor to go from a name to the schema it is generated from.
func GenerateSource(schema []byte, options Options) (Source, error) {
	root, err := jsonv.Parse(schema)
	if err != nil {
		return Source{Text: nil, Names: nil}, err //nolint:wrapcheck // ErrSyntax is the error, saying what is wrong
	}

	output, err := generate(root, options, nil)
	if err != nil {
		return Source{Text: nil, Names: nil}, err
	}

	names := make([]Name, len(output.Names))
	for i, name := range output.Names {
		names[i] = Name(name)
	}

	return Source{Text: output.Source, Names: names}, nil
}

// generate generates Go types from a schema or OpenAPI document, with the files it refers to, as Load returns them.
func generate(root jsonv.Value, options Options, files map[string]convert.OpenAPIFile) (golang.Output, error) {
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
		return golang.Output{Source: nil, Names: nil}, err //nolint:wrapcheck // An Error, whose kind and pointer callers read
	}

	dialect := convert.Draft202012
	if options.OpenAPI30 {
		dialect = convert.OpenAPI30
	}

	if isDocument {
		dialect = documentDialect
	}

	convertOptions := convert.Options{
		BaseURI: baseURI, Dialect: dialect, Files: files, Strict: !options.NoStrict,
		ParameterDefaults: options.ParameterDefaults,
	}

	var types []convert.NamedType
	if isDocument {
		types, err = convert.Document(root, convertOptions)
	} else {
		types, err = convert.Convert(root, name, convertOptions)
	}

	if err != nil {
		return golang.Output{Source: nil, Names: nil}, err //nolint:wrapcheck // An Error, whose kind and pointer callers read
	}

	return golang.Generate(types, pkg) //nolint:wrapcheck // Only fails on a bug in genever, which the error says
}
