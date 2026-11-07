package convert

import (
	"testing"

	"github.com/JacobLey/leyman/apps/genever/go/internal/model"
)

// A trailing backslash never reaches patternType through a schema, as no dialect reads it as a pattern.
func TestPatternTrailingBackslash(t *testing.T) {
	t.Parallel()

	if got := patternType(`^a\`); got != model.StringType {
		t.Errorf("got %s", got.Key())
	}
}
