// Package wire encodes what the spec's stores hold.
package wire

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
)

const maxLatin1 = 0xFF

// EncodeHeaders writes response headers as the spec stores them: a JSON array of [name, value] pairs. Each byte of a
// name or value is one character from U+0000 to U+00FF, as fetch's Headers gives them, so the TypeScript
// implementation sends a replay's headers as the bytes stored.
func EncodeHeaders(headers [][2]string) string {
	var out strings.Builder

	encoder := json.NewEncoder(&out)
	// As JavaScript's JSON.stringify writes it
	encoder.SetEscapeHTML(false)

	pairs := make([][2]string, len(headers))
	for i, header := range headers {
		pairs[i] = [2]string{latin1(header[0]), latin1(header[1])}
	}

	_ = encoder.Encode(pairs) //nolint:errchkjson // Strings always encode

	return strings.TrimSuffix(out.String(), "\n")
}

// DecodeHeaders reads headers written by EncodeHeaders, or by any implementation of the spec. The error wraps
// [idempotencykeys.ErrStoredRecord] for anything but an array of pairs of strings of characters up to U+00FF.
func DecodeHeaders(data []byte) ([][2]string, error) {
	var pairs [][]string
	if err := json.Unmarshal(data, &pairs); err != nil {
		return nil, fmt.Errorf("%w: headers %q: %w", idempotencykeys.ErrStoredRecord, data, err)
	}

	headers := make([][2]string, len(pairs))
	for index, pair := range pairs {
		if len(pair) != len(headers[index]) {
			return nil, fmt.Errorf("%w: headers %q: not a pair", idempotencykeys.ErrStoredRecord, data)
		}

		for half, text := range pair {
			value, ok := fromLatin1(text)
			if !ok {
				return nil, fmt.Errorf("%w: headers %q: a character above U+00FF", idempotencykeys.ErrStoredRecord, data)
			}

			headers[index][half] = value
		}
	}

	return headers, nil
}

func latin1(value string) string {
	runes := make([]rune, len(value))
	for i := range len(value) {
		runes[i] = rune(value[i])
	}

	return string(runes)
}

func fromLatin1(text string) (string, bool) {
	value := make([]byte, 0, utf8.RuneCountInString(text))
	for _, r := range text {
		if r > maxLatin1 {
			return "", false
		}

		value = append(value, byte(r)) //nolint:gosec // At most 0xFF, as checked
	}

	return string(value), true
}
