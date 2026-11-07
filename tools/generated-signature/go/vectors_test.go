package generatedsignature_test

import (
	"encoding/json"
	"errors"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"testing"

	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

type style struct {
	End   *string `json:"end"`
	Start string  `json:"start"`
}

type options struct {
	Comment  *style  `json:"comment"`
	Message  *string `json:"message"`
	FilePath string  `json:"filePath"`
	ID       string  `json:"id"`
	Body     string  `json:"body"`
	Indent   string  `json:"indent"`
}

type vectorError struct {
	Kind   string `json:"kind"`
	Reason string `json:"reason"`
	Line   int    `json:"line"`
}

type section struct {
	ID        string `json:"id"`
	Body      string `json:"body"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
}

type entry struct {
	Inputs    map[string]string `json:"inputs"`
	Hash      string            `json:"hash"`
	Signature string            `json:"signature"`
}

type testVectors struct {
	CommentStyles []struct {
		Style    *style `json:"style"`
		FilePath string `json:"filePath"`
	} `json:"commentStyles"`
	Sign []struct {
		Options     *options     `json:"options"`
		Signed      *string      `json:"signed"`
		Error       *vectorError `json:"error"`
		Description string       `json:"description"`
		Text        string       `json:"text"`
	} `json:"sign"`
	Verify []struct {
		Description string `json:"description"`
		Text        string `json:"text"`
		Status      string `json:"status"`
		Reason      string `json:"reason"`
		Line        int    `json:"line"`
	} `json:"verify"`
	Sections []struct {
		Error       *vectorError `json:"error"`
		Description string       `json:"description"`
		Text        string       `json:"text"`
		Sections    []section    `json:"sections"`
	} `json:"sections"`
	Merge []struct {
		Result *struct {
			Text    string   `json:"text"`
			Orphans []string `json:"orphans"`
		} `json:"result"`
		Error       *vectorError `json:"error"`
		Description string       `json:"description"`
		Generated   string       `json:"generated"`
		Existing    string       `json:"existing"`
	} `json:"merge"`
	ManualSection []struct {
		Text        *string      `json:"text"`
		Error       *vectorError `json:"error"`
		Description string       `json:"description"`
		Options     options      `json:"options"`
	} `json:"manualSection"`
	ContentHash []struct {
		Description string `json:"description"`
		Text        string `json:"text"`
		Hash        string `json:"hash"`
	} `json:"contentHash"`
	ManifestEntries []struct {
		Description string `json:"description"`
		Content     string `json:"content"`
		Status      string `json:"status"`
		Reason      string `json:"reason"`
		Entry       entry  `json:"entry"`
		Line        int    `json:"line"`
	} `json:"manifestEntries"`
	ParseManifest []struct {
		Files       map[string]entry `json:"files"`
		Error       *vectorError     `json:"error"`
		Description string           `json:"description"`
		Text        string           `json:"text"`
	} `json:"parseManifest"`
	SerializeManifest []struct {
		Files       map[string]entry `json:"files"`
		Description string           `json:"description"`
		Text        string           `json:"text"`
	} `json:"serializeManifest"`
}

func readVectors(t *testing.T) testVectors {
	t.Helper()

	var vectors testVectors
	if err := json.Unmarshal(readVectorsFile(t), &vectors); err != nil {
		t.Fatal(err)
	}

	return vectors
}

func (s *style) commentStyle() generatedsignature.CommentStyle {
	if s == nil {
		return generatedsignature.CommentStyle{Start: "", End: ""}
	}

	end := ""
	if s.End != nil {
		end = *s.End
	}

	return generatedsignature.CommentStyle{Start: s.Start, End: end}
}

func (o *options) commentOptions() generatedsignature.CommentOptions {
	return generatedsignature.CommentOptions{Comment: o.Comment.commentStyle(), FilePath: o.FilePath}
}

func (e entry) manifestEntry() generatedsignature.ManifestEntry {
	return generatedsignature.ManifestEntry{Inputs: e.Inputs, Hash: e.Hash, Inline: e.Signature == "inline"}
}

// expectError checks an error is the vector's kind, with its reason and line when malformed.
func expectError(t *testing.T, description string, err error, expected *vectorError) {
	t.Helper()

	kinds := map[string]error{
		"malformed":             generatedsignature.ErrMalformed,
		"missing-comment-style": generatedsignature.ErrNoCommentStyle,
		"unknown-comment-style": generatedsignature.ErrUnknownCommentStyle,
		"section-id":            generatedsignature.ErrSectionID,
		"manifest":              generatedsignature.ErrManifest,
	}

	if !errors.Is(err, kinds[expected.Kind]) {
		t.Errorf("%s: got %v, expected %s", description, err, expected.Kind)

		return
	}

	var malformed *generatedsignature.MalformedError
	if errors.As(err, &malformed) &&
		(string(malformed.Reason) != expected.Reason || malformed.Line != expected.Line) {
		t.Errorf("%s: got %s at %d, expected %s at %d", description, malformed.Reason, malformed.Line,
			expected.Reason, expected.Line)
	}
}

// expectResult checks a verify result against a vector's status, reason and line.
func expectResult(t *testing.T, description string, result generatedsignature.VerifyResult, status, reason string,
	line int,
) {
	t.Helper()

	if string(result.Status) != status {
		t.Errorf("%s: got %s, expected %s", description, result.Status, status)

		return
	}

	if (result.Err == nil) != (status != "malformed") {
		t.Errorf("%s: got error %v", description, result.Err)
	} else if result.Err != nil && (string(result.Err.Reason) != reason || result.Err.Line != line) {
		t.Errorf("%s: got %s at %d, expected %s at %d", description, result.Err.Reason, result.Err.Line, reason, line)
	}
}

func TestCommentStyleVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).CommentStyles {
		got, ok := generatedsignature.StyleFor(vector.FilePath)
		if ok != (vector.Style != nil) || got != vector.Style.commentStyle() {
			t.Errorf("%s: got %v, %t", vector.FilePath, got, ok)
		}
	}
}

func TestSignVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).Sign {
		var signOptions *generatedsignature.SignOptions
		if vector.Options != nil {
			signOptions = &generatedsignature.SignOptions{
				Message:        vector.Options.Message,
				CommentOptions: vector.Options.commentOptions(),
			}
		}

		signed, err := generatedsignature.Sign(vector.Text, signOptions)

		switch {
		case vector.Error != nil:
			expectError(t, vector.Description, err, vector.Error)
		case err != nil:
			t.Errorf("%s: %v", vector.Description, err)
		case signed != *vector.Signed:
			t.Errorf("%s: got %q, expected %q", vector.Description, signed, *vector.Signed)
		default:
			if resigned, _ := generatedsignature.Sign(signed, nil); resigned != signed {
				t.Errorf("%s: signing again changed it to %q", vector.Description, resigned)
			}
		}
	}
}

func TestVerifyVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).Verify {
		expectResult(t, vector.Description, generatedsignature.Verify(vector.Text), vector.Status, vector.Reason,
			vector.Line)
	}
}

func TestSectionVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).Sections {
		sections, err := generatedsignature.ParseSections(vector.Text)
		if vector.Error != nil {
			expectError(t, vector.Description, err, vector.Error)

			continue
		}

		got := make([]section, len(sections))
		for i, parsed := range sections {
			got[i] = section{ID: parsed.ID, Body: parsed.Body, StartLine: parsed.StartLine, EndLine: parsed.EndLine}
		}

		if err != nil || !slices.Equal(got, vector.Sections) {
			t.Errorf("%s: got %v, %v, expected %v", vector.Description, got, err, vector.Sections)
		}
	}
}

func TestMergeVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).Merge {
		result, err := generatedsignature.MergeSections(vector.Generated, vector.Existing)
		if vector.Error != nil {
			expectError(t, vector.Description, err, vector.Error)

			continue
		}

		if err != nil || result.Text != vector.Result.Text || !slices.Equal(result.Orphans, vector.Result.Orphans) {
			t.Errorf("%s: got %q, %v, %v", vector.Description, result.Text, result.Orphans, err)
		}
	}
}

func TestManualSectionVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).ManualSection {
		text, err := generatedsignature.RenderManualSection(generatedsignature.ManualSectionOptions{
			ID:             vector.Options.ID,
			Body:           vector.Options.Body,
			Indent:         vector.Options.Indent,
			CommentOptions: vector.Options.commentOptions(),
		})
		if vector.Error != nil {
			expectError(t, vector.Description, err, vector.Error)
		} else if err != nil || text != *vector.Text {
			t.Errorf("%s: got %q, %v, expected %q", vector.Description, text, err, *vector.Text)
		}
	}
}

func TestContentHashVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).ContentHash {
		if got := generatedsignature.ContentHash([]byte(vector.Text)); got != vector.Hash {
			t.Errorf("%s: got %s, expected %s", vector.Description, got, vector.Hash)
		}
	}
}

func TestManifestEntryVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).ManifestEntries {
		result := generatedsignature.VerifyManifestEntry([]byte(vector.Content), vector.Entry.manifestEntry())
		expectResult(t, vector.Description, result, vector.Status, vector.Reason, vector.Line)
	}
}

func TestParseManifestVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).ParseManifest {
		manifest, err := generatedsignature.ParseManifest([]byte(vector.Text))
		if vector.Error != nil {
			expectError(t, vector.Description, err, vector.Error)

			continue
		}

		if err != nil || manifest.Version != 1 || !maps.EqualFunc(manifest.Files, vector.Files,
			func(got generatedsignature.ManifestEntry, expected entry) bool {
				// Inputs are compared by presence, as an empty and a missing map are serialized differently.
				return got.Hash == expected.Hash && got.Inline == (expected.Signature == "inline") &&
					(got.Inputs == nil) == (expected.Inputs == nil) && maps.Equal(got.Inputs, expected.Inputs)
			}) {
			t.Errorf("%s: got %v, %v", vector.Description, manifest, err)
		}
	}
}

func TestSerializeManifestVectors(t *testing.T) {
	t.Parallel()

	for _, vector := range readVectors(t).SerializeManifest {
		files := make(map[string]generatedsignature.ManifestEntry, len(vector.Files))
		for path, file := range vector.Files {
			files[path] = file.manifestEntry()
		}

		if got := generatedsignature.SerializeManifest(files); got != vector.Text {
			t.Errorf("%s: got %q, expected %q", vector.Description, got, vector.Text)
		}
	}
}

// readVectorsFile reads the shared test vectors, which every implementation reads.
func readVectorsFile(t *testing.T) []byte {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("..", "test-vectors", "data", "test-vectors.json"))
	if err != nil {
		t.Fatal(err)
	}

	return data
}
