package generatedsignature

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

const (
	manifestVersion = 1
	hashPrefix      = "v1:"
	inline          = "inline"
)

// A ManifestEntry is how a file listed in a manifest is checked: by the hash of its content, or by its own inline
// signature token.
type ManifestEntry struct {
	// Inputs are what the file was generated from, compared by the generator to tell whether it is up to date. A nil
	// map is left out of the manifest, and an empty one is kept.
	Inputs map[string]string
	// Hash is the ContentHash of the file, when it isn't Inline.
	Hash string
	// Inline is a file that carries its own signature token, with no Hash.
	Inline bool
}

// A Manifest lists generated files, by path.
type Manifest struct {
	Files   map[string]ManifestEntry
	Version int
}

// ContentHash hashes a file's content, with CRLF line breaks as LF, for a file that can't carry a signature token
// (like JSON).
func ContentHash(content []byte) string {
	sum := sha256.Sum256(bytes.ReplaceAll(content, []byte("\r\n"), []byte("\n")))

	return hashPrefix + hex.EncodeToString(sum[:])[:hashLength]
}

// VerifyManifestEntry checks a file's content against its manifest entry. Inline content is read as UTF-8, without a
// leading byte order mark.
func VerifyManifestEntry(content []byte, entry ManifestEntry) VerifyResult {
	if entry.Inline {
		return Verify(string(bytes.TrimPrefix(content, []byte("\xef\xbb\xbf"))))
	}

	if ContentHash(content) == entry.Hash {
		return VerifyResult{Err: nil, Status: StatusValid}
	}

	return VerifyResult{Err: nil, Status: StatusInvalid}
}

func manifestError(detail string) error {
	return fmt.Errorf("%w: %s", ErrManifest, detail)
}

// ParseManifest reads a manifest, or fails with ErrManifest.
func ParseManifest(data []byte) (Manifest, error) {
	var parsed any
	if err := json.Unmarshal(data, &parsed); err != nil {
		return Manifest{}, fmt.Errorf("%w: not valid JSON: %w", ErrManifest, err)
	}

	root, isObject := parsed.(map[string]any)
	if !isObject {
		return Manifest{}, manifestError("not an object")
	}

	if root["version"] != float64(manifestVersion) {
		return Manifest{}, manifestError(fmt.Sprint("unsupported version ", root["version"]))
	}

	files, isObject := root["files"].(map[string]any)
	if !isObject {
		return Manifest{}, manifestError("files is not an object")
	}

	entries := make(map[string]ManifestEntry, len(files))

	for path, value := range files {
		entry, ok := parseEntry(value)
		if !ok {
			return Manifest{}, manifestError("invalid entry for " + path)
		}

		entries[path] = entry
	}

	return Manifest{Files: entries, Version: manifestVersion}, nil
}

// entryKeys are the keys an entry may have.
//
//nolint:gochecknoglobals // Never changed
var entryKeys = []string{"hash", "signature", "inputs"}

// parseEntry reads an entry: exactly one of a string `hash` or `signature: "inline"`, and optional string `inputs`.
func parseEntry(value any) (ManifestEntry, bool) {
	var invalid ManifestEntry

	object, isObject := value.(map[string]any)
	if !isObject {
		return invalid, false
	}

	for key := range object {
		if !slices.Contains(entryKeys, key) {
			return invalid, false
		}
	}

	hashValue, hasHash := object["hash"]
	hash, hashIsString := hashValue.(string)
	signature, hasSignature := object["signature"]
	isInline := signature == inline

	if hashIsString == isInline || hasHash && !hashIsString || hasSignature && !isInline {
		return invalid, false
	}

	inputs, ok := parseInputs(object)

	return ManifestEntry{Inputs: inputs, Hash: hash, Inline: isInline}, ok
}

// parseInputs reads an entry's optional `inputs`, an object of strings: nil when missing.
func parseInputs(entry map[string]any) (map[string]string, bool) {
	value, hasInputs := entry["inputs"]
	if !hasInputs {
		return nil, true
	}

	object, isObject := value.(map[string]any)
	if !isObject {
		return nil, false
	}

	inputs := make(map[string]string, len(object))

	for key, input := range object {
		text, isString := input.(string)
		if !isString {
			return nil, false
		}

		inputs[key] = text
	}

	return inputs, true
}

// SerializeManifest writes a manifest of files, as JSON indented by two spaces with a final line break, its paths and
// inputs sorted by UTF-16 code unit so it doesn't change with the order files were generated in.
func SerializeManifest(files map[string]ManifestEntry) string {
	var out strings.Builder

	out.WriteString("{\n  \"version\": 1,\n  \"files\": ")

	if len(files) == 0 {
		out.WriteString("{}")
	} else {
		out.WriteString("{")

		for i, path := range sortedKeys(files) {
			if i > 0 {
				out.WriteString(",")
			}

			out.WriteString("\n    " + quoteJSON(path) + ": ")
			writeEntry(&out, files[path])
		}

		out.WriteString("\n  }")
	}

	out.WriteString("\n}\n")

	return out.String()
}

// writeEntry writes an entry, inline when Inline, at the indent of a manifest's files.
func writeEntry(out *strings.Builder, entry ManifestEntry) {
	if entry.Inline {
		out.WriteString("{\n      \"signature\": \"inline\"")
	} else {
		out.WriteString("{\n      \"hash\": " + quoteJSON(entry.Hash))
	}

	if entry.Inputs != nil {
		out.WriteString(",\n      \"inputs\": ")

		if len(entry.Inputs) == 0 {
			out.WriteString("{}")
		} else {
			out.WriteString("{")

			for i, key := range sortedKeys(entry.Inputs) {
				if i > 0 {
					out.WriteString(",")
				}

				out.WriteString("\n        " + quoteJSON(key) + ": " + quoteJSON(entry.Inputs[key]))
			}

			out.WriteString("\n      }")
		}
	}

	out.WriteString("\n    }")
}

// sortedKeys are a map's keys in UTF-16 code unit order, as JavaScript compares strings.
func sortedKeys[V any](record map[string]V) []string {
	keys := make([]string, 0, len(record))
	for key := range record {
		keys = append(keys, key)
	}

	slices.SortFunc(keys, func(a, b string) int {
		return slices.Compare(utf16.Encode([]rune(a)), utf16.Encode([]rune(b)))
	})

	return keys
}

// escapes are the characters JSON.stringify writes as a short escape.
//
//nolint:gochecknoglobals // Never changed
var escapes = map[rune]string{'"': `\"`, '\\': `\\`, '\b': `\b`, '\f': `\f`, '\n': `\n`, '\r': `\r`, '\t': `\t`}

// quoteJSON quotes a string as JavaScript's JSON.stringify does, escaping only quotes, backslashes and control
// characters. Invalid UTF-8 is written as U+FFFD.
func quoteJSON(text string) string {
	var out strings.Builder

	out.WriteByte('"')

	for _, char := range strings.ToValidUTF8(text, string(utf8.RuneError)) {
		if escape, ok := escapes[char]; ok {
			out.WriteString(escape)
		} else if char < ' ' {
			fmt.Fprintf(&out, `\u%04x`, char)
		} else {
			out.WriteRune(char)
		}
	}

	out.WriteByte('"')

	return out.String()
}
