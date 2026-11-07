package comparison

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Outcomes of decoding a probe's value, as the harness prints them.
const (
	outcomeHeld     = "held"
	outcomeChanged  = "changed"
	outcomeRejected = "rejected"
	outcomePanicked = "panicked"
)

// harnessGoMod is the module the generated source is built in. Every tool's types only need the standard library.
const harnessGoMod = "module harness\n\ngo 1.24\n"

// harnessMain decodes each value into the subject, encodes it back, and prints what happened to each.
const harnessMain = `package main

import (
	"encoding/json"
	"os"
	"reflect"
)

var harnessValues = []string{%s}

func harnessDecode(value string) (outcome string) {
	defer func() {
		if recover() != nil {
			outcome = %q
		}
	}()

	var subject %s
	if err := json.Unmarshal([]byte(value), &subject); err != nil {
		return %q
	}

	encoded, err := json.Marshal(&subject)
	if err != nil {
		return %q
	}

	var before, after any
	_ = json.Unmarshal([]byte(value), &before)
	_ = json.Unmarshal(encoded, &after)

	if !reflect.DeepEqual(before, after) {
		return %q
	}

	return %q
}

func main() {
	outcomes := make([]string, len(harnessValues))
	for index, value := range harnessValues {
		outcomes[index] = harnessDecode(value)
	}

	_ = json.NewEncoder(os.Stdout).Encode(outcomes)
}
`

// errHarness is the harness failing to report, which only a bug in it causes.
var errHarness = errors.New("the harness printed no outcomes")

// runProbes builds the generated source with a harness, and decodes each probe's value. It returns whether each probe
// passed, and the build's errors, when the source doesn't build.
func runProbes(generated Generated, probes []Probe, tempDir string) ([]bool, []string, error) {
	values := make([]string, len(probes))
	for index, probe := range probes {
		values[index] = strconv.Quote(probe.Value)
	}

	main := fmt.Sprintf(harnessMain, strings.Join(values, ", "), outcomePanicked, generated.Subject, outcomeRejected,
		outcomeChanged, outcomeChanged, outcomeHeld)

	dir, err := harnessDir(tempDir, map[string][]byte{
		"go.mod": []byte(harnessGoMod), "generated.go": generated.Source, "harness.go": []byte(main),
	})
	if err != nil {
		return nil, nil, err
	}

	defer func() { _ = os.RemoveAll(dir) }()

	var stdout, stderr bytes.Buffer

	command := exec.CommandContext(context.Background(), "go", "run", ".")
	command.Dir = dir
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		return failed(probes), buildErrors(stderr.String()), nil
	}

	var outcomes []string
	if err := json.Unmarshal(stdout.Bytes(), &outcomes); err != nil || len(outcomes) != len(probes) {
		return nil, nil, fmt.Errorf("%w: %q", errHarness, stdout.String())
	}

	passed := make([]bool, len(probes))
	for index, probe := range probes {
		passed[index] = outcomes[index] == outcomeHeld && !probe.Rejects ||
			outcomes[index] == outcomeRejected && probe.Rejects
	}

	return passed, nil, nil
}

// harnessDir makes a temporary directory in tempDir holding the files, which the caller removes.
func harnessDir(tempDir string, files map[string][]byte) (string, error) {
	dir, err := os.MkdirTemp(tempDir, "genever-go-comparison")
	if err != nil {
		return "", fmt.Errorf("temporary directory: %w", err)
	}

	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), content, fileMode); err != nil {
			_ = os.RemoveAll(dir)

			return "", fmt.Errorf("write the harness: %w", err)
		}
	}

	return dir, nil
}

// failed is every probe failing, as when a tool's source doesn't build.
func failed(probes []Probe) []bool {
	return make([]bool, len(probes))
}

// buildErrors are the lines of `go run`'s errors, without the line naming the package.
func buildErrors(stderr string) []string {
	var lines []string

	for line := range strings.Lines(stderr) {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "# ") {
			lines = append(lines, line)
		}
	}

	return lines
}
