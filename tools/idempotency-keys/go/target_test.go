package idempotencykeys_test

import (
	"testing"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
)

// Bytes a JSON vector can't hold. Each expected value is Node.js's URL of the bytes decoded by its TextDecoder, the
// Encoding Standard's UTF-8 decoder.
func TestRequestTargetInvalidUTF8(t *testing.T) {
	t.Parallel()

	for raw, want := range map[string]string{
		"/\xe2\x82A":                 "/%EF%BF%BDA",
		"/\xff\xff":                  "/%EF%BF%BD%EF%BF%BD",
		"/\xf0\x90\x80":              "/%EF%BF%BD",
		"/\xe0\x80":                  "/%EF%BF%BD%EF%BF%BD",
		"/\xed\xa0\x80":              "/%EF%BF%BD%EF%BF%BD%EF%BF%BD",
		"/\xf4\x90\x80\x80":          "/%EF%BF%BD%EF%BF%BD%EF%BF%BD%EF%BF%BD",
		"/\xc0\xaf":                  "/%EF%BF%BD%EF%BF%BD",
		"/caf\xc3\xa9?\xc3":          "/caf%C3%A9?%EF%BF%BD",
		"/\xf0\x9f\x90\xa6\x80":      "/%F0%9F%90%A6%EF%BF%BD",
		"http:\\\\host\\a?b":         "/a?b",
		"https:host":                 "/",
		"/a/b/../../../%2e%2E/c/%2e": "/c/",
	} {
		if got := idempotencykeys.RequestTarget(raw); got != want {
			t.Errorf("%q: got %q, want %q", raw, got, want)
		}
	}
}
