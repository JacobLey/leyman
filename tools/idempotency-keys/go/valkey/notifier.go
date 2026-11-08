package valkey

import (
	"context"
	"fmt"
	"sync"

	"github.com/valkey-io/valkey-go"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/listeners"
)

// NotifierClient is what the notifier needs from a valkey-go client: a [valkey.Client] fits as is. It publishes on
// the client, and subscribes on a connection of its own, from Dedicate, as subscribing takes a connection over.
type NotifierClient interface {
	Client
	Dedicate() (client valkey.DedicatedClient, cancel func())
}

// NotifierOptions configure [Listen].
type NotifierOptions struct {
	// OnError is called when the subscribed connection fails (Valkey restarted, or closed it). Waiting requests then
	// only poll: to get notifications again, listen again. Ignored when nil.
	OnError func(err error)
	// Channel is the channel every server shares. "idempotency_keys" when empty.
	Channel string
}

// Notifier notifies through Valkey (or Redis) pub/sub: PUBLISH <channel> <identity>. One subscription serves every
// waiting request of the process. Works with either store.
type Notifier struct {
	client    NotifierClient
	dedicated valkey.DedicatedClient
	cancel    func()
	done      chan struct{}
	channel   string
	listeners listeners.Listeners
	closeOnce sync.Once
}

var _ idempotencykeys.Notifier = (*Notifier)(nil)

// Listen subscribes to the channel, returning once Valkey confirms it. Close the notifier to give its connection
// back.
func Listen(ctx context.Context, client NotifierClient, options NotifierOptions) (*Notifier, error) {
	channel := options.Channel
	if channel == "" {
		channel = defaultName
	}

	onError := options.OnError
	if onError == nil {
		onError = func(error) {}
	}

	dedicated, cancel := client.Dedicate()
	notifier := &Notifier{
		client:    client,
		dedicated: dedicated,
		cancel:    cancel,
		done:      make(chan struct{}),
		channel:   channel,
		listeners: listeners.Listeners{},
		closeOnce: sync.Once{},
	}

	failed := dedicated.SetPubSubHooks(valkey.PubSubHooks{
		// The connection is subscribed to the one channel
		OnMessage: func(message valkey.PubSubMessage) {
			notifier.listeners.Dispatch(message.Message)
		},
		OnSubscription: nil,
	})
	go func() {
		// Holds at most one error, why the hooks stopped, and closes either way
		for err := range failed {
			select {
			case <-notifier.done:
			default:
				onError(fmt.Errorf("idempotency-keys: Valkey subscription: %w", err))
			}
		}
	}()

	if err := dedicated.Do(ctx, dedicated.B().Subscribe().Channel(channel).Build()).Error(); err != nil {
		notifier.Close()

		return nil, fmt.Errorf("idempotency-keys: Valkey subscribe: %w", err)
	}

	return notifier, nil
}

// Publish announces an identity on the channel.
func (n *Notifier) Publish(ctx context.Context, identity string) error {
	if err := n.client.Do(ctx, n.client.B().Publish().Channel(n.channel).Message(identity).Build()).Error(); err != nil {
		return fmt.Errorf("idempotency-keys: Valkey publish: %w", err)
	}

	return nil
}

// Subscribe calls listener whenever the identity is announced, until the returned function is called.
func (n *Notifier) Subscribe(identity string, listener func()) func() {
	return n.listeners.Subscribe(identity, listener)
}

// Close stops listening, and gives the subscribed connection back to the client. Waiting requests go on polling.
func (n *Notifier) Close() {
	n.closeOnce.Do(func() {
		close(n.done)
		n.cancel()
	})
}
