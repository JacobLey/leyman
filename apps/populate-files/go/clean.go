package populatefiles

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
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

// listStale lists the regular files of a directory, recursively, that aren't generated: none when it doesn't exist.
func listStale(dir string, generated map[string]bool) ([]plan, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("listing %s: %w", dir, err)
	}

	var stale []plan

	for _, entry := range entries {
		path := filepath.Join(dir, entry.Name())

		switch {
		case entry.IsDir():
			nested, err := listStale(path, generated)
			if err != nil {
				return nil, err
			}

			stale = append(stale, nested...)
		case entry.Type().IsRegular() && !generated[path]:
			stale = append(stale, stalePlan(path))
		}
	}

	return stale, nil
}
