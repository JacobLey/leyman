package generatedsignature

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
)

// jsSpace is the whitespace of JavaScript's `\s` and `String.prototype.trim()`, which the file format is defined by:
// Go's `\s` is only ASCII, and unicode.IsSpace also has U+0085 but not U+FEFF.
const jsSpace = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// markerPattern is a manual section marker, preceded by whitespace (or the line start) so e.g. `foo@manual-start` in
// a URL is not a marker.
var markerPattern = regexp.MustCompile(`(?:^|[` + jsSpace + `])@manual-(end|start)\b(?:[` + jsSpace + `]+([^` +
	jsSpace + `]+))?`)

var (
	idPattern    = regexp.MustCompile(`^[\w\-.]+$`)
	blankPattern = regexp.MustCompile(`^[` + jsSpace + `]*$`)
)

// isBlank reports whether text is only whitespace, as JavaScript trims it.
func isBlank(text string) bool {
	return blankPattern.MatchString(text)
}

// A ManualSection is a region of a generated file that people may edit.
type ManualSection struct {
	ID string
	// Body is the text between the marker lines, with its line breaks.
	Body string
	// StartLine and EndLine are the lines of its markers, from 1.
	StartLine int
	EndLine   int
}

// scannedSection is a manual section with the byte offsets of its body.
type scannedSection struct {
	ManualSection

	bodyStart int
	bodyEnd   int
}

// openSection is a manual section whose end marker is still to come.
type openSection struct {
	id        string
	line      int
	bodyStart int
}

// scanner reads the manual sections of a text, a line at a time.
type scanner struct {
	open     *openSection
	text     string
	sections []scannedSection
}

// scanSections finds the manual sections of a text, in order. Each line has at most one marker, its first.
func scanSections(text string) ([]scannedSection, error) {
	state := scanner{open: nil, text: text, sections: nil}
	lineNumber := 0

	for lineStart := 0; lineStart < len(text); {
		lineNumber++

		lineEnd := len(text)
		if newline := strings.IndexByte(text[lineStart:], '\n'); newline != -1 {
			lineEnd = lineStart + newline + 1
		}

		if match := markerPattern.FindStringSubmatch(text[lineStart:lineEnd]); match != nil {
			if err := state.marker(match[1] == "start", match[2], lineNumber, lineStart, lineEnd); err != nil {
				return nil, err
			}
		}

		lineStart = lineEnd
	}

	if state.open != nil {
		return nil, &MalformedError{
			Reason: ReasonUnclosedSection,
			Line:   state.open.line,
			Detail: fmt.Sprintf(`"%s" has no end`, state.open.id),
		}
	}

	return state.sections, nil
}

// marker opens or closes a section at the marker of a line.
func (state *scanner) marker(start bool, sectionID string, line, lineStart, lineEnd int) error {
	if !idPattern.MatchString(sectionID) {
		return &MalformedError{
			Reason: ReasonInvalidSectionID,
			Line:   line,
			Detail: fmt.Sprintf(`"%s" must match /^[\w\-.]+$/v`, sectionID),
		}
	}

	open := state.open

	if start {
		if open != nil {
			return &MalformedError{
				Reason: ReasonNestedSection,
				Line:   line,
				Detail: fmt.Sprintf(`"%s" starts inside "%s"`, sectionID, open.id),
			}
		}

		if slices.ContainsFunc(state.sections, func(section scannedSection) bool { return section.ID == sectionID }) {
			return &MalformedError{
				Reason: ReasonDuplicateSection,
				Line:   line,
				Detail: fmt.Sprintf(`"%s" is already defined`, sectionID),
			}
		}

		state.open = &openSection{id: sectionID, line: line, bodyStart: lineEnd}

		return nil
	}

	if open == nil || open.id != sectionID {
		detail := fmt.Sprintf(`"%s" ends without a start`, sectionID)
		if open != nil {
			detail = fmt.Sprintf(`"%s" ends while "%s" is open`, sectionID, open.id)
		}

		return &MalformedError{Reason: ReasonUnopenedSection, Line: line, Detail: detail}
	}

	state.sections = append(state.sections, scannedSection{
		ManualSection: ManualSection{
			ID:        sectionID,
			Body:      state.text[open.bodyStart:lineStart],
			StartLine: open.line,
			EndLine:   line,
		},
		bodyStart: open.bodyStart,
		bodyEnd:   lineStart,
	})
	state.open = nil

	return nil
}

// replaceBodies replaces the body of each section of a text.
func replaceBodies(text string, sections []scannedSection, body func(section scannedSection) string) string {
	var result strings.Builder

	last := 0

	for _, section := range sections {
		result.WriteString(text[last:section.bodyStart])
		result.WriteString(body(section))

		last = section.bodyEnd
	}

	result.WriteString(text[last:])

	return result.String()
}
