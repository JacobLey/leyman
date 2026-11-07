package populatefiles

import (
	"bytes"
	"path/filepath"
	"strings"

	generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"
)

// byteOrderMark is dropped from an existing file's text, as JavaScript's TextDecoder drops it.
const byteOrderMark = "\xef\xbb\xbf"

// assertOwned fails unless an existing signed file verifies.
func assertOwned(path string, result generatedsignature.VerifyResult) error {
	if result.Status == generatedsignature.StatusValid {
		return nil
	}

	if result.Status == generatedsignature.StatusMalformed {
		return &OwnershipError{Err: result.Err, Path: path, Reason: OwnershipMalformed, Detail: result.Err.Error()}
	}

	if result.Status == generatedsignature.StatusInvalid {
		return &OwnershipError{Err: nil, Path: path, Reason: OwnershipEdited, Detail: "outside of manual sections"}
	}

	return &OwnershipError{Err: nil, Path: path, Reason: OwnershipNotOwned, Detail: ""}
}

// signContent signs generated text, with the manual sections of the existing file. Without force, the existing file
// must verify and keep every manual section that isn't blank; with force, an existing file whose markers can't be
// read has no edits worth keeping.
func signContent(path string, generated, existing []byte, force bool) ([]byte, error) {
	options := &generatedsignature.SignOptions{
		CommentOptions: generatedsignature.CommentOptions{
			Comment:  generatedsignature.CommentStyle{Start: "", End: ""},
			FilePath: filepath.Base(path),
		},
		Message: nil,
	}

	text := string(generated)

	if existing != nil {
		var err error

		text, err = mergeExisting(path, text, string(bytes.TrimPrefix(existing, []byte(byteOrderMark))), force)
		if err != nil {
			return nil, err
		}
	}

	signed, err := generatedsignature.Sign(text, options)
	if err != nil {
		return nil, err //nolint:wrapcheck // generatedsignature's errors name the problem
	}

	return []byte(signed), nil
}

// mergeExisting gives generated text the manual sections of an existing file, which must be owned unless forced.
func mergeExisting(path, generated, existing string, force bool) (string, error) {
	if !force {
		if err := assertOwned(path, generatedsignature.Verify(existing)); err != nil {
			return "", err
		}
	} else if _, err := generatedsignature.ParseSections(existing); err != nil {
		return generated, nil //nolint:nilerr // A forced file whose markers can't be read has no edits to keep
	}

	merged, err := generatedsignature.MergeSections(generated, existing)
	if err != nil {
		return "", err //nolint:wrapcheck // The generated text's own malformed error
	}

	if !force && len(merged.Orphans) > 0 {
		return "", &OwnershipError{
			Err:    nil,
			Path:   path,
			Reason: OwnershipOrphanedSection,
			Detail: strings.Join(merged.Orphans, ", "),
		}
	}

	return merged.Text, nil
}
