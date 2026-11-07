// Package vectors embeds the schemas and sample values shared by every genever implementation.
//
// See README.md for the format.
package vectors

import "embed"

// Fixtures holds out/fixtures: one JSON file per Juniper fixture, named after it.
//
//go:embed out/fixtures/*.json
var Fixtures embed.FS

// Errors is out/errors.json: schemas genever rejects, by kind of error, with the pointer to the fault.
//
//go:embed out/errors.json
var Errors []byte
