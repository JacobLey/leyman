// Command genever writes Go types for a JSON Schema file, or the schemas of an OpenAPI document.
//
// Usage:
//
//	genever [flags] <input>
//
// Its flags are the TypeScript genever CLI's, with --package for the Go package, and without the options that only
// shape TypeScript types. Run it with --help for the list.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	genever "github.com/JacobLey/leyman/apps/genever/go"
)

// exit ends the process, swapped by tests.
//
//nolint:gochecknoglobals // Swapped only by tests
var exit = os.Exit

func main() {
	exit(run(context.Background(), os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

// ciVariables are the generic environment variables that the ci-info package (which the TypeScript CLI uses) reads as
// running in CI.
//
//nolint:gochecknoglobals // Never changed
var ciVariables = []string{
	"BUILD_ID", "BUILD_NUMBER", "CI", "CI_APP_ID", "CI_BUILD_ID", "CI_BUILD_NUMBER", "CI_NAME",
	"CONTINUOUS_INTEGRATION", "RUN_ID",
}

// isCI reports whether the environment is CI, unless CI is "false".
func isCI(getenv func(string) string) bool {
	if getenv("CI") == "false" {
		return false
	}

	for _, name := range ciVariables {
		if getenv(name) != "" {
			return true
		}
	}

	return false
}

// flags are the parsed command line.
type flags struct {
	options     genever.FileOptions
	positionals []string
	version     bool
}

// newFlagSet defines the flags, filling in parsed.
func newFlagSet(parsed *flags, stderr io.Writer, getenv func(string) string) *flag.FlagSet {
	set := flag.NewFlagSet("genever", flag.ContinueOnError)
	set.SetOutput(stderr)
	set.Usage = func() {
		_, _ = fmt.Fprintln(stderr, "Usage: genever [flags] <input>\n\n"+
			"Write Go types for a JSON Schema file, or the schemas of an OpenAPI document. A .yaml or .yml file is read "+
			"as YAML.\n\nFlags:")

		set.PrintDefaults()
	}

	options := &parsed.options

	for _, name := range []string{"o", "output"} {
		set.StringVar(&options.Output, name, "",
			"Path of the Go file to write. Defaults to the input path, with a .go extension")
	}

	set.StringVar(&options.Name, "name", "Schema", "Name of the root schema type. Not used for an OpenAPI document")
	set.StringVar(&options.Package, "package", "schema", "Package of the Go file")
	set.BoolVar(&options.NoStrict, "no-strict", false, "Accept likely mistakes in the schema, such as unknown keywords")
	set.BoolVar(&options.OpenAPI30, "open-api-30", false, "Read the schema as an OpenAPI 3.0 schema, which allows "+
		"nullable and example. An OpenAPI document's own version is used instead")
	set.BoolVar(&options.NoFetch, "no-fetch", false, "Load only files the schema references, not URLs")
	set.Func("fetch-host", "Load only URLs of this host, e.g. example.com, localhost:8080, or *.example.com for its "+
		"subdomains. Repeat for more hosts", func(host string) error {
		options.FetchHosts = append(options.FetchHosts, host)

		return nil
	})
	set.BoolVar(&options.Check, "ci", isCI(getenv), "Fail if the output file is not up to date. Implies --dry-run. "+
		"Defaults to whether it runs in CI")
	set.BoolVar(&options.DryRun, "dry-run", false, "Do not write the output file")
	set.BoolVar(&options.Signed, "signed", false,
		"Sign the output file, and refuse to overwrite it if it was edited or is not signed")
	set.BoolVar(&options.Force, "force", false, "With --signed, overwrite the output file even if it was edited")
	set.StringVar(&options.Manifest, "manifest", "", "Record the output, and hashes of its inputs, in this manifest. "+
		"With --ci, an output still matching it is up to date without fetching URLs")
	set.StringVar(&options.Cwd, "cwd", ".", "Current working directory")
	set.BoolVar(&parsed.version, "version", false, "Print the version")

	return set
}

// parse reads the command line, with flags before or after the input.
func parse(args []string, stderr io.Writer, getenv func(string) string) (flags, error) {
	var parsed flags

	set := newFlagSet(&parsed, stderr, getenv)

	for {
		if err := set.Parse(args); err != nil {
			return parsed, err //nolint:wrapcheck // The flag package's error, which it already printed
		}

		if set.NArg() == 0 {
			return parsed, nil
		}

		parsed.positionals = append(parsed.positionals, set.Arg(0))
		args = set.Args()[1:]
	}
}

// run runs the command, and returns its exit code: 0, or 1 on any error.
func run(ctx context.Context, args []string, stdout, stderr io.Writer, getenv func(string) string) int {
	parsed, err := parse(args, stderr, getenv)

	switch {
	case errors.Is(err, flag.ErrHelp):
		return 0
	case err != nil:
		return 1
	case parsed.version:
		_, _ = fmt.Fprintln(stdout, "genever-go", genever.Version)

		return 0
	case len(parsed.positionals) != 1:
		_, _ = fmt.Fprintf(stderr, "Expected one input, got %d: %s\n", len(parsed.positionals),
			strings.Join(parsed.positionals, " "))

		return 1
	case parsed.options.NoFetch && parsed.options.FetchHosts != nil:
		_, _ = fmt.Fprintln(stderr, "--fetch-host loads URLs, which --no-fetch disables")

		return 1
	}

	result, err := genever.GenerateFile(ctx, parsed.positionals[0], parsed.options)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, err)

		return 1
	}

	if result.Updated {
		_, _ = fmt.Fprintln(stdout, result.Output)
	}

	return 0
}
