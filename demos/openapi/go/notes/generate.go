// Package notes holds the notes API's types, generated from its OpenAPI document by genever-go.
//
// notes.go is written by the genever-go target (in prepare:generate) from the spec project's out/openapi.json, the
// same document the server and client read at runtime. It is signed, so an edit to it fails, and CI fails if it is
// stale. Each operation has an <Id>Input (what a call sends), an <Id>Request (what a handler gets, with parameter
// defaults filled in) and an <Id>Response<Status> per documented response.
package notes

//go:generate go tool genever ../../spec/out/openapi.json --package notes --parameter-defaults --signed -o notes.go
