package genever_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
	populatefiles "github.com/JacobLey/leyman/apps/populate-files/go"
	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

// fileOptions are the defaults of GenerateFile, in a directory.
func fileOptions(cwd string) genever.FileOptions {
	return genever.FileOptions{
		Options:    genever.Options{Name: "", Package: "", BaseURI: "", OpenAPI30: false, NoStrict: false, ParameterDefaults: false},
		Client:     nil,
		Cwd:        cwd,
		Output:     "",
		Manifest:   "",
		FetchHosts: nil,
		NoFetch:    false,
		Check:      false,
		DryRun:     false,
		Signed:     false,
		Force:      false,
	}
}

// writeFiles writes files of a directory, by path relative to it.
func writeFiles(t *testing.T, dir string, files map[string]string) {
	t.Helper()

	for path, content := range files {
		full := filepath.Join(dir, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func generateFile(t *testing.T, input string, options genever.FileOptions) genever.FileResult {
	t.Helper()

	result, err := genever.GenerateFile(t.Context(), input, options)
	if err != nil {
		t.Fatal(err)
	}

	return result
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()

	content, err := os.ReadFile(path) //nolint:gosec // A file of the test's directory
	if err != nil {
		t.Fatal(err)
	}

	return content
}

func TestGenerateFileOutput(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{
		"a.json":       `{"type": "object", "properties": {"b": {"$ref": "b.YML"}}}`,
		"b.YML":        "type: string\n",
		"nested/c.txt": `{"type": "integer"}`,
	})

	result := generateFile(t, "a.json", fileOptions(dir))
	if result.Output != filepath.Join(dir, "a.go") || !result.Updated {
		t.Errorf("got %v", result)
	}

	if names, pkg := typeNames(t, readFile(t, result.Output)); !names["Schema"] || pkg != "schema" {
		t.Errorf("got %v in %s", names, pkg)
	}

	if result := generateFile(t, "a.json", fileOptions(dir)); result.Updated {
		t.Errorf("regenerated an unchanged file: %v", result)
	}

	yaml := fileOptions(dir)
	yaml.Package = "api"
	yaml.Name = "B"

	if result := generateFile(t, filepath.Join(dir, "b.YML"), yaml); result.Output != filepath.Join(dir, "b.go") {
		t.Errorf("got %v", result)
	}

	if names, pkg := typeNames(t, readFile(t, filepath.Join(dir, "b.go"))); !names["B"] || pkg != "api" {
		t.Errorf("got %v in %s", names, pkg)
	}

	other := fileOptions(dir)
	other.Output = "out/c.go"

	if result := generateFile(t, "nested/c.txt", other); result.Output != filepath.Join(dir, "out", "c.go") {
		t.Errorf("got %v", result)
	}
}

func TestGenerateFileErrors(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{
		"syntax.json":  `{`,
		"syntax.yaml":  "a: [",
		"missing.json": `{"$ref": "nowhere.json"}`,
		"strict.json":  `{"type": "date"}`,
		"version.json": `{"openapi": "2.0"}`,
		"valid.json":   `{"type": "string"}`,
	})

	check := fileOptions(dir)
	check.Check = true

	for input, kind := range map[string]error{
		"syntax.json":  genever.ErrSyntax,
		"syntax.yaml":  genever.ErrYAML,
		"missing.json": genever.ErrLoad,
		"strict.json":  genever.ErrInvalidSchema,
		"version.json": genever.ErrUnsupported,
		"absent.json":  os.ErrNotExist,
	} {
		if _, err := genever.GenerateFile(t.Context(), input, fileOptions(dir)); !errors.Is(err, kind) {
			t.Errorf("%s: got %v, expected %v", input, err, kind)
		}
	}

	if _, err := genever.GenerateFile(t.Context(), "valid.json", check); !errors.Is(err, populatefiles.ErrCheck) {
		t.Errorf("got %v", err)
	}
}

func TestGenerateFileSigned(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{"a.json": `{"type": "string"}`})

	signed := fileOptions(dir)
	signed.Signed = true

	result := generateFile(t, "a.json", signed)
	if status := generatedsignature.Verify(string(readFile(t, result.Output))).Status; status != generatedsignature.StatusValid {
		t.Errorf("got %s", status)
	}

	writeFiles(t, dir, map[string]string{"a.go": "package hand\n"})

	if _, err := genever.GenerateFile(t.Context(), "a.json", signed); !errors.Is(err, populatefiles.ErrOwnership) {
		t.Errorf("got %v", err)
	}

	signed.Force = true

	generateFile(t, "a.json", signed)
}

