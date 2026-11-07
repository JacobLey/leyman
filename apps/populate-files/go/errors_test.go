package populatefiles_test

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	populatefiles "github.com/JacobLey/leyman/apps/populate-files/go"
	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
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

func mkdir(t *testing.T, path string) {
	t.Helper()

	if err := os.MkdirAll(path, 0o750); err != nil {
		t.Fatal(err)
	}
}

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
	mkdir(t, filepath.Join(dir, "a.txt"))
	mkdir(t, filepath.Join(dir, "manifest.json"))

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

// symlink makes a link at path, relative to dir, to target, which needn't exist.
func symlink(t *testing.T, dir, path, target string) {
	t.Helper()

	link := filepath.Join(dir, path)
	if err := os.MkdirAll(filepath.Dir(link), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}

// The errors are made without file permissions, which root (as in CI) ignores.
func TestWriteErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	// A directory that can't be created, as a dangling link is in its place, and a file that can't be written, as it is
	// a link into a directory that doesn't exist. Neither can be read, so each is written.
	symlink(t, dir, "linked", "missing/linked")
	symlink(t, dir, "out/a.txt", "../missing/a.txt")

	for path, kind := range map[string]error{"linked/sub/a.txt": fs.ErrExist, "out/a.txt": fs.ErrNotExist} {
		for _, err := range populateBoth(t, newFile(path, "a\n", false), newOptions(dir, "")) {
			if !errors.Is(err, kind) {
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

	// A target directory that is a file
	if _, err := populatefiles.PopulateFiles(nil, cleaning("file", "")); err == nil || !strings.Contains(err.Error(),
		"listing") {
		t.Errorf("got %v", err)
	}

	// A listed file that can't be read, as a directory is in its place
	if _, err := populatefiles.PopulateFiles([]populatefiles.File{newFile("listed/a.txt", "a\n", false)},
		cleaning("out", "manifest.json")); err != nil {
		t.Fatal(err)
	}

	if err := os.Remove(filepath.Join(dir, "out", "listed", "a.txt")); err != nil {
		t.Fatal(err)
	}

	mkdir(t, filepath.Join(dir, "out", "listed", "a.txt", "nested"))

	if _, err := populatefiles.PopulateFiles(nil, cleaning("out", "manifest.json")); err == nil ||
		!strings.Contains(err.Error(), "reading") {
		t.Errorf("got %v", err)
	}
}

// A working directory that no longer exists has no path to resolve against. It isn't parallel, as it changes the
// working directory.
func TestMissingWorkingDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "gone")
	mkdir(t, dir)
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
