package convert

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// childPointer returns the JSON Pointer to a key of what pointer points to, in its URI fragment form: `~` is escaped as
// `~0` and `/` as `~1` (RFC 6901 §3), then the segment is percent-encoded (RFC 6901 §6). So the property `a/b c` of
// `#/properties` is `#/properties/a~1b%20c`. Every pointer genever reports, or names a generated type or field with,
// is built by this, so it is also a valid `$ref` to the same value.
func childPointer(pointer, key string) string {
	return pointer + "/" + encodeSegment(strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1"))
}

// encodeSegment percent-encodes a JSON Pointer segment for a URI fragment (RFC 6901 §6,
// https://www.rfc-editor.org/rfc/rfc6901#section-6): each byte of a character outside RFC 3986's `fragment`
// (https://www.rfc-editor.org/rfc/rfc3986#section-3.5) is `%XX`, in uppercase. So `A-Z a-z 0-9 - . _ ~ ! $ & ' ( ) *
// + , ; = : @ / ?` are kept, and `%` is `%25`, a space `%20`, and `é` `%C3%A9`.
func encodeSegment(segment string) string {
	var encoded strings.Builder

	for _, char := range []byte(segment) {
		if char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' ||
			strings.IndexByte("-._~!$&'()*+,;=:@/?", char) >= 0 {
			encoded.WriteByte(char)
		} else {
			fmt.Fprintf(&encoded, "%%%02X", char)
		}
	}

	return encoded.String()
}

// indexPointer returns the JSON Pointer to an item of the array pointer points to.
func indexPointer(pointer string, index int) string {
	return pointer + "/" + strconv.Itoa(index)
}

// unescapeSegment decodes the `~0` and `~1` escapes of a JSON Pointer segment, already percent-decoded.
func unescapeSegment(segment string) string {
	return strings.ReplaceAll(strings.ReplaceAll(segment, "~1", "/"), "~0", "~")
}

// decodeSegment is the key a segment of a pointer from childPointer names.
func decodeSegment(segment string) string {
	// childPointer only writes valid percent-encoding
	decoded, _ := url.PathUnescape(segment)

	return unescapeSegment(decoded)
}

// quote wraps text in double quotes, as genever's messages name keywords, properties and references, without
// escaping.
func quote(text string) string {
	return `"` + text + `"`
}
