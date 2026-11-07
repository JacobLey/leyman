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

// harnessGoMod is the module the generated source is built in, with only the standard library: a tool whose types
// import its own package fails the comparison, rather than scoring zero, until that package is added here.
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

// errHarness is the harness failing other than by the generated source not compiling, such as Go missing, an import
// it can't resolve, or a panic outside decoding: the comparison's problem, not the tool's.
var errHarness = errors.New("the harness failed")

// runProbes builds the generated source with a harness, and decodes each probe's value. It returns whether each probe
// passed, and the build's errors, when the source doesn't build.
func runProbes(generated Generated, probes []Probe) ([]bool, []string, error) {
	values := make([]string, len(probes))
	for index, probe := range probes {
		values[index] = strconv.Quote(probe.Value)
	}

	main := fmt.Sprintf(harnessMain, strings.Join(values, ", "), outcomePanicked, generated.Subject, outcomeRejected,
		outcomeChanged, outcomeChanged, outcomeHeld)

	dir, err := harnessDir(map[string][]byte{
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
		// Compile errors are listed under the package's name
		if !strings.HasPrefix(stderr.String(), "# ") {
			return nil, nil, fmt.Errorf("%w: %w: %s", errHarness, err, stderr.String())
		}

		return failed(probes), buildErrors(stderr.String()), nil
	}

	passed, err := score(stdout.Bytes(), probes)

	return passed, nil, err
}

// score is whether each probe passed, from the outcomes the harness printed.
func score(printed []byte, probes []Probe) ([]bool, error) {
	var outcomes []string
	if err := json.Unmarshal(printed, &outcomes); err != nil || len(outcomes) != len(probes) {
		return nil, fmt.Errorf("%w: it printed %q", errHarness, printed)
	}

	passed := make([]bool, len(probes))
	for index, probe := range probes {
		passed[index] = outcomes[index] == outcomeHeld && !probe.Rejects ||
			outcomes[index] == outcomeRejected && probe.Rejects
	}

	return passed, nil
}

// harnessDir makes a temporary directory holding the files, which the caller removes.
func harnessDir(files map[string][]byte) (string, error) {
	dir, err := os.MkdirTemp("", "genever-go-comparison")
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

// buildErrors are the lines of `go run`'s compile errors, without the line naming the package.
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
