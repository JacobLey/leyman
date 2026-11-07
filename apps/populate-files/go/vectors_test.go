package populatefiles_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	populatefiles "github.com/JacobLey/leyman/apps/populate-files/go"
	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

type file struct {
	ManifestInputs map[string]string `json:"manifestInputs"`
	FilePath       string            `json:"filePath"`
	Content        string            `json:"content"`
	Signed         bool              `json:"signed"`
}

type options struct {
	TargetDir string `json:"targetDir"`
	Manifest  string `json:"manifest"`
	Check     bool   `json:"check"`
	DryRun    bool   `json:"dryRun"`
	Force     bool   `json:"force"`
	Clean     bool   `json:"clean"`
}

type step struct {
	Call    string  `json:"call"`
	Files   []file  `json:"files"`
	Options options `json:"options"`
}

type result struct {
	FilePath string `json:"filePath"`
	Reason   string `json:"reason"`
	Updated  bool   `json:"updated"`
}

type vectorError struct {
	Kind     string `json:"kind"`
	FilePath string `json:"filePath"`
	Reason   string `json:"reason"`
	Files    []struct {
		FilePath string `json:"filePath"`
		Reason   string `json:"reason"`
	} `json:"files"`
}

type entry struct {
	Inputs    map[string]string `json:"inputs"`
	Hash      string            `json:"hash"`
	Signature string            `json:"signature"`
}

type scenario struct {
	step

	Writes map[string]*string `json:"writes"`
	After  map[string]string  `json:"after"`
	Error  *vectorError       `json:"error"`
	// Manifest is missing when the call has no manifest, and null when it doesn't write one.
	Manifest    json.RawMessage `json:"manifest"`
	Description string          `json:"description"`
	Edits       []struct {
		FilePath string `json:"filePath"`
		From     string `json:"from"`
		To       string `json:"to"`
	} `json:"edits"`
	Results []result `json:"results"`
	Setup   []step   `json:"setup"`
}

func readScenarios(t *testing.T) []scenario {
	t.Helper()

	var vectors struct {
		Scenarios []scenario `json:"scenarios"`
	}
	if err := json.Unmarshal(readVectors(t), &vectors); err != nil {
		t.Fatal(err)
	}

	return vectors.Scenarios
}

// run makes a step's call in a directory.
func run(cwd string, call step) ([]populatefiles.Result, error) {
	files := make([]populatefiles.File, len(call.Files))
	for i, f := range call.Files {
		files[i] = populatefiles.File{
			ManifestInputs: f.ManifestInputs,
			Path:           f.FilePath,
			Content:        []byte(f.Content),
			Signed:         f.Signed,
		}
	}

	callOptions := populatefiles.Options{
		Cwd:       cwd,
		TargetDir: call.Options.TargetDir,
		Manifest:  call.Options.Manifest,
		Check:     call.Options.Check,
		DryRun:    call.Options.DryRun,
		Force:     call.Options.Force,
		Clean:     call.Options.Clean,
	}

	if call.Call == "populateFile" {
		populated, err := populatefiles.PopulateFile(files[0], callOptions)

		return []populatefiles.Result{populated}, err //nolint:wrapcheck // The error under test
	}

	return populatefiles.PopulateFiles(files, callOptions) //nolint:wrapcheck // The error under test
}

func relative(t *testing.T, cwd, path string) string {
	t.Helper()

	rel, err := filepath.Rel(cwd, path)
	if err != nil {
		t.Fatal(err)
	}

	return filepath.ToSlash(rel)
}

