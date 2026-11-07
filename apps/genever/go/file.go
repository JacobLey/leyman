package genever

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/convert"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	populatefiles "github.com/JacobLey/leyman/apps/populate-files/go"
	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

// Version is genever's, recorded in manifests so a new version regenerates its files.
const Version = "0.0.0"

// FileOptions of GenerateFile.
type FileOptions struct {
	Options

	// Client fetches URLs. It must not follow redirects, which GenerateFile follows only to allowed hosts. Nil is a
	// client that doesn't.
	Client *http.Client
	// Cwd is the directory that the input, Output and Manifest are relative to, or the working directory when empty.
	Cwd string
	// Output is the Go file to write. Defaults to the input path, without a .json, .yaml or .yml extension, with .go.
	Output string
	// Manifest records the output, and hashes of its inputs, in this manifest (as populate-files writes it). A check
	// then finds an output still matching it up to date without reading URLs.
	Manifest string
	// FetchHosts are the only hosts URLs may be loaded from, e.g. example.com, localhost:8080, or *.example.com for its
	// subdomains. Without any, every host is.
	FetchHosts []string
	// NoFetch loads only files, never URLs, whatever FetchHosts.
	NoFetch bool
	// Check fails with a populatefiles.CheckError, rather than writing, when the output is out of date.
	Check bool
	// DryRun doesn't write the output.
	DryRun bool
	// Signed signs the output, and refuses to overwrite it if it was edited or isn't signed.
	Signed bool
	// Force overwrites a signed output even if it was edited.
	Force bool
}

// A FileResult is the output of GenerateFile, and whether it was (or would be) written.
type FileResult struct {
	// Output is its absolute path.
	Output  string
	Updated bool
}

// schemaExtension is the extension of a schema file, which the output's replaces.
var schemaExtension = regexp.MustCompile(`(?i)\.(?:json|ya?ml)$`)

// identity is what generated a file, recorded in its manifest entry.
type identity struct {
	generator string
	options   string
}

// generatorIdentity is genever's version, and a hash of the options that change the output, with defaults resolved.
func generatorIdentity(options FileOptions) identity {
	resolved := struct {
		Name      string `json:"name"`
		Package   string `json:"package"`
		OpenAPI30 bool   `json:"openApi30"`
		Signed    bool   `json:"signed"`
		Strict    bool   `json:"strict"`
	}{
		Name:      options.Name,
		Package:   options.Package,
		OpenAPI30: options.OpenAPI30,
		Signed:    options.Signed,
		Strict:    !options.NoStrict,
	}

	if resolved.Name == "" {
		resolved.Name = "Schema"
	}

	if resolved.Package == "" {
		resolved.Package = "schema"
	}

	encoded, _ := json.Marshal(resolved) //nolint:errchkjson // Only strings and booleans

	return identity{generator: "genever-go@" + Version, options: generatedsignature.ContentHash(encoded)}
}

// inputKey is how an input is recorded: a file relative to the manifest (starting with "."), or else its URI.
func inputKey(manifestDir, uri string) string {
	parsed, err := url.Parse(uri)
	if err == nil && parsed.Scheme == "file" {
		// Only fails for a path on another Windows volume, kept as its URI
		if relative, err := filepath.Rel(manifestDir, filepath.FromSlash(parsed.Path)); err == nil {
			relative = filepath.ToSlash(relative)
			if !strings.HasPrefix(relative, "../") {
				relative = "./" + relative
			}

			return relative
		}
	}

	return uri
}

// isUpToDate reports whether the output still matches its manifest entry: by the same generator and options, unedited,
// and from files with the same content. URLs aren't read again.
func isUpToDate(manifestPath, output string, generator identity) bool {
	manifestText, manifestErr := os.ReadFile(manifestPath) //nolint:gosec // The manifest asked for
	outputText, outputErr := os.ReadFile(output)           //nolint:gosec // The output asked for

	if manifestErr != nil || outputErr != nil {
		return false
	}

	manifest, err := generatedsignature.ParseManifest(manifestText)
	if err != nil {
		return false
	}

	dir := filepath.Dir(manifestPath)

	// Keyed as populate-files writes it
	relative, _ := filepath.Rel(dir, output)

	entry, listed := manifest.Files[filepath.ToSlash(relative)]
	if !listed || entry.Inputs["generator"] != generator.generator || entry.Inputs["options"] != generator.options ||
		generatedsignature.VerifyManifestEntry(outputText, entry).Status != generatedsignature.StatusValid {
		return false
	}

	return inputsUnchanged(dir, entry.Inputs)
}

// inputsUnchanged reports whether each file of an entry's inputs (keys starting with ".") still has its hash.
func inputsUnchanged(dir string, inputs map[string]string) bool {
	for key, hash := range inputs {
		if !strings.HasPrefix(key, ".") {
			continue
		}

		current, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(key))) //nolint:gosec // An input it lists
		if err != nil || generatedsignature.ContentHash(current) != hash {
			return false
		}
	}

	return true
}

