package comparison

import (
	"path/filepath"
	"testing"
)

// Writing the harness fails when a file can't be written.
func TestHarnessDirError(t *testing.T) {
	t.Parallel()

	if _, err := harnessDir(map[string][]byte{filepath.Join("missing", "a"): nil}); err == nil {
		t.Error("expected an error")
	}
}
