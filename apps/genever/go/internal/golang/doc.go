package golang

import (
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// docComment writes documentation as a Go comment ending in a newline, or nothing without documentation: the title,
// the description, documented keywords as `keyword: value` lines, and a `Deprecated:` paragraph, which Go tools
// recognize.
func docComment(doc *model.Doc) string {
	if doc == nil {
		return ""
	}

	var paragraphs []string

	if doc.Title != "" {
		paragraphs = append(paragraphs, doc.Title)
	}

	if doc.Description != "" {
		paragraphs = append(paragraphs, doc.Description)
	}

	if len(doc.Tags) > 0 {
		tags := make([]string, len(doc.Tags))
		for i, tag := range doc.Tags {
			tags[i] = tag.Name + ": " + tag.Text
		}

		paragraphs = append(paragraphs, strings.Join(tags, "\n"))
	}

	if doc.Deprecated {
		paragraphs = append(paragraphs, "Deprecated: the schema is deprecated.")
	}

	var comment strings.Builder

	for i, paragraph := range paragraphs {
		if i > 0 {
			comment.WriteString("//\n")
		}

		for line := range strings.SplitSeq(paragraph, "\n") {
			comment.WriteString(strings.TrimRight("// "+line, " ") + "\n")
		}
	}

	return comment.String()
}
