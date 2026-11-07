package generatedsignature

import "strings"

// ParseSections lists the manual sections of a text, in order, or fails with ErrMalformed.
func ParseSections(text string) ([]ManualSection, error) {
	scanned, err := scanSections(text)
	if err != nil {
		return nil, err
	}

	sections := make([]ManualSection, len(scanned))
	for i, section := range scanned {
		sections[i] = section.ManualSection
	}

	return sections, nil
}

// A MergeResult is generated text with the bodies of an existing file's manual sections.
type MergeResult struct {
	Text string
	// Orphans are the ids of the existing file's manual sections that the generated text no longer has, and that
	// weren't blank, in order.
	Orphans []string
}

// MergeSections gives each manual section of a generated text the body of the existing file's section with the same
// id, keeping the generated body when the existing file has none. Either text being malformed fails with ErrMalformed.
func MergeSections(generated, existing string) (MergeResult, error) {
	existingSections, err := scanSections(existing)
	if err != nil {
		return MergeResult{}, err
	}

	generatedSections, err := scanSections(generated)
	if err != nil {
		return MergeResult{}, err
	}

	bodies := make(map[string]string, len(existingSections))
	for _, section := range existingSections {
		bodies[section.ID] = section.Body
	}

	text := replaceBodies(generated, generatedSections, func(section scannedSection) string {
		if body, ok := bodies[section.ID]; ok {
			return body
		}

		return section.Body
	})

	generatedIDs := make(map[string]bool, len(generatedSections))
	for _, section := range generatedSections {
		generatedIDs[section.ID] = true
	}

	orphans := []string{}

	for _, section := range existingSections {
		if !generatedIDs[section.ID] && !isBlank(section.Body) {
			orphans = append(orphans, section.ID)
		}
	}

	return MergeResult{Text: text, Orphans: orphans}, nil
}

// ManualSectionOptions describe a manual section to render.
type ManualSectionOptions struct {
	CommentOptions

	// ID is its id: letters, digits, "_", "." and "-".
	ID string
	// Body is its initial content, which may end with a line break.
	Body string
	// Indent prefixes each line that isn't blank, markers included.
	Indent string
}

// RenderManualSection renders the marker lines of a manual section around its body, without a final line break, or
// fails with ErrSectionID or a comment style error.
func RenderManualSection(options ManualSectionOptions) (string, error) {
	if !idPattern.MatchString(options.ID) {
		return "", &SectionIDError{ID: options.ID}
	}

	style, err := options.resolve()
	if err != nil {
		return "", err
	}

	lines := []string{style.render("@manual-start " + options.ID)}
	if options.Body != "" {
		lines = append(lines, strings.Split(strings.TrimSuffix(options.Body, "\n"), "\n")...)
	}

	lines = append(lines, style.render("@manual-end "+options.ID))

	for i, line := range lines {
		if !isBlank(line) {
			lines[i] = options.Indent + line
		}
	}

	return strings.Join(lines, "\n"), nil
}
