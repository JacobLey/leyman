package genever_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

type fixture struct {
	Schema  json.RawMessage   `json:"schema"`
	Samples []json.RawMessage `json:"samples"`
}

func readFixtures(t *testing.T) map[string]fixture {
	t.Helper()

	entries, err := fs.ReadDir(testVectors(), "out/fixtures")
	if err != nil {
		t.Fatal(err)
	}

	fixtures := map[string]fixture{}

	for _, entry := range entries {
		data, err := fs.ReadFile(testVectors(), path.Join("out/fixtures", entry.Name()))
		if err != nil {
			t.Fatal(err)
		}

		var value fixture
		if err := json.Unmarshal(data, &value); err != nil {
			t.Fatal(err)
		}

		fixtures[strings.TrimSuffix(entry.Name(), ".json")] = value
	}

	return fixtures
}

type documentFixture struct {
	Document json.RawMessage              `json:"document"`
	Samples  map[string][]json.RawMessage `json:"samples"`
}

// readDocuments reads the vectors' OpenAPI documents, by version.
func readDocuments(t *testing.T) map[string]documentFixture {
	t.Helper()

	entries, err := fs.ReadDir(testVectors(), "out/openapi")
	if err != nil {
		t.Fatal(err)
	}

	documents := map[string]documentFixture{}

	for _, entry := range entries {
		data, err := fs.ReadFile(testVectors(), path.Join("out/openapi", entry.Name()))
		if err != nil {
			t.Fatal(err)
		}

		var value documentFixture
		if err := json.Unmarshal(data, &value); err != nil {
			t.Fatal(err)
		}

		documents[strings.TrimSuffix(entry.Name(), ".json")] = value
	}

	return documents
}

// The harness reads each sample into the generated root type and writes it back, printing a line per sample that
// doesn't come back as the same JSON.
const harness = `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
{{imports}})

func check(name string, samples []json.RawMessage, roundTrip func([]byte) ([]byte, error)) {
	for _, sample := range samples {
		out, err := roundTrip(sample)
		if err != nil {
			fmt.Printf("%s: %s: %v\n", name, sample, err)
			continue
		}
		var before, after any
		_ = json.Unmarshal(sample, &before)
		if err := json.Unmarshal(out, &after); err != nil || !reflect.DeepEqual(before, after) {
			fmt.Printf("%s: %s came back as %s\n", name, sample, out)
		}
	}
}

func main() {
	var fixtures map[string][]json.RawMessage
	data, _ := os.ReadFile(os.Args[1])
	decoder := json.NewDecoder(bytes.NewReader(data))
	_ = decoder.Decode(&fixtures)
{{calls}}}
`

// Every value a fixture's schema accepts is held by the generated type, and written back as the same JSON: the types
// are never narrower than the schema, and keep everything they read.
func TestSamplesRoundTrip(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	fixtures := readFixtures(t)
	samples := map[string][]json.RawMessage{}

	var imports, calls strings.Builder

	// check adds a call checking the samples of a type of a generated package
	imported := map[string]bool{}
	check := func(pkg, typeName, key string, typeSamples []json.RawMessage) {
		samples[key] = typeSamples

		if !imported[pkg] {
			imported[pkg] = true

			imports.WriteString("\t" + pkg + " \"harness/" + pkg + "\"\n")
		}

		calls.WriteString("\tcheck(\"" + key + "\", fixtures[\"" + key + "\"], func(data []byte) ([]byte, error) {\n" +
			"\t\tvar value " + pkg + "." + typeName + "\n" +
			"\t\tif err := json.Unmarshal(data, &value); err != nil {\n\t\t\treturn nil, err\n\t\t}\n" +
			"\t\treturn json.Marshal(value)\n\t})\n")
	}

	// generate writes a schema's package
	generate := func(name, pkg string, schema json.RawMessage) {
		source, err := genever.Generate(schema, genever.Options{Name: "", Package: pkg, BaseURI: "", OpenAPI30: false, NoStrict: true})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}

		writeFile(t, filepath.Join(dir, pkg, "schema.go"), source)
		// Compiled even if no sample checks it
		imports.WriteString("\t_ \"harness/" + pkg + "\"\n")
	}

	for name, value := range fixtures {
		pkg := "f" + strings.ToLower(name)
		generate(name, pkg, value.Schema)

		// One that accepts nothing is still generated, to compile
		if len(value.Samples) > 0 {
			check(pkg, "Schema", name, value.Samples)
		}
	}

	for version, document := range readDocuments(t) {
		pkg := "openapi" + strings.ReplaceAll(version, ".", "")
		generate(version, pkg, document.Document)

		for typeName, typeSamples := range document.Samples {
			check(pkg, typeName, version+" "+typeName, typeSamples)
		}
	}

	runHarness(t, dir, samples, imports.String(), calls.String())
}

// runHarness writes the harness into dir, beside the generated packages, and runs it on the samples.
func runHarness(t *testing.T, dir string, samples map[string][]json.RawMessage, imports, calls string) {
	t.Helper()

	samplesJSON, err := json.Marshal(samples)
	if err != nil {
		t.Fatal(err)
	}

	writeFile(t, filepath.Join(dir, "go.mod"), []byte("module harness\n\ngo 1.24\n"))
	writeFile(t, filepath.Join(dir, "samples.json"), samplesJSON)
	writeFile(t, filepath.Join(dir, "main.go"), []byte(strings.NewReplacer(
		"{{imports}}", imports, "{{calls}}", calls).Replace(harness)))

	command := exec.CommandContext(t.Context(), "go", "run", ".", "samples.json")
	command.Dir = dir

	output, err := command.CombinedOutput()
	if err != nil || len(output) > 0 {
		t.Fatalf("%v\n%s", err, output)
	}
}

func writeFile(t *testing.T, name string, data []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(name), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(name, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

// testVectors are the files of the shared test vectors, which every implementation reads.
func testVectors() fs.FS {
	return os.DirFS(filepath.Join("..", "test-vectors"))
}

// readVectors reads a file of the shared test vectors.
func readVectors(t *testing.T, name string) []byte {
	t.Helper()

	data, err := fs.ReadFile(testVectors(), name)
	if err != nil {
		t.Fatal(err)
	}

	return data
}
