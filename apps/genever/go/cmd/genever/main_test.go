package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

// noEnv is an environment without variables.
func noEnv(string) string {
	return ""
}

// command runs the command, and returns its exit code and output.
func command(t *testing.T, getenv func(string) string, args ...string) (int, string, string) {
	t.Helper()

	var stdout, stderr bytes.Buffer

	code := run(t.Context(), args, &stdout, &stderr, getenv)

	return code, stdout.String(), stderr.String()
}

func writeSchema(t *testing.T, dir, name, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestGenerate(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSchema(t, dir, "a.json", `{"type": "string"}`)

	code, stdout, stderr := command(t, noEnv, "a.json", "--cwd", dir, "-o", "out/a.go", "--package", "api", "--signed")
	if code != 0 || strings.TrimSpace(stdout) != filepath.Join(dir, "out", "a.go") || stderr != "" {
		t.Fatalf("got %d, %q, %q", code, stdout, stderr)
	}

	source, err := os.ReadFile(filepath.Join(dir, "out", "a.go")) //nolint:gosec // The test's own file
	if err != nil || !bytes.Contains(source, []byte("package api")) {
		t.Fatalf("got %s, %v", source, err)
	}
}

// In CI, an up to date output prints nothing, and an outdated one fails.
func TestCI(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSchema(t, dir, "a.json", `{"type": "string"}`)

	if code, _, stderr := command(t, noEnv, "a.json", "--cwd", dir); code != 0 {
		t.Fatalf("got %d, %q", code, stderr)
	}

	inCI := func(name string) string {
		if name == "CI" {
			return "true"
		}

		return ""
	}

	if code, stdout, stderr := command(t, inCI, "--cwd", dir, "a.json"); code != 0 || stdout != "" {
		t.Errorf("got %d, %q, %q", code, stdout, stderr)
	}

	code, _, stderr := command(t, inCI, "--cwd", dir, "--package=other", "a.json")
	if code != 1 || !strings.Contains(stderr, "not up to date") {
		t.Errorf("got %d, %q", code, stderr)
	}
}

func TestOptions(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	writeSchema(t, dir, "a.yaml", "type: object\nproperties: {a: {type: string, nullable: true}}\nx-other: 1\n")

	code, _, stderr := command(t, noEnv, "--cwd", dir, "a.yaml", "--name", "Root", "--no-strict", "--open-api-30",
		"--no-fetch", "--dry-run", "--manifest", "manifest.json", "--force")
	if code != 0 || stderr != "" {
		t.Errorf("got %d, %q", code, stderr)
	}

	if _, err := os.Stat(filepath.Join(dir, "a.go")); !os.IsNotExist(err) {
		t.Errorf("dry run wrote the output: %v", err)
	}

	code, _, stderr = command(t, noEnv, "--cwd", dir, "a.yaml", "--fetch-host", "example.com", "--fetch-host",
		"*.example.org")
	if code != 1 || !strings.Contains(stderr, "nullable") {
		t.Errorf("got %d, %q", code, stderr)
	}
}

func TestUsageErrors(t *testing.T) {
	t.Parallel()

	for _, args := range [][]string{
		{},
		{"a.json", "b.json"},
		{"--unknown", "a.json"},
		{"a.json", "--no-fetch", "--fetch-host", "example.com"},
	} {
		if code, stdout, stderr := command(t, noEnv, args...); code != 1 || stdout != "" || stderr == "" {
			t.Errorf("%v: got %d, %q, %q", args, code, stdout, stderr)
		}
	}
}

func TestHelpAndVersion(t *testing.T) {
	t.Parallel()

	if code, _, stderr := command(t, noEnv, "--help"); code != 0 || !strings.Contains(stderr, "Usage: genever") ||
		!strings.Contains(stderr, "-fetch-host") {
		t.Errorf("got %d, %q", code, stderr)
	}

	if code, stdout, _ := command(t, noEnv, "--version"); code != 0 || stdout != "genever-go "+genever.Version()+"\n" {
		t.Errorf("got %d, %q", code, stdout)
	}
}

func TestIsCI(t *testing.T) {
	t.Parallel()

	for env, expected := range map[string]bool{"": false, "CI=1": true, "BUILD_ID=7": true, "CI=false": false} {
		name, value, _ := strings.Cut(env, "=")
		getenv := func(key string) string {
			if key == name {
				return value
			}

			return ""
		}

		if isCI(getenv) != expected {
			t.Errorf("%s: expected %t", env, expected)
		}
	}
}

// main runs with the process's arguments, and exits with the code.
//
//nolint:paralleltest // It changes the process's arguments
func TestMainExits(t *testing.T) {
	original, originalExit := os.Args, exit

	t.Cleanup(func() { os.Args, exit = original, originalExit })

	code := -1
	exit = func(c int) { code = c }
	os.Args = []string{"genever", "--version"}

	main()

	if code != 0 {
		t.Errorf("got %d", code)
	}
}
