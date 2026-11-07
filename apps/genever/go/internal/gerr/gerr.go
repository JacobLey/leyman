// Package gerr is genever's error type, re-exported by the genever package, so its internal packages can return it.
package gerr

import "errors"

// Kinds of errors, matched with errors.Is.
var (
	// ErrInvalidSchema is a schema that is not valid JSON Schema, e.g. `properties` is not an object.
	ErrInvalidSchema = errors.New("invalid schema")
	// ErrStrictMode is a schema that is valid but most likely a mistake, rejected by strict mode.
	ErrStrictMode = errors.New("strict mode")
	// ErrUnsupported is a schema using a feature genever can't generate types for.
	ErrUnsupported = errors.New("unsupported")
	// ErrLoad is a file or URL the schema references that could not be loaded.
	ErrLoad = errors.New("load")
)

// An Error is a problem with a schema, at Pointer.
type Error struct {
	// Kind is one of ErrInvalidSchema, ErrStrictMode, ErrUnsupported or ErrLoad.
	Kind error
	// Cause is the underlying error, such as the file system's, if there is one.
	Cause error
	// Message says what is wrong, without the pointer.
	Message string
	// Pointer is the JSON Pointer to the schema or keyword at fault, e.g. `#/properties/a/type`. In another file, it
	// starts with that file's URI.
	Pointer string
	// ReferencedFrom is the file or URL whose `$ref` needed the file that failed to load, for ErrLoad.
	ReferencedFrom string
}

// Error returns the message, with the pointer at the end.
func (e *Error) Error() string {
	return e.Message + " (at " + e.Pointer + ")"
}

// Is matches the error's Kind.
func (e *Error) Is(target error) bool {
	return target == e.Kind
}

// Unwrap returns the underlying error, if there is one.
func (e *Error) Unwrap() error {
	return e.Cause
}

// Invalid returns an ErrInvalidSchema error.
func Invalid(message, pointer string) *Error {
	return &Error{Kind: ErrInvalidSchema, Message: message, Pointer: pointer, Cause: nil, ReferencedFrom: ""}
}

// Strict returns an ErrStrictMode error.
func Strict(message, pointer string) *Error {
	return &Error{Kind: ErrStrictMode, Message: message, Pointer: pointer, Cause: nil, ReferencedFrom: ""}
}

// Unsupported returns an ErrUnsupported error.
func Unsupported(message, pointer string) *Error {
	return &Error{Kind: ErrUnsupported, Message: message, Pointer: pointer, Cause: nil, ReferencedFrom: ""}
}
