package listeners_test

import (
	"testing"

	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/listeners"
)

func TestListeners(t *testing.T) {
	t.Parallel()

	var registry listeners.Listeners

	calls := map[string]int{}
	listener := func() { calls["a"]++ }

	first := registry.Subscribe("one", listener)
	second := registry.Subscribe("one", listener)
	other := registry.Subscribe("two", func() { calls["b"]++ })

	registry.Dispatch("one")

	if calls["a"] != 2 || calls["b"] != 0 {
		t.Fatalf("got %v, want each subscription called once", calls)
	}

	first()
	// Ending a subscription twice does nothing more
	first()
	registry.Dispatch("one")

	if calls["a"] != 3 {
		t.Fatalf("got %v, want the second subscription only", calls)
	}

	second()

	// A subscription after the identity's last ended
	third := registry.Subscribe("one", listener)
	// The first subscription's set was emptied: ending it again leaves the new one
	first()
	registry.Dispatch("one")
	registry.Dispatch("three")
	other()
	registry.Dispatch("two")

	if calls["a"] != 4 || calls["b"] != 0 {
		t.Fatalf("got %v", calls)
	}

	third()
}
