package populatefiles

import (
	"errors"
	"fmt"
	"strings"
)

// Errors, each matched with errors.Is.
var (
	// ErrCheck is a check that found files out of date, as a *CheckError.
	ErrCheck = errors.New("files not up to date")
	// ErrOwnership is an existing file that may not be overwritten or removed without Force, as an *OwnershipError.
	ErrOwnership = errors.New("file not owned")
	// ErrDuplicateFile is the same path populated twice in one call.
	ErrDuplicateFile = errors.New("file is populated more than once")
)

// A Reason is why a file is (or would be) written or removed.
type Reason string

// Reasons a file is updated.
const (
	// ReasonContentChanged is an existing file whose content differs.
	ReasonContentChanged Reason = "content-changed"
	// ReasonFileNotExist is a file that doesn't exist yet.
	ReasonFileNotExist Reason = "file-not-exist"
	// ReasonStaleFile is a file in the target directory, or the manifest, that is no longer generated.
	ReasonStaleFile Reason = "stale-file"
)

// An OwnershipReason is why an existing file isn't owned by the generator.
type OwnershipReason string

// Reasons a file isn't owned.
const (
	// OwnershipEdited is a file edited since it was generated (outside its manual sections, when signed).
	OwnershipEdited OwnershipReason = "edited"
	// OwnershipMalformed is a signed file whose signature or manual sections can't be read.
	OwnershipMalformed OwnershipReason = "malformed"
	// OwnershipNotOwned is a file that isn't signed, or isn't listed in the manifest.
	OwnershipNotOwned OwnershipReason = "not-owned"
	// OwnershipOrphanedSection is a signed file with manual sections, not blank, that the new content doesn't have.
	OwnershipOrphanedSection OwnershipReason = "orphaned-section"
)

// An Outdated file is one a check found would be written or removed.
type Outdated struct {
	Path   string
	Reason Reason
}

// A CheckError lists the files that a check found out of date.
type CheckError struct {
	Files []Outdated
}

func (e *CheckError) Error() string {
	messages := make([]string, len(e.Files))
	for i, file := range e.Files {
		messages[i] = fmt.Sprintf("File %s not up to date. Reason: %s", file.Path, file.Reason)
	}

	return strings.Join(messages, ", ")
}

// Is matches ErrCheck.
func (*CheckError) Is(target error) bool {
	return target == ErrCheck
}

//nolint:gochecknoglobals // Never changed
var ownershipMessages = map[OwnershipReason]string{
	OwnershipEdited:          "was edited since it was generated",
	OwnershipMalformed:       "has a malformed signature or manual sections",
	OwnershipNotOwned:        "exists but is not signed, so it may not be generated",
	OwnershipOrphanedSection: "has manual sections with content that would be removed",
}

// An OwnershipError is an existing file that may not be overwritten or removed without Force.
type OwnershipError struct {
	// Err is the generatedsignature.MalformedError of a malformed file.
	Err    error
	Path   string
	Reason OwnershipReason
	// Detail says more, when there's more to say.
	Detail string
}

func (e *OwnershipError) Error() string {
	suffix := ""
	if e.Detail != "" {
		suffix = " (" + e.Detail + ")"
	}

	return fmt.Sprintf("File %s %s%s. Pass `force` to overwrite it.", e.Path, ownershipMessages[e.Reason], suffix)
}

// Is matches ErrOwnership.
func (*OwnershipError) Is(target error) bool {
	return target == ErrOwnership
}

func (e *OwnershipError) Unwrap() error {
	return e.Err
}
