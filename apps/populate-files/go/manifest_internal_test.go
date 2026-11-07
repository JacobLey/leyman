package populatefiles

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// A path with no relative form, like one on another Windows volume, is listed as it is.
func TestRelativeToFallback(t *testing.T) {
	t.Parallel()

	if got := relativeTo("/dir", "relative"); got != "relative" {
		t.Errorf("got %s", got)
	}
}

// errRemove is how removing a file fails in TestRemoveError.
var errRemove = errors.New("cannot remove")

// A stale file that can't be removed fails the clean. It isn't parallel, as it swaps how files are removed.
//
//nolint:paralleltest // It swaps removeFile
func TestRemoveError(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "stale.txt"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	original := removeFile

	t.Cleanup(func() { removeFile = original })

	removeFile = func(string) error { return errRemove }

	_, err := PopulateFiles(nil, Options{
		Cwd: dir, TargetDir: "", Manifest: "", Check: false, DryRun: false, Force: false, Clean: true,
	})
	if !errors.Is(err, errRemove) {
		t.Errorf("got %v", err)
	}
}
