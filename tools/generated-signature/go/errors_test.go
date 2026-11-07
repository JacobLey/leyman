package generatedsignature_test

import (
	"errors"
	"strings"
	"testing"

	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

func TestErrorMessages(t *testing.T) {
	t.Parallel()

	_, err := generatedsignature.ParseSections("// @manual-start a\n")
	if err == nil || err.Error() != `Malformed generated file (unclosed-section) at line 1: "a" has no end` {
		t.Errorf("got %v", err)
	}

	_, err = generatedsignature.Sign("{}", &generatedsignature.SignOptions{
		Message:        nil,
		CommentOptions: generatedsignature.CommentOptions{Comment: generatedsignature.CommentStyle{Start: "", End: ""}, FilePath: "a.json"},
	})
	if err == nil || err.Error() != "No known comment syntax for a.json, pass a comment style explicitly" {
		t.Errorf("got %v", err)
	}

	_, err = generatedsignature.RenderManualSection(generatedsignature.ManualSectionOptions{
		ID:             "a b",
		Body:           "",
		Indent:         "",
		CommentOptions: generatedsignature.CommentOptions{Comment: generatedsignature.CommentStyle{Start: "", End: ""}, FilePath: "a.ts"},
	})
	if err == nil || !strings.HasPrefix(err.Error(), `Invalid manual section id "a b"`) {
		t.Errorf("got %v", err)
	}

	_, err = generatedsignature.ParseManifest([]byte(`{"version": 2, "files": {}}`))
	if err == nil || err.Error() != "invalid generated-signature manifest: unsupported version 2" {
		t.Errorf("got %v", err)
	}
}

// Options without a comment style or file path have no style to add a header in.
func TestEmptyCommentOptions(t *testing.T) {
	t.Parallel()

	_, err := generatedsignature.Sign("a\n", &generatedsignature.SignOptions{
		Message:        nil,
		CommentOptions: generatedsignature.CommentOptions{Comment: generatedsignature.CommentStyle{Start: "", End: ""}, FilePath: ""},
	})
	if !errors.Is(err, generatedsignature.ErrNoCommentStyle) {
		t.Errorf("got %v", err)
	}
}

// An entry that is Inline is checked by its signature, whatever its Hash.
func TestInlineEntryWithHash(t *testing.T) {
	t.Parallel()

	entry := generatedsignature.ManifestEntry{Inputs: nil, Hash: generatedsignature.ContentHash([]byte("a\n")), Inline: true}

	if result := generatedsignature.VerifyManifestEntry([]byte("a\n"), entry); result.Status != generatedsignature.StatusUnsigned {
		t.Errorf("got %v", result)
	}

	if text := generatedsignature.SerializeManifest(map[string]generatedsignature.ManifestEntry{"a": entry}); strings.Contains(text, "hash") {
		t.Errorf("got %s", text)
	}
}

// Invalid UTF-8 can't be written as JSON, so it is replaced.
func TestSerializeInvalidUTF8(t *testing.T) {
	t.Parallel()

	text := generatedsignature.SerializeManifest(map[string]generatedsignature.ManifestEntry{
		"a\xffb": {Inputs: nil, Hash: "h", Inline: false},
	})
	if !strings.Contains(text, "\"a\uFFFDb\"") {
		t.Errorf("got %s", text)
	}
}
