package convert

import (
	"strconv"
	"strings"
)

// childPointer returns the JSON Pointer to a key of what pointer points to, escaping `~` and `/`.
func childPointer(pointer, key string) string {
	return pointer + "/" + strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1")
}

// indexPointer returns the JSON Pointer to an item of the array pointer points to.
func indexPointer(pointer string, index int) string {
	return pointer + "/" + strconv.Itoa(index)
}

// unescapeSegment decodes a JSON Pointer segment.
func unescapeSegment(segment string) string {
	return strings.ReplaceAll(strings.ReplaceAll(segment, "~1", "/"), "~0", "~")
}

// quote wraps text in double quotes, as genever's messages name keywords, properties and references, without
// escaping.
func quote(text string) string {
	return `"` + text + `"`
}
