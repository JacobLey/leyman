package populatefiles_test

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	populatefiles "github.com/JacobLey/leyman/apps/populate-files/go-impl"
	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go-impl"
)

// errCause is the cause of an ownership error.
var errCause = errors.New("cause")

func newFile(path, content string, signed bool) populatefiles.File {
	return populatefiles.File{ManifestInputs: nil, Path: path, Content: []byte(content), Signed: signed}
}

func newOptions(cwd, manifest string) populatefiles.Options {
	return populatefiles.Options{
		Cwd: cwd, TargetDir: "", Manifest: manifest, Check: false, DryRun: false, Force: false, Clean: false,
	}
}

func mkdir(t *testing.T, path string, mode fs.FileMode) {
	t.Helper()

	if err := os.MkdirAll(path, 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = os.Chmod(path, 0o750) }) //nolint:gosec // Restored so the directory can be removed
}

// populateBoth populates a file with PopulateFile and PopulateFiles, expecting each to fail.
func populateBoth(t *testing.T, file populatefiles.File, options populatefiles.Options) []error {
	t.Helper()

	_, fileErr := populatefiles.PopulateFile(file, options)
	_, filesErr := populatefiles.PopulateFiles([]populatefiles.File{file}, options)

	return []error{fileErr, filesErr}
}

func TestErrorMessages(t *testing.T) {
	t.Parallel()

	checkError := &populatefiles.CheckError{Files: []populatefiles.Outdated{
		{Path: "a", Reason: populatefiles.ReasonContentChanged},
		{Path: "b", Reason: populatefiles.ReasonStaleFile},
	}}
	if checkError.Error() != "File a not up to date. Reason: content-changed, File b not up to date. Reason: stale-file" ||
		!errors.Is(checkError, populatefiles.ErrCheck) {
		t.Error(checkError)
	}

	ownershipError := &populatefiles.OwnershipError{
		Err: errCause, Path: "a.ts", Reason: populatefiles.OwnershipEdited, Detail: "outside of manual sections",
	}

	if ownershipError.Error() != "File a.ts was edited since it was generated (outside of manual sections). "+
		"Pass `force` to overwrite it." || !errors.Is(ownershipError, errCause) ||
		!errors.Is(ownershipError, populatefiles.ErrOwnership) {
		t.Error(ownershipError)
	}

	ownershipError.Detail = ""
	if !strings.HasSuffix(ownershipError.Error(), "generated. Pass `force` to overwrite it.") {
		t.Error(ownershipError)
	}
}

func TestAbsolutePaths(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	options := newOptions("relative/ignored", filepath.Join(dir, "manifest.json"))
	options.TargetDir = dir

	result, err := populatefiles.PopulateFile(newFile(filepath.Join(dir, "a.txt"), "a\n", false), options)
	if err != nil || result.Path != filepath.Join(dir, "a.txt") {
		t.Errorf("got %v, %v", result, err)
	}
}

func TestReadErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	mkdir(t, filepath.Join(dir, "a.txt"), 0o750)
	mkdir(t, filepath.Join(dir, "manifest.json"), 0o750)

	for _, err := range append(
		populateBoth(t, newFile("a.txt", "a\n", false), newOptions(dir, "")),
		populateBoth(t, newFile("b.txt", "b\n", false), newOptions(dir, "manifest.json"))...,
	) {
		if err == nil || !strings.Contains(err.Error(), "reading") {
			t.Errorf("got %v", err)
		}
	}
}

func TestSignErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	for _, err := range populateBoth(t, newFile("a.json", "{}\n", true), newOptions(dir, "")) {
		if !errors.Is(err, generatedsignature.ErrUnknownCommentStyle) {
			t.Errorf("got %v", err)
		}
	}

	if _, err := populatefiles.PopulateFile(newFile("a.ts", "a\n", true), newOptions(dir, "")); err != nil {
		t.Fatal(err)
	}

	for _, err := range populateBoth(t, newFile("a.ts", "// @manual-end x\n", true), newOptions(dir, "")) {
		if !errors.Is(err, generatedsignature.ErrMalformed) {
			t.Errorf("got %v", err)
		}
	}
}

func TestWriteErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	mkdir(t, filepath.Join(dir, "locked"), 0o500)

	// A directory that can't be created, and a file that can't be written.
	for _, path := range []string{"locked/sub/a.txt", "locked/a.txt"} {
		for _, err := range populateBoth(t, newFile(path, "a\n", false), newOptions(dir, "")) {
			if !errors.Is(err, fs.ErrPermission) {
				t.Errorf("%s: got %v", path, err)
			}
		}
	}
}

func TestCleanErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "file"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	cleaning := func(targetDir, manifest string) populatefiles.Options {
		options := newOptions(dir, manifest)
		options.TargetDir = targetDir
		options.Clean = true

		return options
	}

	// A target directory that is a file, and one with a directory that can't be read.
	mkdir(t, filepath.Join(dir, "unreadable", "nested"), 0o000)

	for _, targetDir := range []string{"file", "unreadable"} {
		if _, err := populatefiles.PopulateFiles(nil, cleaning(targetDir, "")); err == nil {
			t.Errorf("%s: expected an error", targetDir)
		}
	}

	// A stale file that can't be removed, and a listed file that can't be read.
	if _, err := populatefiles.PopulateFiles([]populatefiles.File{
		newFile("stale.txt", "a\n", false), newFile("listed/a.txt", "a\n", false),
	}, cleaning("out", "manifest.json")); err != nil {
		t.Fatal(err)
	}

	mkdir(t, filepath.Join(dir, "out"), 0o500)

	if _, err := populatefiles.PopulateFiles(nil, cleaning("out", "")); !errors.Is(err, fs.ErrPermission) {
		t.Errorf("got %v", err)
	}

	mkdir(t, filepath.Join(dir, "out", "listed"), 0o000)

	if _, err := populatefiles.PopulateFiles(nil, cleaning("out", "manifest.json")); !errors.Is(err, fs.ErrPermission) {
		t.Errorf("got %v", err)
	}
}

// A working directory that no longer exists has no path to resolve against. It isn't parallel, as it changes the
// working directory.
func TestMissingWorkingDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "gone")
	mkdir(t, dir, 0o750)
	t.Chdir(dir)

	if err := os.Remove(dir); err != nil {
		t.Fatal(err)
	}

	for _, err := range populateBoth(t, newFile("a.txt", "a\n", false), newOptions("", "")) {
		if err == nil || !strings.Contains(err.Error(), "resolving cwd") {
			t.Errorf("got %v", err)
		}
	}
}
