package populatefiles

import "testing"

// A path with no relative form, like one on another Windows volume, is listed as it is.
func TestRelativeToFallback(t *testing.T) {
	t.Parallel()

	if got := relativeTo("/dir", "relative"); got != "relative" {
		t.Errorf("got %s", got)
	}
}
