package golang

import (
	"strconv"
	"strings"
	"unicode"
)

// Words Go writes in capitals, as golint and the standard library do: `ID`, not `Id`.
//
//nolint:gochecknoglobals // Never changed
var initialisms = map[string]bool{
	"ACL": true, "API": true, "ASCII": true, "CPU": true, "CSS": true, "DNS": true, "EOF": true, "GUID": true,
	"HTML": true, "HTTP": true, "HTTPS": true, "ID": true, "IP": true, "JSON": true, "LHS": true, "QPS": true,
	"RAM": true, "RHS": true, "RPC": true, "SLA": true, "SMTP": true, "SQL": true, "SSH": true, "TCP": true,
	"TLS": true, "TTL": true, "UDP": true, "UI": true, "UID": true, "URI": true, "URL": true, "UTF8": true,
	"UUID": true, "VM": true, "XML": true, "XMPP": true, "XSRF": true, "XSS": true,
}

// Identifier turns text into an exported Go identifier: words (split at anything not a letter or digit, and where
// camelCase changes case) capitalized and joined, and initialisms in capitals. A name that would still not start with an
// upper case letter, such as one starting with a digit, is prefixed with fallback's first letter, so it is exported. Text
// without letters or digits is fallback.
func Identifier(text, fallback string) string {
	var builder strings.Builder

	for _, word := range words(text) {
		upper := strings.ToUpper(word)
		if initialisms[upper] {
			builder.WriteString(upper)

			continue
		}

		runes := []rune(word)
		builder.WriteRune(unicode.ToUpper(runes[0]))
		builder.WriteString(string(runes[1:]))
	}

	name := builder.String()
	if name == "" {
		return fallback
	}

	if !unicode.IsUpper([]rune(name)[0]) {
		return fallback[:1] + name
	}

	return name
}

// words splits text into words at anything not a letter or digit, and before an upper case letter that follows a
// lower case one, so `goodBoy` and `good-boy` are both `good`, `Boy`.
func words(text string) []string {
	var (
		result  []string
		current []rune
	)

	previous := ' '

	for _, char := range text {
		isWordChar := unicode.IsLetter(char) || unicode.IsDigit(char)
		if !isWordChar || (unicode.IsUpper(char) && unicode.IsLower(previous)) {
			if len(current) > 0 {
				result = append(result, string(current))
			}

			current = nil
		}

		if isWordChar {
			current = append(current, char)
		}

		previous = char
	}

	if len(current) > 0 {
		result = append(result, string(current))
	}

	return result
}

// A namespace hands out unique names: a name already taken is numbered, from 2.
type namespace struct {
	used map[string]bool
}

func newNamespace(reserved ...string) *namespace {
	space := &namespace{used: map[string]bool{}}
	for _, name := range reserved {
		space.used[name] = true
	}

	return space
}

// reserve returns name, or the first of name2, name3, ... not yet taken, and takes it.
func (n *namespace) reserve(name string) string {
	unique := name
	for suffix := 2; n.used[unique]; suffix++ {
		unique = name + strconv.Itoa(suffix)
	}

	n.used[unique] = true

	return unique
}