// resolve is a path relative to a directory, unless it is absolute.
func resolve(dir, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}

	return filepath.Join(dir, path)
}

// parseInput reads a schema file's text, as YAML when its extension is .yaml or .yml.
func parseInput(path string, text []byte) (any, error) {
	if !strings.HasSuffix(strings.ToLower(path), ".yaml") && !strings.HasSuffix(strings.ToLower(path), ".yml") {
		return jsonv.Parse(text) //nolint:wrapcheck // ErrSyntax, already saying what is wrong
	}

	return convert.ParseYAML(text) //nolint:wrapcheck // ErrYAML, already saying what is wrong
}

// filePaths are the absolute paths of GenerateFile.
type filePaths struct {
	cwd    string
	input  string
	output string
	// manifest is empty without one.
	manifest string
}

// resolveFilePaths resolves the paths of GenerateFile against its Cwd, with the output's default.
func resolveFilePaths(input string, options FileOptions) (filePaths, error) {
	cwd, err := filepath.Abs(options.Cwd)
	if err != nil {
		return filePaths{}, fmt.Errorf("resolving cwd: %w", err)
	}

	paths := filePaths{cwd: cwd, input: resolve(cwd, input), output: options.Output, manifest: ""}
	if paths.output == "" {
		paths.output = schemaExtension.ReplaceAllString(paths.input, "") + ".go"
	}

	paths.output = resolve(cwd, paths.output)

	if options.Manifest != "" {
		paths.manifest = resolve(cwd, options.Manifest)
	}

	return paths, nil
}

// GenerateFile generates Go types from a JSON Schema file, or OpenAPI document, and writes them unless the output is
// up to date, as populate-files writes a file. The files and URLs the schema refers to are loaded, as JSON, or as YAML
// for a .yaml or .yml path (or a URL served as YAML).
//
// Options.BaseURI is the input file's URL.
func GenerateFile(ctx context.Context, input string, options FileOptions) (FileResult, error) {
	paths, err := resolveFilePaths(input, options)
	if err != nil {
		return FileResult{}, err
	}

	cwd, inputPath, output, manifestPath := paths.cwd, paths.input, paths.output, paths.manifest

	generator := generatorIdentity(options)
	if manifestPath != "" && options.Check && isUpToDate(manifestPath, output, generator) {
		return FileResult{Output: output, Updated: false}, nil
	}

	content, sources, err := generateFromFile(ctx, inputPath, options)
	if err != nil {
		return FileResult{}, err
	}

	var inputs map[string]string

	if manifestPath != "" {
		inputs = map[string]string{"generator": generator.generator, "options": generator.options}
		for uri, text := range sources {
			inputs[inputKey(filepath.Dir(manifestPath), uri)] = generatedsignature.ContentHash(text)
		}
	}

	result, err := populatefiles.PopulateFile(
		populatefiles.File{ManifestInputs: inputs, Path: output, Content: content, Signed: options.Signed},
		populatefiles.Options{
			Cwd:       cwd,
			TargetDir: "",
			Manifest:  manifestPath,
			Check:     options.Check,
			DryRun:    options.DryRun,
			Force:     options.Force,
			Clean:     false,
		},
	)
	if err != nil {
		return FileResult{}, err //nolint:wrapcheck // populate-files' errors, which callers match
	}

	return FileResult{Output: output, Updated: result.Updated}, nil
}

// generateFromFile reads, loads and generates a schema file, and returns the source with the text of each file and URL
// read, by URI.
func generateFromFile(ctx context.Context, inputPath string, options FileOptions) ([]byte, map[string][]byte, error) {
	text, err := os.ReadFile(inputPath) //nolint:gosec // The input asked for
	if err != nil {
		return nil, nil, fmt.Errorf("reading %s: %w", inputPath, err)
	}

	baseURI := (&url.URL{Scheme: "file", Path: filepath.ToSlash(inputPath)}).String() //nolint:exhaustruct_v5 // A file URL
	sources := map[string][]byte{baseURI: text}

	root, err := parseInput(inputPath, text)
	if err != nil {
		return nil, nil, err
	}

	var hosts []string
	if !options.NoFetch {
		hosts = options.FetchHosts
	}

	bundle, err := convert.Load(ctx, root, convert.LoadOptions{
		OnRead:     func(uri string, read []byte) { sources[uri] = read },
		Client:     options.Client,
		BaseURI:    baseURI,
		FetchHosts: hosts,
		Fetch:      !options.NoFetch,
	})
	if err != nil {
		return nil, nil, err //nolint:wrapcheck // An Error, whose kind and pointer callers read
	}

	generateOptions := options.Options
	generateOptions.BaseURI = baseURI

	content, err := generate(bundle.Input, generateOptions, bundle.Files)
	if err != nil {
		return nil, nil, err
	}

	return content, sources, nil
}
