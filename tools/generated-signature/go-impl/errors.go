package generatedsignature

import (
	"errors"
	"fmt"
)

// Errors, each matched with errors.Is.
var (
	// ErrMalformed is a signed file's token or manual sections that can't be read, as a *MalformedError.
	ErrMalformed = errors.New("malformed generated file")
	// ErrNoCommentStyle is text without a signature token, signed without a comment style or file path to add one.
	ErrNoCommentStyle = errors.New("text has no signature token, provide a comment style or file path")
	// ErrUnknownCommentStyle is a file path without a known comment syntax, as a *CommentStyleError.
	ErrUnknownCommentStyle = errors.New("no known comment syntax")
	// ErrSectionID is an invalid manual section id, as a *SectionIDError.
	ErrSectionID = errors.New("invalid manual section id")
	// ErrManifest is a manifest that can't be read.
	ErrManifest = errors.New("invalid generated-signature manifest")
)

// A MalformedReason is what makes a file malformed.
type MalformedReason string

// Reasons a file is malformed.
const (
	ReasonDuplicateSection   MalformedReason = "duplicate-section"
	ReasonDuplicateSignature MalformedReason = "duplicate-signature"
	ReasonInvalidSectionID   MalformedReason = "invalid-section-id"
	ReasonNestedSection      MalformedReason = "nested-section"
	ReasonUnclosedSection    MalformedReason = "unclosed-section"
	ReasonUnopenedSection    MalformedReason = "unopened-section"
	ReasonUnsupportedVersion MalformedReason = "unsupported-version"
)

// A MalformedError is a signature token or manual section that can't be read.
type MalformedError struct {
	Reason MalformedReason
	Detail string
	// Line is where it is, from 1.
	Line int
}

func (e *MalformedError) Error() string {
	return fmt.Sprintf("Malformed generated file (%s) at line %d: %s", e.Reason, e.Line, e.Detail)
}

// Is matches ErrMalformed.
func (*MalformedError) Is(target error) bool {
	return target == ErrMalformed
}

// A CommentStyleError is a file path without a known comment syntax.
type CommentStyleError struct {
	FilePath string
}

func (e *CommentStyleError) Error() string {
	return fmt.Sprintf("No known comment syntax for %s, pass a comment style explicitly", e.FilePath)
}

// Is matches ErrUnknownCommentStyle.
func (*CommentStyleError) Is(target error) bool {
	return target == ErrUnknownCommentStyle
}

// A SectionIDError is an invalid manual section id.
type SectionIDError struct {
	ID string
}

func (e *SectionIDError) Error() string {
	return fmt.Sprintf(`Invalid manual section id "%s", only letters, digits, "_", "." and "-" allowed`, e.ID)
}

// Is matches ErrSectionID.
func (*SectionIDError) Is(target error) bool {
	return target == ErrSectionID
}