// arrange runs a scenario's setup, then its writes and edits.
func arrange(t *testing.T, cwd string, vector scenario) {
	t.Helper()

	for _, setup := range vector.Setup {
		if _, err := run(cwd, setup); err != nil {
			t.Fatalf("%s: setup: %v", vector.Description, err)
		}
	}

	for path, content := range vector.Writes {
		full := filepath.Join(cwd, path)

		var err error
		if content == nil {
			err = os.Remove(full)
		} else if err = os.MkdirAll(filepath.Dir(full), 0o750); err == nil {
			err = os.WriteFile(full, []byte(*content), 0o600)
		}

		if err != nil {
			t.Fatal(err)
		}
	}

	for _, edit := range vector.Edits {
		full := filepath.Join(cwd, edit.FilePath)

		text, err := os.ReadFile(full) //nolint:gosec // A file of the test's directory
		if err != nil {
			t.Fatal(err)
		}

		//nolint:gosec // A file of the test's directory
		if err := os.WriteFile(full, []byte(strings.Replace(string(text), edit.From, edit.To, 1)), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

// expectCheckError checks an error is a *CheckError, listing the vector's files.
func expectCheckError(t *testing.T, cwd string, vector scenario, err error) {
	t.Helper()

	var checkError *populatefiles.CheckError
	if !errors.As(err, &checkError) {
		t.Errorf("%s: got %v, expected a check error", vector.Description, err)

		return
	}

	got := make([]string, len(checkError.Files))
	for i, outdated := range checkError.Files {
		got[i] = relative(t, cwd, outdated.Path) + ":" + string(outdated.Reason)
	}

	want := make([]string, len(vector.Error.Files))
	for i, outdated := range vector.Error.Files {
		want[i] = outdated.FilePath + ":" + outdated.Reason
	}

	if !slices.Equal(got, want) {
		t.Errorf("%s: got %v, expected %v", vector.Description, got, want)
	}
}

// expectError checks an error is the vector's kind, with its files or reason.
func expectError(t *testing.T, cwd string, vector scenario, err error) {
	t.Helper()

	var ownershipError *populatefiles.OwnershipError

	switch vector.Error.Kind {
	case "check":
		expectCheckError(t, cwd, vector, err)
	case "ownership":
		if !errors.As(err, &ownershipError) || relative(t, cwd, ownershipError.Path) != vector.Error.FilePath ||
			string(ownershipError.Reason) != vector.Error.Reason {
			t.Errorf("%s: got %v", vector.Description, err)
		}
	case "manifest":
		if !errors.Is(err, generatedsignature.ErrManifest) {
			t.Errorf("%s: got %v", vector.Description, err)
		}
	default:
		if !errors.Is(err, populatefiles.ErrDuplicateFile) {
			t.Errorf("%s: got %v", vector.Description, err)
		}
	}
}

// listFiles reads every file under a directory but its manifests, by path relative to it.
func listFiles(t *testing.T, cwd string, manifests map[string]bool) map[string]string {
	t.Helper()

	files := map[string]string{}

	err := filepath.WalkDir(cwd, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || manifests[relative(t, cwd, path)] {
			return err
		}

		content, err := os.ReadFile(path) //nolint:gosec // A file of the test's directory
		if err != nil {
			return fmt.Errorf("reading %s: %w", path, err)
		}

		files[relative(t, cwd, path)] = string(content)

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return files
}

// expectManifest checks the call's manifest, parsed, as its layout is the formatter's.
func expectManifest(t *testing.T, cwd string, vector scenario) {
	t.Helper()

	var expected *map[string]entry
	if err := json.Unmarshal(vector.Manifest, &expected); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(filepath.Join(cwd, vector.Options.Manifest)) //nolint:gosec // The test's own manifest
	if expected == nil {
		if !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("%s: expected no manifest, got %v", vector.Description, err)
		}

		return
	}

	manifest, err := generatedsignature.ParseManifest(raw)
	if err != nil {
		t.Fatalf("%s: %v", vector.Description, err)
	}

	if !maps.EqualFunc(manifest.Files, *expected, func(got generatedsignature.ManifestEntry, want entry) bool {
		return got.Hash == want.Hash && got.Inline == (want.Signature == "inline") &&
			(got.Inputs == nil) == (want.Inputs == nil) && maps.Equal(got.Inputs, want.Inputs)
	}) {
		t.Errorf("%s: got manifest %v, expected %v", vector.Description, manifest.Files, *expected)
	}
}

// expectAfter checks the files a scenario leaves, but its manifests.
func expectAfter(t *testing.T, cwd string, vector scenario) {
	t.Helper()

	manifests := map[string]bool{}

	for _, call := range append(slices.Clone(vector.Setup), vector.step) {
		if call.Options.Manifest != "" {
			manifests[filepath.ToSlash(filepath.Clean(call.Options.Manifest))] = true
		}
	}

	if after := listFiles(t, cwd, manifests); !maps.Equal(after, vector.After) {
		t.Errorf("%s: got files %v, expected %v", vector.Description, after, vector.After)
	}
}

func TestScenarioVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readScenarios(t) {
		cwd := t.TempDir()

		arrange(t, cwd, vector)

		results, err := run(cwd, vector.step)
		if vector.Error != nil {
			expectError(t, cwd, vector, err)

			// Nothing is written when a call fails
			expectAfter(t, cwd, vector)

			continue
		}

		if err != nil {
			t.Errorf("%s: %v", vector.Description, err)

			continue
		}

		got := make([]result, len(results))
		for i, populated := range results {
			got[i] = result{FilePath: relative(t, cwd, populated.Path), Reason: string(populated.Reason), Updated: populated.Updated}
		}

		if !slices.Equal(got, vector.Results) {
			t.Errorf("%s: got %v, expected %v", vector.Description, got, vector.Results)
		}

		expectAfter(t, cwd, vector)

		if vector.Manifest != nil {
			expectManifest(t, cwd, vector)
		}
	}
}

// readVectors reads the shared test vectors, which every implementation reads.
func readVectors(t *testing.T) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("..", "test-vectors", "data", "test-vectors.json"))
	if err != nil {
		t.Fatal(err)
	}

	return data
}
