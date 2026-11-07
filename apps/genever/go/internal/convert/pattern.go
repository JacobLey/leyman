package convert

import (
	"errors"
	"regexp/syntax"
	"slices"
	"strconv"
	"strings"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
	"github.com/JacobLey/leyman/apps/genever/go/internal/jsonv"
	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// specialCharacters have a meaning in a pattern unless escaped.
const specialCharacters = `\^$.*+?()[]{}|/`

// hexDigits is the length of a `\xHH` escape's code.
const hexDigits = 2

// ecmaOnly are the errors Go's regexp gives for ECMAScript syntax it doesn't have: lookarounds (`(?=`, `(?!`, `(?<=`,
// `(?<!`) and named groups written `(?<name>`, which it reads as a bad Perl operator, backreferences (`\1`, `\k<a>`)
// and other escapes it doesn't know, and repetition beyond its limit of 1000. Patterns with them are valid JSON
// Schema, so only patterns no dialect reads are rejected.
//
//nolint:gochecknoglobals // Never changed
var ecmaOnly = []syntax.ErrorCode{
	syntax.ErrInvalidPerlOp, syntax.ErrInvalidEscape, syntax.ErrInvalidRepeatSize, syntax.ErrInvalidNamedCapture,
}

// readPattern reads a `pattern` or `patternProperties` key, which must be a regular expression.
func readPattern(value jsonv.Value, pointer string) (string, error) {
	pattern, ok := value.(string)
	if !ok {
		return "", gerr.Invalid("pattern must be a string", pointer)
	}

	if _, err := syntax.Parse(pattern, syntax.Perl); err != nil {
		var syntaxError *syntax.Error
		if !errors.As(err, &syntaxError) || !slices.Contains(ecmaOnly, syntaxError.Code) {
			return "", gerr.Invalid("Invalid regular expression "+quote(pattern), pointer)
		}
	}

	return pattern, nil
}

// parseLiteral reads a pattern of only literal characters (and escaped special characters), or reports false.
func parseLiteral(source string) (string, bool) {
	var text strings.Builder

	for offset := 0; offset < len(source); offset++ {
		char := source[offset]

		switch {
		case char == '\\':
			rest := source[offset+1:]
			if code, ok := hexEscape(rest); ok {
				text.WriteRune(code)

				offset += 1 + hexDigits
			} else if rest != "" && strings.IndexByte(specialCharacters, rest[0]) >= 0 {
				text.WriteByte(rest[0])

				offset++
			} else {
				// Classes such as `\d`, `\w` or `\b`
				return "", false
			}
		case strings.IndexByte(specialCharacters, char) >= 0:
			return "", false
		default:
			text.WriteByte(char)
		}
	}

	return text.String(), true
}

// hexEscape reads the code of a `\xHH` escape, given what follows the backslash.
func hexEscape(rest string) (rune, bool) {
	if len(rest) < 1+hexDigits || (rest[0] != 'x' && rest[0] != 'X') {
		return 0, false
	}

	code, err := strconv.ParseUint(rest[1:1+hexDigits], 16, 8)
	if err != nil {
		return 0, false
	}

	return rune(code), true
}

// patternType is the type of the strings a pattern matches: a literal or template for a literal prefix, suffix,
// substring or whole string, and any string otherwise.
func patternType(pattern string) *model.Type {
	isStart := strings.HasPrefix(pattern, "^")
	// An escaped `\$` is a literal dollar sign, not an anchor
	isEnd := strings.HasSuffix(pattern, "$") && !strings.HasSuffix(pattern, `\$`)

	inner := pattern
	if isStart {
		inner = inner[1:]
	}

	if isEnd && inner != "" {
		inner = inner[:len(inner)-1]
	}

	text, ok := parseLiteral(inner)
	if !ok || text == "" {
		return model.StringType
	}

	if isStart && isEnd {
		return model.Literal(text)
	}

	return affixTemplate(text, isStart, isEnd)
}

// affixTemplate is the template of the strings that start with text (if isStart), end with it (if isEnd), or contain
// it (if neither).
func affixTemplate(text string, isStart, isEnd bool) *model.Type {
	var parts []model.TemplatePart

	if !isStart {
		parts = append(parts, model.TemplatePart{IsString: true, Text: ""})
	}

	parts = append(parts, model.TemplatePart{IsString: false, Text: text})

	if !isEnd {
		parts = append(parts, model.TemplatePart{IsString: true, Text: ""})
	}

	return model.Template(parts)
}
