// Package testvectors embeds the test vectors shared by every generated-signature implementation.
//
// See README.md for the format.
package testvectors

import _ "embed"

// JSON is the content of data/test-vectors.json.
//
//go:embed data/test-vectors.json
var JSON []byte
