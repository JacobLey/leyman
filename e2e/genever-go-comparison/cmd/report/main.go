// Command report runs the comparison, and writes report/genever-go.json for the docs site.
package main

import (
	"fmt"
	"io"
	"os"

	comparison "github.com/JacobLey/leyman/e2e/genever-go-comparison"
)

// exit ends the process, swapped by tests.
var exit = os.Exit //nolint:gochecknoglobals // Swapped by tests

func main() {
	exit(run(os.Stderr, os.Getenv, "report/genever-go.json"))
}

// run writes the report to path, and returns the exit code.
func run(stderr io.Writer, getenv func(string) string, path string) int {
	if err := comparison.WriteReport(path, comparison.EnvironmentOptions(getenv)); err != nil {
		_, _ = fmt.Fprintln(stderr, err)

		return 1
	}

	return 0
}
