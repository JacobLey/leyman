// Package comparison runs genever-go and the most used tools for generating Go types from JSON Schema or OpenAPI
// through the same probes, for the report on the docs site.
//
// A probe failing, or a tool crashing, is a result: only a problem with the comparison itself is an error.
package comparison

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"time"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

// SuiteResult is what a tool did with one kind of document.
type SuiteResult struct {
	// Error is why the tool produced nothing, in which case every probe failed.
	Error string `json:"error,omitempty"`
	// TypeErrors are the errors building what it generated.
	TypeErrors []string `json:"typeErrors"`
	// Probes are whether each probe passed, in the suite's order.
	Probes []bool `json:"probes"`
	// GenerateMs is the median milliseconds to generate from the large document.
	GenerateMs *float64 `json:"generateMs,omitempty"`
	// GenerateError is why it couldn't generate from the large document.
	GenerateError string `json:"generateError,omitempty"`
}

// ToolReport is a tool's results.
type ToolReport struct {
	Name string `json:"name"`
	// PackageName is its Go module.
	PackageName string                 `json:"packageName"`
	Version     string                 `json:"version"`
	Results     map[string]SuiteResult `json:"results"`
}

// Benchmark is how the large documents are timed.
type Benchmark struct {
	Definitions int `json:"definitions"`
	Runs        int `json:"runs"`
}

// Report is what the docs site shows, in the TypeScript comparison's form.
type Report struct {
	GeneratedAt string             `json:"generatedAt"`
	Commit      string             `json:"commit"`
	Suites      map[string][]Probe `json:"suites"`
	Benchmark   Benchmark          `json:"benchmark"`
	Tools       []ToolReport       `json:"tools"`
}

// Options of a report, beyond its results.
type Options struct {
	// Commit the tools ran at.
	Commit string
	// GeneratedAt is when it ran, as an RFC 3339 time.
	GeneratedAt string
	// Tools to run. Nil is genever-go and its alternatives.
	Tools []Tool
	// Definitions in the large documents, or 500.
	Definitions int
	// Runs is how many times each tool generates from them, or 5.
	Runs int
	// DocumentsDir holds the shared documents, or DefaultDocumentsDir.
	DocumentsDir string
}

// Suites, by their id in the report.
const (
	suiteJSONSchema = "jsonSchema"
	suiteOpenAPI    = "openApi"
)

// A suite is a kind of document, with its probes.
type suite struct {
	generate func(Tool) Generate
	large    func(int) []byte
	id       string
	document string
	probes   []Probe
}

// suites are the kinds of document, in the order the report has them.
//
//nolint:gochecknoglobals // Never changed
var suites = []suite{
	{
		generate: func(tool Tool) Generate { return tool.JSONSchema },
		large:    largeJSONSchema,
		id:       suiteJSONSchema,
		document: "json-schema.json",
		probes:   jsonSchemaProbes,
	},
	{
		generate: func(tool Tool) Generate { return tool.OpenAPI },
		large:    largeOpenAPIDocument,
		id:       suiteOpenAPI,
		document: "openapi.json",
		probes:   openAPIProbes,
	},
}

// CreateReport runs every tool through the probes and the benchmark, one at a time, since the benchmark in each would
// compete with the others.
func CreateReport(options Options) (Report, error) {
	tools := options.Tools
	if tools == nil {
		tools = append([]Tool{GeneverTool}, AlternativeTools...)
	}

	benchmark := Benchmark{Definitions: options.Definitions, Runs: options.Runs}
	if benchmark.Definitions == 0 {
		benchmark.Definitions = 500
	}

	if benchmark.Runs == 0 {
		benchmark.Runs = 5
	}

	report := Report{
		GeneratedAt: options.GeneratedAt,
		Commit:      options.Commit,
		Suites:      map[string][]Probe{},
		Benchmark:   benchmark,
		Tools:       make([]ToolReport, 0, len(tools)),
	}

	for _, each := range suites {
		report.Suites[each.id] = each.probes
	}

	for _, tool := range tools {
		results := map[string]SuiteResult{}

		for _, each := range suites {
			generate := each.generate(tool)
			if generate == nil {
				continue
			}

			result, err := runSuite(generate, each, benchmark, options)
			if err != nil {
				return Report{}, err
			}

			results[each.id] = result
		}

		report.Tools = append(report.Tools, ToolReport{
			Name: tool.Name, PackageName: tool.Module, Version: versionOf(tool.Module), Results: results,
		})
	}

	return report, nil
}

// runSuite generates from a suite's document, runs its probes, and times generating from its large document.
func runSuite(generate Generate, each suite, benchmark Benchmark, options Options) (SuiteResult, error) {
	result := SuiteResult{Error: "", TypeErrors: []string{}, Probes: nil, GenerateMs: nil, GenerateError: ""}

	dir := options.DocumentsDir
	if dir == "" {
		dir = DefaultDocumentsDir
	}

	document, err := readDocument(dir, each.document)
	if err != nil {
		return result, err
	}

	generated, err := generate(document)
	if err != nil {
		result.Error = err.Error()
		result.Probes = failed(each.probes)
	} else {
		passed, typeErrors, err := runProbes(generated, each.probes)
		if err != nil {
			return result, err
		}

		result.Probes = passed
		if typeErrors != nil {
			result.TypeErrors = typeErrors
		}
	}

	result.GenerateMs, result.GenerateError = timeGenerate(generate, each.large(benchmark.Definitions), benchmark.Runs)

	return result, nil
}

// timeGenerate is the median milliseconds a tool takes to generate from a document, or why it couldn't.
func timeGenerate(generate Generate, document []byte, runs int) (*float64, string) {
	times := make([]float64, 0, runs)

	for range runs {
		start := time.Now()

		if _, err := generate(document); err != nil {
			return nil, err.Error()
		}

		times = append(times, float64(time.Since(start).Nanoseconds())/float64(time.Millisecond))
	}

	slices.Sort(times)

	return &times[len(times)/2], ""
}

// versionOf is a module's version: genever-go's own, as the workspace's copy has none, and the others' from the
// build.
func versionOf(module string) string {
	if module == geneverModule {
		return genever.Version()
	}

	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dependency := range info.Deps {
			if dependency.Path == module {
				return strings.TrimPrefix(dependency.Version, "v")
			}
		}
	}

	return "unknown"
}

// WriteReport runs the report, and writes it to a file.
func WriteReport(path string, options Options) error {
	report, err := CreateReport(options)
	if err != nil {
		return err
	}

	encoded, _ := json.MarshalIndent(report, "", "  ") //nolint:errchkjson // Only JSON values

	if err := os.MkdirAll(filepath.Dir(path), dirMode); err != nil {
		return fmt.Errorf("report directory: %w", err)
	}

	if err := os.WriteFile(path, append(encoded, '\n'), fileMode); err != nil {
		return fmt.Errorf("write the report: %w", err)
	}

	return nil
}

// EnvironmentOptions are the options of a report run from the command line: the time now, and the commit CI gave in
// COMPARISON_COMMIT, since Dagger's source has no `.git`.
func EnvironmentOptions(getenv func(string) string) Options {
	commit := getenv("COMPARISON_COMMIT")
	if commit == "" {
		commit = "local"
	}

	return Options{
		Commit: commit, GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano), Tools: nil, Definitions: 0, Runs: 0,
		DocumentsDir: "",
	}
}
