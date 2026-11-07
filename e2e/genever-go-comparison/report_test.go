package comparison_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"testing"

	comparison "github.com/JacobLey/leyman/e2e/genever-go-comparison"
)

// errBroken is a tool failing.
var errBroken = errors.New("broken")

// options are a small, fast report's.
func options(tools []comparison.Tool) comparison.Options {
	return comparison.Options{
		Commit: "abc", GeneratedAt: "2026-11-07T00:00:00Z", Tools: tools, Definitions: 5, Runs: 1,
		DocumentsDir: "", TempDir: "",
	}
}

// Only genever-go is asserted: its results are what we can guarantee, and another tool's are the report's to show.
func TestGeneverPassesEveryProbe(t *testing.T) {
	t.Parallel()

	report, err := comparison.CreateReport(options([]comparison.Tool{comparison.GeneverTool}))
	if err != nil {
		t.Fatal(err)
	}

	for suite, result := range report.Tools[0].Results {
		if result.Error != "" || len(result.TypeErrors) > 0 || result.GenerateMs == nil {
			t.Errorf("%s: got %+v", suite, result)
		}

		for index, passed := range result.Probes {
			if !passed {
				probe := report.Suites[suite][index]
				t.Errorf("%s: %s: %s", suite, probe.Feature, probe.Description)
			}
		}
	}

	if len(report.Tools[0].Results) != 2 {
		t.Errorf("got %+v", report.Tools[0].Results)
	}
}

// Every tool runs, with a result for each kind of document it reads, whatever it does with it.
func TestEveryToolRuns(t *testing.T) {
	t.Parallel()

	report, err := comparison.CreateReport(options(nil))
	if err != nil {
		t.Fatal(err)
	}

	tools := append([]comparison.Tool{comparison.GeneverTool}, comparison.AlternativeTools...)
	if len(report.Tools) != len(tools) || report.Commit != "abc" || report.Benchmark.Definitions != 5 {
		t.Fatalf("got %+v", report)
	}

	version := regexp.MustCompile(`^\d+\.\d+\.\d+`)

	for index, tool := range report.Tools {
		if tool.Name != tools[index].Name || !version.MatchString(tool.Version) {
			t.Errorf("got %s %s", tool.Name, tool.Version)
		}

		for id, result := range tool.Results {
			if len(result.Probes) != len(report.Suites[id]) {
				t.Errorf("%s %s: got %d results", tool.Name, id, len(result.Probes))
			}
		}
	}
}

// A tool failing is a result: one that fails to generate, generates source that doesn't build, or can't generate from
// the large document.
func TestToolFailures(t *testing.T) {
	t.Parallel()

	broken := func([]byte) (comparison.Generated, error) {
		return comparison.Generated{Source: nil, Subject: ""}, errBroken
	}
	small := 0
	invalid := func(document []byte) (comparison.Generated, error) {
		if small++; small > 1 {
			return broken(document)
		}

		return comparison.Generated{Source: []byte("package main\n\nvar x int = \"a\"\n"), Subject: "int"}, nil
	}

	report, err := comparison.CreateReport(options([]comparison.Tool{
		{Name: "broken", Module: "example.com/broken", JSONSchema: broken, OpenAPI: invalid},
	}))
	if err != nil {
		t.Fatal(err)
	}

	results := report.Tools[0].Results
	if results["jsonSchema"].Error != "broken" || results["jsonSchema"].GenerateError != "broken" ||
		report.Tools[0].Version != "unknown" {
		t.Errorf("got %+v", report.Tools[0])
	}

	if openAPI := results["openApi"]; len(openAPI.TypeErrors) == 0 || openAPI.Probes[0] ||
		openAPI.GenerateError != "broken" {
		t.Errorf("got %+v", openAPI)
	}
}

// A problem with the comparison itself fails it: the shared documents missing, or nowhere to build.
func TestReportErrors(t *testing.T) {
	t.Parallel()

	missing := options([]comparison.Tool{comparison.GeneverTool})
	missing.DocumentsDir = t.TempDir()

	if _, err := comparison.CreateReport(missing); err == nil {
		t.Error("expected an error")
	}

	nowhere := options([]comparison.Tool{comparison.GeneverTool})
	nowhere.TempDir = filepath.Join(t.TempDir(), "missing")

	if _, err := comparison.CreateReport(nowhere); err == nil {
		t.Error("expected an error")
	}

	// A harness that prints nothing
	silent := func([]byte) (comparison.Generated, error) {
		return comparison.Generated{
			Source:  []byte("package main\n\nimport \"os\"\n\nfunc init() { os.Exit(0) }\n"),
			Subject: "int",
		}, nil
	}

	if _, err := comparison.CreateReport(options([]comparison.Tool{
		{Name: "silent", Module: "", JSONSchema: silent, OpenAPI: nil},
	})); err == nil {
		t.Error("expected an error")
	}
}

// The report is written as JSON, in the form the docs site reads.
func TestWriteReport(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "report", "genever-go.json")
	if err := comparison.WriteReport(path, options([]comparison.Tool{comparison.GeneverTool})); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path) //nolint:gosec // The report just written
	if err != nil {
		t.Fatal(err)
	}

	var written map[string]any
	if err := json.Unmarshal(data, &written); err != nil || written["commit"] != "abc" {
		t.Errorf("got %v, %v", written, err)
	}

	// Nowhere to write it
	file := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	for _, target := range []string{filepath.Join(file, "report.json"), t.TempDir()} {
		if err := comparison.WriteReport(target, options([]comparison.Tool{})); err == nil {
			t.Errorf("%s: expected an error", target)
		}
	}

	failing := options([]comparison.Tool{comparison.GeneverTool})
	failing.DocumentsDir = t.TempDir()

	if err := comparison.WriteReport(path, failing); err == nil {
		t.Error("expected an error")
	}
}

// From the command line, the commit is CI's, or else "local".
func TestEnvironmentOptions(t *testing.T) {
	t.Parallel()

	if got := comparison.EnvironmentOptions(func(string) string { return "" }); got.Commit != "local" ||
		got.GeneratedAt == "" {
		t.Errorf("got %+v", got)
	}

	if got := comparison.EnvironmentOptions(func(string) string { return "abc" }); got.Commit != "abc" {
		t.Errorf("got %+v", got)
	}
}

// Without a size, the benchmark times 5 runs of 500 definitions.
func TestDefaultBenchmark(t *testing.T) {
	t.Parallel()

	defaults := options([]comparison.Tool{comparison.GeneverTool})
	defaults.Definitions, defaults.Runs = 0, 0

	report, err := comparison.CreateReport(defaults)
	if err != nil {
		t.Fatal(err)
	}

	if report.Benchmark != (comparison.Benchmark{Definitions: 500, Runs: 5}) {
		t.Errorf("got %+v", report.Benchmark)
	}
}
