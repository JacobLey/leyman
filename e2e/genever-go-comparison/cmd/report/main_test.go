package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// The command exits with 1 when the comparison fails, here as the shared documents aren't found from the test's
// directory.
func TestRunFails(t *testing.T) {
	t.Parallel()

	var stderr bytes.Buffer

	path := filepath.Join(t.TempDir(), "report.json")
	if code := run(&stderr, func(string) string { return "" }, path); code != 1 || stderr.Len() == 0 {
		t.Errorf("got %d, %q", code, stderr.String())
	}
}

// Run from the module's directory, as Nx runs it, the command writes the full report.
func TestRun(t *testing.T) {
	t.Chdir(filepath.Join("..", ".."))

	var stderr bytes.Buffer

	path := filepath.Join(t.TempDir(), "report.json")
	if code := run(&stderr, func(string) string { return "" }, path); code != 0 {
		t.Fatalf("got %d, %q", code, stderr.String())
	}

	if _, err := os.Stat(path); err != nil {
		t.Error(err)
	}
}

// main runs the report, and exits with its code.
//
//nolint:paralleltest // It swaps exit
func TestMainExits(t *testing.T) {
	originalExit := exit

	t.Cleanup(func() { exit = originalExit })

	code := -1
	exit = func(c int) { code = c }

	main()

	if code != 1 {
		t.Errorf("got %d", code)
	}
}
