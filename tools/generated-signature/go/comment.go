package generatedsignature

import "strings"

// A CommentStyle is how a file type writes a comment: a line comment has no End.
type CommentStyle struct {
	Start string
	End   string
}

// CommentOptions pick the comment style of a file: Comment, or else the style for FilePath's type.
type CommentOptions struct {
	Comment  CommentStyle
	FilePath string
}

//nolint:gochecknoglobals // Never changed
var (
	slashes = CommentStyle{Start: "//", End: ""}
	hash    = CommentStyle{Start: "#", End: ""}
	block   = CommentStyle{Start: "/*", End: "*/"}
	markup  = CommentStyle{Start: "<!--", End: "-->"}
	dashes  = CommentStyle{Start: "--", End: ""}
)

//nolint:gochecknoglobals // Never changed
var byExtension = func() map[string]CommentStyle {
	styles := map[string]CommentStyle{".css": block}

	for style, extensions := range map[CommentStyle][]string{
		slashes: {
			".c", ".cc", ".cjs", ".cpp", ".cs", ".cts", ".go", ".h", ".hpp", ".java", ".js", ".json5", ".jsonc",
			".jsx", ".kt", ".less", ".mjs", ".mts", ".rs", ".scss", ".swift", ".ts", ".tsx",
		},
		hash: {
			".bash", ".cfg", ".conf", ".env", ".ini", ".pl", ".properties", ".py", ".r", ".rb", ".sh", ".toml",
			".yaml", ".yml", ".zsh",
		},
		markup: {".htm", ".html", ".md", ".mdx", ".svg", ".vue", ".xml"},
		dashes: {".hs", ".lua", ".sql"},
	} {
		for _, extension := range extensions {
			styles[extension] = style
		}
	}

	return styles
}()

// byFileName is matched on the whole file name, since these conventionally have no extension.
//
//nolint:gochecknoglobals // Never changed
var byFileName = map[string]CommentStyle{
	".gitattributes": hash,
	".gitignore":     hash,
	".npmignore":     hash,
	"Dockerfile":     hash,
	"Makefile":       hash,
}

// lowerExtension lowercases as JavaScript does, where İ becomes two characters rather than an "i".
//
//nolint:gochecknoglobals // Never changed
var lowerExtension = strings.NewReplacer("İ", "i̇")

// StyleFor is the comment style of a file path, by its file name or extension (case-insensitively), or false when
// the file type is unknown or has no comments, like JSON. Paths are separated by "/".
func StyleFor(filePath string) (CommentStyle, bool) {
	base := baseName(filePath)

	if style, ok := byFileName[base]; ok {
		return style, true
	}

	if style, ok := byExtension[strings.ToLower(lowerExtension.Replace(extension(base)))]; ok {
		return style, true
	}

	// E.g. `Dockerfile.dev`
	prefix, _, _ := strings.Cut(base, ".")
	style, ok := byFileName[prefix]

	return style, ok
}

// baseName is the last segment of a path, ignoring trailing separators.
func baseName(filePath string) string {
	trimmed := strings.TrimRight(filePath, "/")

	return trimmed[strings.LastIndex(trimmed, "/")+1:]
}

// extension is a file name's extension from its last ".", as Node.js reads one: a name starting with its only "."
// (like `.env`) and ".." have none.
func extension(base string) string {
	dot := strings.LastIndex(base, ".")
	if dot <= 0 || base == ".." {
		return ""
	}

	return base[dot:]
}

// resolve is the comment style the options pick.
func (options CommentOptions) resolve() (CommentStyle, error) {
	if options.Comment.Start != "" {
		return options.Comment, nil
	}

	if options.FilePath == "" {
		return CommentStyle{}, ErrNoCommentStyle
	}

	style, ok := StyleFor(options.FilePath)
	if !ok {
		return CommentStyle{}, &CommentStyleError{FilePath: options.FilePath}
	}

	return style, nil
}

// render writes text as a comment.
func (style CommentStyle) render(text string) string {
	if style.End == "" {
		return style.Start + " " + text
	}

	return style.Start + " " + text + " " + style.End
}
