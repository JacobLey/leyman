// Package convert converts a JSON Schema document to named types of the model, checking strict mode as it goes.
//
// It is a port of the TypeScript genever's converter (apps/genever/src/lib/convert.ts and the files it uses), so the
// two accept the same schemas, report the same errors at the same pointers, and build the same types. Go differs only
// where the language does: integers are their own type, and patterns are checked by a lenient parser, as Go's regexp
// doesn't read every ECMAScript pattern.
package convert

import "github.com/JacobLey/leyman/apps/genever/go/internal/model"

// A Dialect is the flavor of JSON Schema a schema is written in.
type Dialect int

// Dialects. OpenAPI 3.0 has its own keywords (e.g. `nullable`), and OpenAPI 3.1 uses 2020-12 with a few extra.
const (
	Draft202012 Dialect = iota
	OpenAPI30
	OpenAPI31
)

// DefaultBaseURI is the base URI of a document read from nowhere in particular, so only references within it resolve.
const DefaultBaseURI = "https://genever.invalid/genever-document"

// Options of a conversion.
type Options struct {
	// BaseURI is where the document was read from, which relative `$id`s and `$ref`s resolve against.
	BaseURI string
	// Dialect decides the keywords allowed.
	Dialect Dialect
	// Strict fails on schemas that are valid but likely mistakes.
	Strict bool
}

// A NamedType is a type to generate, with its name.
type NamedType struct {
	Doc  *model.Doc
	Type *model.Type
	// Name is unique among the types of the document, and a valid identifier in PascalCase.
	Name string
	// Pointer is the JSON Pointer to the schema the type is generated from.
	Pointer string
}
