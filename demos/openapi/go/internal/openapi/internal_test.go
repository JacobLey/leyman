package openapi

import (
	"errors"
	"testing"
)

func TestMustParsePanics(t *testing.T) {
	t.Parallel()

	defer func() {
		if err, ok := recover().(error); !ok || !errors.Is(err, ErrDocument) {
			t.Fatalf("recovered %v", err)
		}
	}()

	mustParse([]byte("{"))
}
