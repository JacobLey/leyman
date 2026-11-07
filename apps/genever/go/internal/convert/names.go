package convert

import (
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// toTypeName makes a name a Go type name: words of letters, digits and underscores, each capitalized and joined. A
// name that would not start with an upper case letter, so not be exported, is prefixed with `T`, and a name with no
// words is `Type`.
func toTypeName(name string) string {
	words := strings.FieldsFunc(name, func(char rune) bool {
		return !unicode.IsLetter(char) && !unicode.IsDigit(char) && char != '_'
	})

	var builder strings.Builder

	for _, word := range words {
		first, size := utf8.DecodeRuneInString(word)
		builder.WriteRune(unicode.ToUpper(first))
		builder.WriteString(word[size:])
	}

	joined := builder.String()
	if joined == "" {
		return "Type"
	}

	if first, _ := utf8.DecodeRuneInString(joined); !unicode.IsUpper(first) {
		return "T" + joined
	}

	return joined
}

// typeNames hands out unique type names.
type typeNames struct {
	used map[string]bool
}

// newTypeNames reserves the names of the helper types generated code may declare.
func newTypeNames() *typeNames {
	return &typeNames{used: map[string]bool{"Nullable": true, "Optional": true}}
}

// reserve returns a unique type name for a name, numbered from 2 if it is taken.
func (n *typeNames) reserve(name string) string {
	base := toTypeName(name)
	unique := base

	for suffix := 2; n.used[unique]; suffix++ {
		unique = base + strconv.Itoa(suffix)
	}

	n.used[unique] = true

	return unique
}
