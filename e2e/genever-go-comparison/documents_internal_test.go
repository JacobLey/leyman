package comparison

import (
	"encoding/json"
	"reflect"
	"testing"
)

// The large documents are the TypeScript comparison's, which writes them at two definitions.
func TestLargeDocumentsMatch(t *testing.T) {
	t.Parallel()

	for name, built := range map[string][]byte{
		"large-json-schema.json": largeJSONSchema(2),
		"large-openapi.json":     largeOpenAPIDocument(2),
	} {
		written, err := readDocument(DefaultDocumentsDir, name)
		if err != nil {
			t.Fatal(err)
		}

		var expected, got any

		_ = json.Unmarshal(written, &expected)
		_ = json.Unmarshal(built, &got)

		if !reflect.DeepEqual(got, expected) {
			t.Errorf("%s: got %s, expected %s", name, built, written)
		}
	}
}
