package valkey_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/valkey-io/valkey-go"

	valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"
)

// trackedClient keeps the id of each connection it dedicates, to close it from outside.
type trackedClient struct {
	valkey.Client

	ids chan int64
}

func (c trackedClient) Dedicate() (valkey.DedicatedClient, func()) { //nolint:ireturn // As the interface it implements
	dedicated, cancel := c.Client.Dedicate()

	id, _ := dedicated.Do(context.Background(), dedicated.B().ClientId().Build()).AsInt64()
	c.ids <- id

	return dedicated, cancel
}

func TestNotifierWakesTheListenersOfAnIdentityItHears(t *testing.T) {
	t.Parallel()

	notifier, err := valkeystore.Listen(t.Context(), client, valkeystore.NotifierOptions{
		OnError: func(err error) { t.Error(err) },
		Channel: uniqueName("idempotency_keys_"),
	})
	if err != nil {
		t.Fatal(err)
	}

	identity := uniqueName("identity_")
	woken := make(chan struct{}, 1)
	unsubscribe := notifier.Subscribe(identity, func() { woken <- struct{}{} })

	if err := notifier.Publish(t.Context(), identity); err != nil {
		t.Fatal(err)
	}

	select {
	case <-woken:
	case <-time.After(5 * time.Second):
		t.Fatal("not woken")
	}

	unsubscribe()
	notifier.Close()
	// Closing again does nothing
	notifier.Close()
}

func TestNotifierListensOnTheDefaultChannel(t *testing.T) {
	t.Parallel()

	notifier, err := valkeystore.Listen(t.Context(), client, valkeystore.NotifierOptions{OnError: nil, Channel: ""})
	if err != nil {
		t.Fatal(err)
	}

	defer notifier.Close()

	identity := uniqueName("identity_")
	woken := make(chan struct{}, 1)

	defer notifier.Subscribe(identity, func() { woken <- struct{}{} })()

	if err := client.Do(t.Context(), client.B().Publish().Channel("idempotency_keys").Message(identity).Build()).Error(); err != nil {
		t.Fatal(err)
	}

	select {
	case <-woken:
	case <-time.After(5 * time.Second):
		t.Fatal("not woken")
	}
}

func TestNotifierReportsADroppedConnection(t *testing.T) {
	t.Parallel()

	tracked := trackedClient{Client: client, ids: make(chan int64, 1)}
	failures := make(chan error, 1)

	notifier, err := valkeystore.Listen(t.Context(), tracked, valkeystore.NotifierOptions{
		OnError: func(err error) { failures <- err },
		Channel: uniqueName("idempotency_keys_"),
	})
	if err != nil {
		t.Fatal(err)
	}

	defer notifier.Close()

	id := <-tracked.ids
	if err := client.Do(t.Context(), client.B().ClientKill().Id(id).Build()).Error(); err != nil {
		t.Fatal(err)
	}

	select {
	case err := <-failures:
		if !strings.Contains(err.Error(), "Valkey subscription") {
			t.Fatalf("got %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("not reported")
	}
}

func TestNotifierFailsWhenItCantSubscribe(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	if _, err := valkeystore.Listen(ctx, client, valkeystore.NotifierOptions{OnError: nil, Channel: ""}); !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
}

func TestNotifierFailsToPublishWhenValkeyDoes(t *testing.T) {
	t.Parallel()

	notifier, err := valkeystore.Listen(t.Context(), failingClient{Client: client}, valkeystore.NotifierOptions{OnError: nil, Channel: ""})
	if err != nil {
		t.Fatal(err)
	}

	defer notifier.Close()

	if err := notifier.Publish(t.Context(), "identity"); !errors.Is(err, errDown) {
		t.Fatalf("got %v", err)
	}
}
