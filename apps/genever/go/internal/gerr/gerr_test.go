package gerr_test

import (
	"errors"
	"io/fs"
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/gerr"
)

func TestError(t *testing.T) {
	t.Parallel()

	for kind, err := range map[error]*gerr.Error{
		gerr.ErrInvalidSchema: gerr.Invalid("bad", "#/a"),
		gerr.ErrStrictMode:    gerr.Strict("bad", "#/a"),
		gerr.ErrUnsupported:   gerr.Unsupported("bad", "#/a"),
	} {
		if !errors.Is(err, kind) || errors.Is(err, gerr.ErrLoad) || err.Error() != "bad (at #/a)" {
			t.Errorf("%v: got %v", kind, err)
		}

		if errors.Unwrap(err) != nil {
			t.Errorf("%v: has a cause", kind)
		}
	}

	loaded := &gerr.Error{Kind: gerr.ErrLoad, Cause: fs.ErrNotExist, Message: "load", Pointer: "#", ReferencedFrom: ""}
	if !errors.Is(loaded, gerr.ErrLoad) || !errors.Is(loaded, fs.ErrNotExist) {
		t.Errorf("got %v", loaded)
	}
}