// A check with a manifest finds an output up to date by its manifest entry, without reading its URLs.
func TestGenerateFileManifest(t *testing.T) {
	t.Parallel()

	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		requests++

		_, _ = writer.Write([]byte(`{"type": "boolean"}`))
	}))
	t.Cleanup(server.Close)

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{
		"schemas/a.json": `{"type": "object", "properties": {"b": {"$ref": "../shared/b.json"}, "c": {"$ref": "` +
			server.URL + `/c.json"}}}`,
		"shared/b.json": `{"type": "string"}`,
	})

	options := fileOptions(dir)
	options.Client = server.Client()
	options.Manifest = "schemas/manifest.json"
	options.Output = "out/a.go"

	generateFile(t, "schemas/a.json", options)

	manifest, err := generatedsignature.ParseManifest(readFile(t, filepath.Join(dir, "schemas", "manifest.json")))
	if err != nil {
		t.Fatal(err)
	}

	inputs := manifest.Files["../out/a.go"].Inputs
	if !strings.HasPrefix(inputs["generator"], "genever-go@") || inputs["./a.json"] == "" ||
		inputs["../shared/b.json"] == "" || inputs[server.URL+"/c.json"] == "" {
		t.Errorf("got inputs %v", inputs)
	}

	options.Check = true

	if result := generateFile(t, "schemas/a.json", options); result.Updated || requests != 1 {
		t.Errorf("got %v after %d requests", result, requests)
	}

	// Anything else that changed reads the schema again, and finds the output out of date.
	changes := []func(){
		func() { writeFiles(t, dir, map[string]string{"shared/b.json": `{"type": "integer"}`}) },
		func() { _ = os.Remove(filepath.Join(dir, "shared", "b.json")) },
		func() { writeFiles(t, dir, map[string]string{"schemas/manifest.json": "{}"}) },
	}

	for i, change := range changes {
		change()

		if _, err := genever.GenerateFile(t.Context(), "schemas/a.json", options); err == nil {
			t.Errorf("change %d: expected a failure", i)
		}
	}
}

// The manifest's entry must be the output's, by the same generator and options, and the output unedited.
func TestGenerateFileManifestEntry(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{"a.json": `{"type": "string"}`, "b.json": `{"type": "string"}`})

	options := fileOptions(dir)
	options.Manifest = "manifest.json"

	generateFile(t, "a.json", options)

	options.Check = true

	stale := map[string]func(genever.FileOptions) genever.FileOptions{
		"no manifest": func(o genever.FileOptions) genever.FileOptions {
			o.Manifest = "missing.json"

			return o
		},
		"another output": func(o genever.FileOptions) genever.FileOptions {
			o.Output = "b.go"

			return o
		},
		"other options": func(o genever.FileOptions) genever.FileOptions {
			o.Package = "other"

			return o
		},
		"no output": func(o genever.FileOptions) genever.FileOptions {
			_ = os.Remove(filepath.Join(dir, "a.go"))

			return o
		},
	}

	for _, name := range []string{"no manifest", "another output", "other options", "no output"} {
		if _, err := genever.GenerateFile(t.Context(), "a.json", stale[name](options)); !errors.Is(err, populatefiles.ErrCheck) {
			t.Errorf("%s: got %v", name, err)
		}
	}

	options.Check = false
	generateFile(t, "a.json", options)
	writeFiles(t, dir, map[string]string{"a.go": "package edited\n"})

	options.Check = true
	if _, err := genever.GenerateFile(t.Context(), "a.json", options); !errors.Is(err, populatefiles.ErrOwnership) {
		t.Errorf("edited: got %v", err)
	}
}

func TestGenerateFileFetch(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{"a.json": `{"$ref": "https://example.com/b.json"}`})

	noFetch := fileOptions(dir)
	noFetch.NoFetch = true
	noFetch.FetchHosts = []string{"example.com"}

	hosts := fileOptions(dir)
	hosts.FetchHosts = []string{"other.com"}

	for _, options := range []genever.FileOptions{noFetch, hosts} {
		if _, err := genever.GenerateFile(t.Context(), "a.json", options); !errors.Is(err, genever.ErrLoad) {
			t.Errorf("got %v", err)
		}
	}
}

// A working directory that no longer exists has no path to resolve against. It isn't parallel, as it changes the
// working directory.
func TestGenerateFileMissingWorkingDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "gone")
	writeFiles(t, dir, map[string]string{"a.json": "{}"})
	t.Chdir(dir)

	if err := os.RemoveAll(dir); err != nil {
		t.Fatal(err)
	}

	if _, err := genever.GenerateFile(t.Context(), "a.json", fileOptions("")); err == nil ||
		!strings.Contains(err.Error(), "resolving cwd") {
		t.Errorf("got %v", err)
	}
}
