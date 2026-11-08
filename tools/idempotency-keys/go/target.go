package idempotencykeys

import (
	"strings"
	"unicode/utf8"
)

// RequestTarget is the request target a fingerprint hashes, from the raw target of the request line (Go's
// [net/http.Request.RequestURI]): its path, plus "?" and its query when the query isn't empty, as a WHATWG URL
// serializes them (see the spec's "Encoding" section). So "/a/../notes" is "/notes", "/café" is "/caf%C3%A9" and
// "/notes?" is "/notes", while a percent-encoding already there stays as it is.
//
// An origin-form target ("/notes") is parsed after the request's origin, as "http://host" + raw, not resolved as a
// relative URL, so "//notes" stays "//notes". An absolute-form target, whose scheme is http or https in any case
// ("http://host/notes", [RFC 9112, section 3.2.2]), is parsed alone, so it hashes as its origin-form would.
//
// It runs the steps of the [URL Standard]'s basic URL parser that apply to an http(s) URL's path and query, so it
// needs no host and never fails. Input bytes that aren't UTF-8 are read as U+FFFD, as the parser decodes its input.
//
// [RFC 9112, section 3.2.2]: https://www.rfc-editor.org/rfc/rfc9112#section-3.2.2
// [URL Standard]: https://url.spec.whatwg.org/#concept-basic-url-parser
func RequestTarget(raw string) string {
	input := removeTabsAndNewlines(raw)
	// Only the end of the input is trimmed: the origin comes before an origin-form target, so its leading C0 controls
	// and spaces fall inside the host, where they aren't trimmed. https://url.spec.whatwg.org/#concept-basic-url-parser
	input = strings.TrimRightFunc(input, isC0ControlOrSpace)
	if rest, ok := absoluteFormRest(strings.TrimLeftFunc(input, isC0ControlOrSpace)); ok {
		input = rest
	}

	// Whatever comes before the first "/", "\", "?" or "#" continues the authority (the origin's host, or an
	// absolute-form target's), which the URL Standard's authority state ends at those code points for a special URL.
	// https://url.spec.whatwg.org/#authority-state
	if end := strings.IndexAny(input, `/\?#`); end >= 0 {
		input = input[end:]
	} else {
		input = ""
	}

	path, rest := parsePath(input)

	query := ""
	if strings.HasPrefix(rest, "?") {
		query = parseQuery(rest[1:])
	}

	if query == "" {
		return path
	}

	return path + "?" + query
}

// The tab, newline and carriage return the URL Standard removes from anywhere in the input.
// https://url.spec.whatwg.org/#concept-basic-url-parser
func removeTabsAndNewlines(raw string) string {
	if !strings.ContainsAny(raw, "\t\n\r") {
		return raw
	}

	return strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return -1
		}

		return r
	}, raw)
}

// https://infra.spec.whatwg.org/#c0-control-or-space
func isC0ControlOrSpace(r rune) bool {
	return r <= ' '
}

