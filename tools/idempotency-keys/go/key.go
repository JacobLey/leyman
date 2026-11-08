package idempotencykeys

import "strings"

const maxKeyLength = 255

// ParseKey reads the key from the values of the Idempotency-Key header, one for each time the request has it (as
// [net/http.Header.Values] gives them), or already joined. A value in quotes is a Structured Field String
// ([RFC 9651, section 3.3.3]), and the key is its content; any other value is the key as it is, and can't hold a
// comma.
//
// A repeated header's values are joined by ", " ([RFC 9110, section 5.3]), so a repeated header is never a valid key:
// an unquoted key can't hold the comma, and a string can't be followed by more.
//
// It returns "" without an error when the request has no header. The error is a [*KeyHeaderError] when the header
// holds no valid key, or is repeated: a 400.
//
// [RFC 9651, section 3.3.3]: https://www.rfc-editor.org/rfc/rfc9651#section-3.3.3
// [RFC 9110, section 5.3]: https://www.rfc-editor.org/rfc/rfc9110#section-5.3
func ParseKey(values []string) (string, error) {
	if len(values) == 0 {
		return "", nil
	}

	key, ok := readKey(strings.Join(values, ", "))
	if !ok {
		return "", &KeyHeaderError{Values: values}
	}

	return key, nil
}

func readKey(value string) (string, bool) {
	key, ok := value, !strings.Contains(value, ",")
	if strings.HasPrefix(value, `"`) {
		key, ok = parseSfString(value)
	}

	if !ok || key == "" || len(key) > maxKeyLength {
		return "", false
	}

	for _, char := range []byte(key) {
		if char < ' ' || char > '~' {
			return "", false
		}
	}

	return key, true
}

// parseSfString reads a Structured Field String that takes up the whole value, which starts with a quote.
// https://www.rfc-editor.org/rfc/rfc9651#section-4.2.5
func parseSfString(value string) (string, bool) {
	var content strings.Builder

	for index := 1; index < len(value); index++ {
		switch char := value[index]; char {
		case '"':
			return content.String(), index == len(value)-1
		case '\\':
			index++
			if index == len(value) || (value[index] != '"' && value[index] != '\\') {
				return "", false
			}

			content.WriteByte(value[index])
		default:
			content.WriteByte(char)
		}
	}

	return "", false
}
