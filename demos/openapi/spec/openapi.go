// Package spec embeds the notes API's OpenAPI document, so Go reads the same document as TypeScript.
//
// The document is built from src/spec.ts by the populate-files target, and committed. Go code that serves or calls
// the API reads its routes, statuses and schemas from these bytes at runtime, as the TypeScript client and server
// read the JSON file, so neither side can drift from the other.
package spec

import _ "embed"

// OpenAPI is the content of out/openapi.json: the whole document, as JSON.
//
//go:embed out/openapi.json
var OpenAPI []byte