// absoluteFormRest returns what follows an http or https scheme and the slashes after it, which the URL Standard's
// special authority states skip, any number of "/" or "\". https://url.spec.whatwg.org/#scheme-state
func absoluteFormRest(input string) (string, bool) {
	for _, scheme := range [...]string{"http:", "https:"} {
		if len(input) >= len(scheme) && strings.EqualFold(input[:len(scheme)], scheme) {
			return strings.TrimLeft(input[len(scheme):], `/\`), true
		}
	}

	return "", false
}

// parsePath runs the URL Standard's path start and path states for a special URL, from the start of the path (or the
// "?" or "#" after an empty one) to the end of the path, and returns the serialized path and the rest of the input.
// https://url.spec.whatwg.org/#path-start-state
func parsePath(input string) (string, string) {
	// The path start state consumes a leading "/" or "\"
	if strings.HasPrefix(input, "/") || strings.HasPrefix(input, `\`) {
		input = input[1:]
	}

	var segments []string

	for {
		end := strings.IndexAny(input, `/\?#`)
		if end < 0 {
			end = len(input)
		}

		buffer := percentEncode(input[:end], isPathEncoded)
		atSlash := end < len(input) && (input[end] == '/' || input[end] == '\\')

		segments = appendSegment(segments, buffer, atSlash)

		if !atSlash {
			// https://url.spec.whatwg.org/#url-path-serializer
			return "/" + strings.Join(segments, "/"), input[end:]
		}

		input = input[end+1:]
	}
}

// appendSegment ends a segment of the path state, at a "/" or "\" (atSlash), or at the end of the path.
// https://url.spec.whatwg.org/#path-state
func appendSegment(segments []string, buffer string, atSlash bool) []string {
	switch {
	case isDoubleDotSegment(buffer):
		// Shortens the path: for an http(s) URL, removes its last segment, if any
		if len(segments) > 0 {
			segments = segments[:len(segments)-1]
		}

		if !atSlash {
			segments = append(segments, "")
		}
	case isSingleDotSegment(buffer):
		if !atSlash {
			segments = append(segments, "")
		}
	default:
		segments = append(segments, buffer)
	}

	return segments
}

// parseQuery runs the URL Standard's query state for a special URL: everything up to a fragment, percent-encoded with
// the special-query percent-encode set. https://url.spec.whatwg.org/#query-state
func parseQuery(input string) string {
	if end := strings.IndexByte(input, '#'); end >= 0 {
		input = input[:end]
	}

	return percentEncode(input, isSpecialQueryEncoded)
}

// https://url.spec.whatwg.org/#single-dot-path-segment
func isSingleDotSegment(segment string) bool {
	return segment == "." || strings.EqualFold(segment, "%2e")
}

// https://url.spec.whatwg.org/#double-dot-path-segment
func isDoubleDotSegment(segment string) bool {
	switch len(segment) {
	case len(".."):
		return segment == ".."
	case len(".%2e"):
		return strings.EqualFold(segment, ".%2e") || strings.EqualFold(segment, "%2e.")
	case len("%2e%2e"):
		return strings.EqualFold(segment, "%2e%2e")
	default:
		return false
	}
}

// The query percent-encode set: the C0 control percent-encode set (C0 controls and every code point above U+007E),
// space, ", #, < and >. https://url.spec.whatwg.org/#query-percent-encode-set
func isQueryEncoded(c byte) bool {
	return c < ' ' || c > '~' || c == ' ' || c == '"' || c == '#' || c == '<' || c == '>'
}

// The special-query percent-encode set: the query percent-encode set and '.
// https://url.spec.whatwg.org/#special-query-percent-encode-set
func isSpecialQueryEncoded(c byte) bool {
	return isQueryEncoded(c) || c == '\''
}

// The path percent-encode set: the query percent-encode set and ?, ^, `, { and }.
// https://url.spec.whatwg.org/#path-percent-encode-set
func isPathEncoded(c byte) bool {
	return isQueryEncoded(c) || c == '?' || c == '^' || c == '`' || c == '{' || c == '}'
}

// percentEncode UTF-8 percent-encodes each code point in the set, as uppercase hex, and leaves a "%" as it is, so an
// existing percent-encoding is kept. https://url.spec.whatwg.org/#string-utf-8-percent-encode
func percentEncode(input string, encoded func(byte) bool) string {
	const hex = "0123456789ABCDEF"

	var out strings.Builder

	for _, r := range decodeUTF8(input) {
		var buf [utf8.UTFMax]byte
		for _, octet := range buf[:utf8.EncodeRune(buf[:], r)] {
			if encoded(octet) {
				out.WriteByte('%')
				out.WriteByte(hex[octet>>4])
				out.WriteByte(hex[octet&0x0F])
			} else {
				out.WriteByte(octet)
			}
		}
	}

	return out.String()
}

// decodeUTF8 decodes bytes as the URL parser reads its input, with the Encoding Standard's UTF-8 decoder: each
// maximal subpart of an invalid sequence is one U+FFFD. Go's own decoding gives one for every invalid byte instead,
// so "\xE2\x82A" is "\uFFFDA" here, not "\uFFFD\uFFFDA". https://encoding.spec.whatwg.org/#utf-8-decoder
//
//nolint:cyclop,funlen,mnd,varnamelen // The decoder's steps, constants and names, as the standard writes them
func decodeUTF8(input string) []rune {
	const (
		continuationMin = 0x80
		continuationMax = 0xBF
	)

	runes := make([]rune, 0, len(input))

	var codePoint rune

	needed, seen := 0, 0
	lower, upper := byte(continuationMin), byte(continuationMax)

	for i := 0; i < len(input); {
		b := input[i]
		if needed == 0 {
			i++

			switch {
			case b < utf8.RuneSelf:
				runes = append(runes, rune(b))
			case b >= 0xC2 && b <= 0xDF:
				needed, codePoint = 1, rune(b&0x1F)
			case b >= 0xE0 && b <= 0xEF:
				// Overlong encodings and surrogates
				switch b {
				case 0xE0:
					lower = 0xA0
				case 0xED:
					upper = 0x9F
				}

				needed, codePoint = 2, rune(b&0x0F)
			case b >= 0xF0 && b <= 0xF4:
				// Overlong encodings and code points above U+10FFFF
				switch b {
				case 0xF0:
					lower = 0x90
				case 0xF4:
					upper = 0x8F
				}

				needed, codePoint = 3, rune(b&0x07)
			default:
				runes = append(runes, utf8.RuneError)
			}

			continue
		}

		inRange := b >= lower && b <= upper
		lower, upper = continuationMin, continuationMax

		if !inRange {
			// The byte isn't consumed: it starts what comes next
			runes = append(runes, utf8.RuneError)
			needed, seen = 0, 0

			continue
		}

		i++
		codePoint = codePoint<<6 | rune(b&0x3F)

		seen++
		if seen == needed {
			runes = append(runes, codePoint)
			needed, seen = 0, 0
		}
	}

	if needed != 0 {
		runes = append(runes, utf8.RuneError)
	}

	return runes
}
