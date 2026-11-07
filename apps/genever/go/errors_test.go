package genever_test

import (
	"encoding/json"
	"errors"
	"testing"

	genever "github.com/JacobLey/leyman/apps/genever/go"
	"github.com/JacobLey/leyman/apps/genever/vectors"
)

type errorCase struct {
	Schema  json.RawMessage `json:"schema"`
	Options struct {
		OpenAPI30 bool  `json:"openApi30"`
		Strict    *bool `json:"strict"`
	} `json:"options"`
	Pointer string `json:"pointer"`
}

func (c errorCase) options(strict bool) genever.Options {
	return genever.Options{Name: "", Package: "", BaseURI: "", OpenAPI30: c.Options.OpenAPI30, NoStrict: !strict}
}

// Every implementation rejects the vectors' error cases with the same kind of error, at the same pointer.
func TestErrorVectors(t *testing.T) {
	t.Parallel()

	var cases map[string]map[string]errorCase
	if err := json.Unmarshal(vectors.Errors, &cases); err != nil {
		t.Fatal(err)
	}

	kinds := map[string]error{
		"invalid": genever.ErrInvalidSchema, "strict": genever.ErrStrictMode, "unsupported": genever.ErrUnsupported,
	}
	if len(cases) != len(kinds) {
		t.Fatalf("got kinds %v", cases)
	}

	for kind, byName := range cases {
		for name, item := range byName {
			t.Run(kind+"/"+name, func(t *testing.T) {
				t.Parallel()

				expectRejected(t, item, kinds[kind], kind == "strict")
			})
		}
	}
}

// expectRejected expects the case's error, and with strict mode off, a strict mode case to be accepted.
func expectRejected(t *testing.T, item errorCase, kind error, isStrictMode bool) {
	t.Helper()

	strict := item.Options.Strict == nil || *item.Options.Strict

	_, err := genever.Generate(item.Schema, item.options(strict))

	var geneverErr *genever.Error
	if !errors.Is(err, kind) || !errors.As(err, &geneverErr) || geneverErr.Pointer != item.Pointer {
		t.Fatalf("got %v, expected %s at %s", err, kind, item.Pointer)
	}

	if isStrictMode {
		if _, err := genever.Generate(item.Schema, item.options(false)); err != nil {
			t.Errorf("rejected with strict mode off: %v", err)
		}
	}
}
