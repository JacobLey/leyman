// Package populatefiles writes generated files, and keeps them in sync.
//
// It is the Go implementation of the populate-files npm package, held to the same test vectors, so the two decide the
// same writes, refusals and check failures, and read each other's signed files and manifests:
// https://github.com/JacobLey/leyman/tree/main/apps/populate-files
//
// A call decides every file before it writes any, so a refusal or failed check leaves the files as they were.
// Manifests are written unformatted, as generatedsignature.SerializeManifest writes them.
package populatefiles

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

// A File to populate.
type File struct {
	// ManifestInputs are recorded in the manifest, for the generator to tell whether the file is up to date. A nil map
	// is left out, and an empty one is kept.
	ManifestInputs map[string]string
	// Path is relative to the target directory.
	Path string
	// Content is the file's bytes, or the text to sign when Signed.
	Content []byte
	// Signed files carry a signature token, which must stay valid outside their manual sections for the file to be
	// overwritten, and their manual sections are kept. The comment style is the path's.
	Signed bool
}

// Options of a call.
type Options struct {
	// Cwd is the directory that TargetDir and Manifest are relative to, or the working directory when empty.
	Cwd string
	// TargetDir is the directory that files are relative to, or Cwd when empty.
	TargetDir string
	// Manifest is the path of a manifest listing the generated files, or none when empty. An existing file must then be
	// listed, and unchanged since, to be overwritten.
	Manifest string
	// Check fails with a *CheckError instead of writing, when any file is out of date.
	Check bool
	// DryRun reports what would be written, without writing.
	DryRun bool
	// Force overwrites and removes files that aren't owned.
	Force bool
	// Clean removes the target directory's other files, or only the manifest's previous files with a manifest.
	Clean bool
}

// A Result is a file that was (or would be) written or removed, or was already up to date.
type Result struct {
	// Path is absolute.
	Path string
	// Reason is set when Updated.
	Reason  Reason
	Updated bool
}

// normalized is a file with its absolute path.
type normalized struct {
	inputs  map[string]string
	path    string
	content []byte
	signed  bool
}

// A plan is a file's result, and the content to write when it is updated.
type plan struct {
	content []byte
	result  Result
}

// paths are the absolute directories and manifest of a call.
type paths struct {
	targetDir string
	// manifest is empty without one.
	manifest string
}

func resolve(base, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}

	return filepath.Join(base, path)
}

func resolvePaths(options Options) (paths, error) {
	cwd, err := filepath.Abs(options.Cwd)
	if err != nil {
		return paths{}, fmt.Errorf("resolving cwd: %w", err)
	}

	manifest := ""
	if options.Manifest != "" {
		manifest = resolve(cwd, options.Manifest)
	}

	return paths{targetDir: resolve(cwd, options.TargetDir), manifest: manifest}, nil
}

func normalize(file File, targetDir string) normalized {
	return normalized{
		inputs:  file.ManifestInputs,
		path:    resolve(targetDir, file.Path),
		content: file.Content,
		signed:  file.Signed,
	}
}

// readIfExists is a file's content, or nil when it doesn't exist.
func readIfExists(path string) ([]byte, error) {
	content, err := os.ReadFile(path) //nolint:gosec // Reading the generated paths is the point
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}

	return content, nil
}

// prepare decides whether a file is written, checking that an existing file is owned: by its signature when signed,
// or else by its manifest entry, when there is a manifest.
func prepare(file normalized, force bool, manifest *lookup) (plan, error) {
	existing, err := readIfExists(file.path)
	if err != nil {
		return plan{}, err
	}

	content := file.content
	if file.signed {
		content, err = signContent(file.path, file.content, existing, force)
		if err != nil {
			return plan{}, err
		}
	}

	if existing == nil {
		return plan{content: content, result: Result{Path: file.path, Reason: ReasonFileNotExist, Updated: true}}, nil
	}

	if bytes.Equal(existing, content) {
		return plan{content: nil, result: Result{Path: file.path, Reason: "", Updated: false}}, nil
	}

	if manifest != nil && !file.signed && !force {
		if err := assertOwnedByManifest(file.path, existing, manifest.entries, manifest.found(file.path)); err != nil {
			return plan{}, err
		}
	}

	return plan{content: content, result: Result{Path: file.path, Reason: ReasonContentChanged, Updated: true}}, nil
}

// Modes of what is written, before the umask: as readable as any other file, like Node.js writes them.
const (
	dirMode  = 0o777
	fileMode = 0o666
)

