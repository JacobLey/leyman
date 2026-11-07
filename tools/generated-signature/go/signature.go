// Package generatedsignature signs generated files so hand edits are detected, while keeping manual sections
// editable.
//
// It is the Go implementation of the generated-signature npm package, held to the same test vectors, so a file
// signed, merged or listed in a manifest by one is read the same by the other:
// https://github.com/JacobLey/leyman/tree/main/tools/generated-signature
//
// Text is hashed as its UTF-8 bytes.
package generatedsignature

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const (
	version    = "1"
	hashLength = 32
	// tokenName is kept apart from the rest of a token so this source file never contains a full token itself.
	tokenName = "@generated-signature"
)

// DefaultMessage follows the signature token of a header that Sign adds, when SignOptions has no Message.
const DefaultMessage = "Generated file. Do not edit outside of manual sections."

//nolint:gochecknoglobals // Never changed
var (
	placeholder  = strings.Repeat("0", hashLength)
	tokenPattern = regexp.MustCompile(tokenName + ` v(\d+):([\da-f]{` + strconv.Itoa(hashLength) + `})`)
	// frontMatter is Markdown front matter, which must start the file.
	frontMatter = regexp.MustCompile(`^---\r?\n(?:[^\n]*\n)*?---\r?(?:\n|$)`)
)

func renderToken(hash string) string {
	return tokenName + " v" + version + ":" + hash
}

// SignatureToken is a token with a placeholder hash, for a generator to place in its output where it wants the
// signature, which Sign then fills in.
func SignatureToken() string {
	return renderToken(placeholder)
}

func lineOf(text string, offset int) int {
	return strings.Count(text[:offset], "\n") + 1
}

// findHash is the hash of the text's signature token, or false without one.
func findHash(text string) (string, bool, error) {
	matches := tokenPattern.FindAllStringSubmatchIndex(text, 2) //nolint:mnd // The first, and any second
	if matches == nil {
		return "", false, nil
	}

	first := matches[0]

	if len(matches) > 1 {
		return "", false, &MalformedError{
			Reason: ReasonDuplicateSignature,
			Line:   lineOf(text, matches[1][0]),
			Detail: fmt.Sprintf("signature already defined at line %d", lineOf(text, first[0])),
		}
	}

	if tokenVersion := text[first[2]:first[3]]; tokenVersion != version {
		return "", false, &MalformedError{
			Reason: ReasonUnsupportedVersion,
			Line:   lineOf(text, first[0]),
			Detail: fmt.Sprintf("v%s is not supported, expected v%s", tokenVersion, version),
		}
	}

	return text[first[4]:first[5]], true, nil
}

// computeHash hashes a text with CRLF line breaks as LF, a placeholder in its token, and its manual sections empty.
func computeHash(text string) (string, error) {
	withPlaceholder := tokenPattern.ReplaceAllLiteralString(strings.ReplaceAll(text, "\r\n", "\n"), SignatureToken())

	sections, err := scanSections(withPlaceholder)
	if err != nil {
		return "", err
	}

	hashable := replaceBodies(withPlaceholder, sections, func(scannedSection) string { return "" })
	sum := sha256.Sum256([]byte(hashable))

	return hex.EncodeToString(sum[:])[:hashLength], nil
}

// SignOptions add a header with a signature token to text that has none.
type SignOptions struct {
	CommentOptions

	// Message follows the token in the header, or DefaultMessage when nil.
	Message *string
}

// insertHeader adds a header comment with a placeholder token, on the first line the file type allows.
func insertHeader(text string, options *SignOptions) (string, error) {
	style, err := options.resolve()
	if err != nil {
		return "", err
	}

	lineBreak := "\n"
	if strings.Contains(text, "\r\n") {
		lineBreak = "\r\n"
	}

	message := DefaultMessage
	if options.Message != nil {
		message = *options.Message
	}

	header := style.render(SignatureToken()+" "+message) + lineBreak

	// A shebang or XML declaration is only valid on the first line.
	if strings.HasPrefix(text, "#!") || strings.HasPrefix(text, "<?xml") {
		firstLine, rest, found := strings.Cut(text, "\n")
		if !found {
			return text + lineBreak + header, nil
		}

		return firstLine + "\n" + header + rest, nil
	}

	// Markdown front matter must start the file too, so the line goes after its closing fence.
	if style.Start == markup.Start {
		if fenced := frontMatter.FindString(text); fenced != "" {
			if strings.HasSuffix(fenced, "\n") {
				return fenced + header + text[len(fenced):], nil
			}

			return fenced + lineBreak + header, nil
		}
	}

	return header + text, nil
}

// Sign fills in the hash of the text's signature token, or adds a header with one first when it has none, by the
// options' comment style. Signing a signed file again returns it unchanged.
//
// It fails with ErrNoCommentStyle when the text has no token and options is nil or has no comment style,
// ErrUnknownCommentStyle when the file path's type is unknown, and ErrMalformed for a malformed text.
func Sign(text string, options *SignOptions) (string, error) {
	withToken := text

	_, found, err := findHash(text)
	if err != nil {
		return "", err
	}

	if !found {
		if options == nil {
			return "", ErrNoCommentStyle
		}

		withToken, err = insertHeader(text, options)
		if err != nil {
			return "", err
		}
	}

	hash, err := computeHash(withToken)
	if err != nil {
		return "", err
	}

	return tokenPattern.ReplaceAllLiteralString(withToken, renderToken(hash)), nil
}

// A Status is the outcome of verifying a file.
type Status string

// Statuses of a verified file.
const (
	// StatusUnsigned is a file without a signature token.
	StatusUnsigned Status = "unsigned"
	// StatusInvalid is a file edited outside its manual sections since it was signed.
	StatusInvalid Status = "invalid"
	// StatusMalformed is a file whose token or manual sections can't be read.
	StatusMalformed Status = "malformed"
	// StatusValid is a file unchanged outside its manual sections since it was signed.
	StatusValid Status = "valid"
)

// A VerifyResult is the status of a file, with the error that makes it malformed.
type VerifyResult struct {
	// Err is only set when Status is StatusMalformed.
	Err    *MalformedError
	Status Status
}

// Verify checks a file's signature, ignoring its manual sections and line breaks (CRLF or LF).
func Verify(text string) VerifyResult {
	hash, found, err := findHash(strings.ReplaceAll(text, "\r\n", "\n"))
	if err == nil && !found {
		return VerifyResult{Err: nil, Status: StatusUnsigned}
	}

	if err == nil {
		var computed string

		computed, err = computeHash(text)
		if err == nil {
			if computed == hash {
				return VerifyResult{Err: nil, Status: StatusValid}
			}

			return VerifyResult{Err: nil, Status: StatusInvalid}
		}
	}

	// Reading the token and sections only fails with malformed errors.
	malformed, _ := err.(*MalformedError) //nolint:errorlint // Never wrapped

	return VerifyResult{Err: malformed, Status: StatusMalformed}
}
