package populatefiles

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
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
		UnsafeCleanUnlisted: true,
	})
	if !errors.Is(err, errRemove) {
		t.Errorf("got %v", err)
	}
}

// A manifest listing one file by two paths names both.
func TestLoadManifestDuplicate(t *testing.T) {
	t.Parallel()

	manifestPath := filepath.Join(t.TempDir(), "manifest.json")

	content := `{"version":1,"files":{"out/a.json":{"hash":"h"},"./out/a.json":{"hash":"h"}}}`
	if err := os.WriteFile(manifestPath, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := loadManifest(manifestPath)
	if !errors.Is(err, generatedsignature.ErrManifest) {
		t.Fatalf("got %v", err)
	}

	want := "reading " + manifestPath + ": invalid generated-signature manifest: lists ./out/a.json and out/a.json, " +
		"which are the same file"
	if err.Error() != want {
		t.Errorf("got %q", err.Error())
	}
}