// write writes each updated plan's content, creating its directory.
func write(plans []plan) error {
	for _, planned := range plans {
		if !planned.result.Updated {
			continue
		}

		if err := os.MkdirAll(filepath.Dir(planned.result.Path), dirMode); err != nil {
			return fmt.Errorf("creating the directory of %s: %w", planned.result.Path, err)
		}

		if err := os.WriteFile(planned.result.Path, planned.content, fileMode); err != nil {
			return fmt.Errorf("writing %s: %w", planned.result.Path, err)
		}
	}

	return nil
}

// finish fails with a *CheckError when checking and any plan writes or removes a file (only the first, when
// firstOnly), or else applies the plans unless it is a dry run.
func finish(plans []plan, options Options, firstOnly bool) error {
	if options.Check {
		var outdated []Outdated

		for _, planned := range plans {
			if planned.result.Updated && (outdated == nil || !firstOnly) {
				outdated = append(outdated, Outdated{Path: planned.result.Path, Reason: planned.result.Reason})
			}
		}

		if outdated != nil {
			return &CheckError{Files: outdated}
		}

		return nil
	}

	if options.DryRun {
		return nil
	}

	return apply(plans)
}

// start resolves a call's paths, and loads its manifest: nil without one.
func start(options Options) (paths, *lookup, error) {
	resolved, err := resolvePaths(options)
	if err != nil || resolved.manifest == "" {
		return resolved, nil, err
	}

	manifest, err := loadManifest(resolved.manifest)

	return resolved, manifest, err
}

// PopulateFile writes a file when its content changed, unless it is up to date. With a manifest, only this file's
// entry changes, so other files written to the same manifest are kept. A check reports the file before its manifest.
func PopulateFile(file File, options Options) (Result, error) {
	resolved, manifest, err := start(options)
	if err != nil {
		return Result{}, err
	}

	target := normalize(file, resolved.targetDir)

	planned, err := prepare(target, options.Force, manifest)
	if err != nil {
		return Result{}, err
	}

	plans := []plan{planned}

	if manifest != nil {
		manifest.entries[target.path] = entryFor(target)
		plans = append(plans, manifest.plan(manifest.entries))
	}

	if err := finish(plans, options, true); err != nil {
		return Result{}, err
	}

	return planned.result, nil
}

// PopulateFiles writes each file whose content changed, then the manifest, which lists exactly these files, and
// removes stale files when cleaning. Results are in that order: files, the manifest, then stale files.
func PopulateFiles(files []File, options Options) ([]Result, error) {
	resolved, manifest, err := start(options)
	if err != nil {
		return nil, err
	}

	targets := make([]normalized, len(files))
	generated := make(map[string]bool, len(files))

	for index, file := range files {
		targets[index] = normalize(file, resolved.targetDir)
		if generated[targets[index].path] {
			return nil, fmt.Errorf("%w: %s", ErrDuplicateFile, targets[index].path)
		}

		generated[targets[index].path] = true
	}

	plans, err := planFiles(targets, resolved, manifest, options)
	if err != nil {
		return nil, err
	}

	if err := finish(plans, options, false); err != nil {
		return nil, err
	}

	results := make([]Result, len(plans))
	for i, planned := range plans {
		results[i] = planned.result
	}

	return results, nil
}

// planFiles decides the writes of files, their manifest, and the removal of stale files.
func planFiles(targets []normalized, resolved paths, manifest *lookup, options Options) ([]plan, error) {
	plans := make([]plan, 0, len(targets)+1)

	for _, target := range targets {
		planned, err := prepare(target, options.Force, manifest)
		if err != nil {
			return nil, err
		}

		plans = append(plans, planned)
	}

	var stale []plan

	if options.Clean {
		var err error

		stale, err = findStale(targets, resolved, manifest, options.Force)
		if err != nil {
			return nil, err
		}
	}

	if manifest != nil {
		entries := make(map[string]generatedsignature.ManifestEntry, len(targets))
		for _, target := range targets {
			entries[target.path] = entryFor(target)
		}

		plans = append(plans, manifest.plan(entries))
	}

	return append(plans, stale...), nil
}

// apply writes the updated files, and removes the stale ones.
func apply(plans []plan) error {
	var writes []plan

	for _, planned := range plans {
		if planned.result.Reason == ReasonStaleFile {
			if err := os.Remove(planned.result.Path); err != nil {
				return fmt.Errorf("removing %s: %w", planned.result.Path, err)
			}
		} else {
			writes = append(writes, planned)
		}
	}

	return write(writes)
}
