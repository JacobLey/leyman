package populatefiles

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
)

func stalePlan(path string) plan {
	return plan{content: nil, result: Result{Path: path, Reason: ReasonStaleFile, Updated: true}}
}

// findStale lists the files to remove when cleaning: with a manifest, the files it listed that are no longer
// generated, which must still be owned unless forced; without one, every other file in the target directory.
func findStale(targets []normalized, resolved paths, manifest *lookup, force bool) ([]plan, error) {
	generated := map[string]bool{resolved.manifest: true}
	for _, target := range targets {
		generated[target.path] = true
	}

	if manifest == nil {
		return listStale(resolved.targetDir, generated)
	}

	var stale []plan

	for _, path := range manifest.sortedPaths() {
		if generated[path] {
			continue
		}

		existing, err := readIfExists(path)
		if err != nil {
			return nil, err
		}

		if existing == nil {
			continue
		}

		if !force {
			if err := assertOwnedByManifest(path, existing, manifest.entries, true); err != nil {
				return nil, err
			}
		}

		stale = append(stale, stalePlan(path))
	}

	return stale, nil
}

// A listed entry of the target directory, or the directory itself without an entry.
type listed struct {
	entry fs.DirEntry
	path  string
}

// listStale lists the regular files of a directory, recursively, that aren't generated, by path in depth-first order:
// none when it doesn't exist.
func listStale(dir string, generated map[string]bool) ([]plan, error) {
	var stale []plan

	// A stack: the last is next, so each directory's entries are pushed in reverse
	pending := []listed{{entry: nil, path: dir}}

	for len(pending) > 0 {
		next := pending[len(pending)-1]
		pending = pending[:len(pending)-1]

		if next.entry != nil && !next.entry.IsDir() {
			if next.entry.Type().IsRegular() && !generated[next.path] {
				stale = append(stale, stalePlan(next.path))
			}

			continue
		}

		entries, err := os.ReadDir(next.path)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}

		if err != nil {
			return nil, fmt.Errorf("listing %s: %w", next.path, err)
		}

		for _, entry := range slices.Backward(entries) {
			pending = append(pending, listed{entry: entry, path: filepath.Join(next.path, entry.Name())})
		}
	}

	return stale, nil
}
