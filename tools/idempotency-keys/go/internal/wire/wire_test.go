package wire_test

import (
	"errors"
	"slices"
	"testing"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/wire"
)

func TestEncodeHeaders(t *testing.T) {
	t.Parallel()

	headers := [][2]string{{"content-type", "text/html"}, {"x-name", "caf\xe9 <&>"}, {"set-cookie", "a=1"}, {"set-cookie", "b=2"}}

	encoded := wire.EncodeHeaders(headers)
	// As JSON.stringify writes it, each byte one character
	if want := `[["content-type","text/html"],["x-name","café <&>"],["set-cookie","a=1"],["set-cookie","b=2"]]`; encoded != want {
		t.Fatalf("got %s, want %s", encoded, want)
	}

	decoded, err := wire.DecodeHeaders([]byte(encoded))
	if err != nil || !slices.Equal(decoded, headers) {
		t.Fatalf("got %q, %v", decoded, err)
	}

	if empty := wire.EncodeHeaders(nil); empty != "[]" {
		t.Fatalf("got %s", empty)
	}
}

func TestDecodeHeaders(t *testing.T) {
	t.Parallel()

	for name, data := range map[string]string{
		"not JSON":                 `[`,
		"not an array":             `{}`,
		"not a pair":               `[["a","b","c"]]`,
		"not strings":              `[["a",1]]`,
		"a character above U+00FF": `[["a","ā"]]`,
		"a name above U+00FF":      `[["ā","a"]]`,
		"a pair with only a name":  `[["a"]]`,
	} {
		t.Run("rejects "+name, func(t *testing.T) {
			t.Parallel()

			if _, err := wire.DecodeHeaders([]byte(data)); !errors.Is(err, idempotencykeys.ErrStoredRecord) {
				t.Fatalf("got %v", err)
			}
		})
	}
}
