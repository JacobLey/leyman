package populatefiles

import (
	"bytes"
	"fmt"
	"path/filepath"
	"slices"

	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go-impl"
)

// A lookup is a manifest, with its entries by absolute path.
type lookup struct {
	entries map[string]generatedsignature.ManifestEntry
	path    string
	// raw is its content, or nil when it doesn't exist.
	raw []byte
}

func (manifest *lookup) found(path string) bool {
	_, ok := manifest.entries[path]

	return ok
}

// loadManifest reads a manifest's entries, with its paths resolved against its directory: none when it doesn't exist.
func loadManifest(manifestPath string) (*lookup, error) {
	raw, err := readIfExists(manifestPath)
	if err != nil {
		return nil, err
	}

	entries := map[string]generatedsignature.ManifestEntry{}

	if raw != nil {
		manifest, err := generatedsignature.ParseManifest(raw)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", manifestPath, err)
		}

		for relative, entry := range manifest.Files {
			entries[resolve(filepath.Dir(manifestPath), filepath.FromSlash(relative))] = entry
		}
	}

	return &lookup{entries: entries, path: manifestPath, raw: raw}, nil
}

// sortedPaths are a manifest's paths in order.
func (manifest *lookup) sortedPaths() []string {
	paths := make([]string, 0, len(manifest.entries))
	for path := range manifest.entries {
		paths = append(paths, path)
	}

	slices.Sort(paths)

	return paths
}

// entryFor is the manifest entry of a file: its inline signature, or else the hash of its content.
func entryFor(file normalized) generatedsignature.ManifestEntry {
	if file.signed {
		return generatedsignature.ManifestEntry{Inputs: file.inputs, Hash: "", Inline: true}
	}

	return generatedsignature.ManifestEntry{
		Inputs: file.inputs,
		Hash:   generatedsignature.ContentHash(file.content),
		Inline: false,
	}
}

// assertOwnedByManifest fails unless an existing file is listed in the manifest, and unchanged since.
func assertOwnedByManifest(
	path string, existing []byte, entries map[string]generatedsignature.ManifestEntry, listed bool,
) error {
	if !listed {
		return &OwnershipError{Err: nil, Path: path, Reason: OwnershipNotOwned, Detail: "not listed in the manifest"}
	}

	if generatedsignature.VerifyManifestEntry(existing, entries[path]).Status != generatedsignature.StatusValid {
		return &OwnershipError{Err: nil, Path: path, Reason: OwnershipEdited, Detail: ""}
	}

	return nil
}

// relativeTo is a path relative to a directory, or the path itself when it has none (on another Windows volume).
func relativeTo(dir, path string) string {
	if relative, err := filepath.Rel(dir, path); err == nil {
		return relative
	}

	return path
}

// plan decides whether the manifest is written with entries, with paths relative to its directory.
func (manifest *lookup) plan(entries map[string]generatedsignature.ManifestEntry) plan {
	files := make(map[string]generatedsignature.ManifestEntry, len(entries))
	for path, entry := range entries {
		files[filepath.ToSlash(relativeTo(filepath.Dir(manifest.path), path))] = entry
	}

	content := []byte(generatedsignature.SerializeManifest(files))

	switch {
	case manifest.raw == nil:
		return plan{content: content, result: Result{Path: manifest.path, Reason: ReasonFileNotExist, Updated: true}}
	case bytes.Equal(manifest.raw, content):
		return plan{content: nil, result: Result{Path: manifest.path, Reason: "", Updated: false}}
	default:
		return plan{content: content, result: Result{Path: manifest.path, Reason: ReasonContentChanged, Updated: true}}
	}
}
