package postgres

import (
	"context"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5/pgconn"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/listeners"
)

// ListenConn is the connection that listens, which stays open: a *pgx.Conn fits as is, a pool doesn't, since LISTEN
// belongs to one connection.
type ListenConn interface {
	Execer
	WaitForNotification(ctx context.Context) (*pgconn.Notification, error)
}

// NotifierOptions configure [Listen].
type NotifierOptions struct {
	// OnError is called when the listening connection fails (Postgres restarted, or ended it). pgx doesn't reconnect
	// a connection that fails, so waiting requests then only poll: to get notifications again, listen on a new
	// connection. Ignored when nil.
	OnError func(err error)
	// Channel is the channel every server shares: one identifier, quoted, so case-exact, of at most 63 bytes.
	// "idempotency_keys" when empty.
	Channel string
}

// Notifier notifies through Postgres: SELECT pg_notify(<channel>, <identity>), heard with LISTEN. One listening
// connection serves every waiting request of the process. Works with either store.
type Notifier struct {
	publisher     Execer
	conn          ListenConn
	stop          context.CancelFunc
	stopped       chan struct{}
	err           error
	channel       string
	quotedChannel string
	listeners     listeners.Listeners
	closeOnce     sync.Once
}

var _ idempotencykeys.Notifier = (*Notifier)(nil)

// Listen listens on the channel, returning once Postgres confirms it. It publishes on publisher, such as the store's
// pool, and listens on conn, which only it may use until Close. It closes neither. The error is an
// [*idempotencykeys.OptionError] for a channel over 63 bytes, or the LISTEN's.
func Listen(ctx context.Context, publisher Execer, conn ListenConn, options NotifierOptions) (*Notifier, error) {
	channel := options.Channel
	if channel == "" {
		channel = defaultName
	}
	// LISTEN takes an identifier, quoted so it matches pg_notify's channel exactly, case included
	quoted, err := quoteIdentifier("channel", channel)
	if err != nil {
		return nil, err
	}

	onError := options.OnError
	if onError == nil {
		onError = func(error) {}
	}

	if _, err := conn.Exec(ctx, "LISTEN "+quoted); err != nil {
		return nil, fmt.Errorf("idempotency-keys: Postgres listen: %w", err)
	}

	listenCtx, stop := context.WithCancel(context.WithoutCancel(ctx))

	notifier := &Notifier{
		publisher:     publisher,
		conn:          conn,
		stop:          stop,
		stopped:       make(chan struct{}),
		err:           nil,
		channel:       channel,
		quotedChannel: quoted,
		listeners:     listeners.Listeners{},
		closeOnce:     sync.Once{},
	}
	go notifier.listen(listenCtx, onError)

	return notifier, nil
}

// Publish announces an identity on the channel.
func (n *Notifier) Publish(ctx context.Context, identity string) error {
	if _, err := n.publisher.Exec(ctx, "SELECT pg_notify($1, $2)", n.channel, identity); err != nil {
		return fmt.Errorf("idempotency-keys: Postgres notify: %w", err)
	}

	return nil
}

// Subscribe calls listener whenever the identity is announced, until the returned function is called.
func (n *Notifier) Subscribe(identity string, listener func()) func() {
	return n.listeners.Subscribe(identity, listener)
}

// Close stops listening, and runs UNLISTEN on the connection, which is then free for other use. Waiting requests go
// on polling. After the connection failed, it only stops dispatching. Calling it again does nothing.
func (n *Notifier) Close(ctx context.Context) error {
	var err error

	n.closeOnce.Do(func() {
		n.stop()
		<-n.stopped

		if n.err != nil {
			return
		}

		if _, unlistenErr := n.conn.Exec(ctx, "UNLISTEN "+n.quotedChannel); unlistenErr != nil {
			err = fmt.Errorf("idempotency-keys: Postgres unlisten: %w", unlistenErr)
		}
	})

	return err
}

// listen dispatches every notification on the channel until Close, or until the connection fails.
func (n *Notifier) listen(ctx context.Context, onError func(error)) {
	defer close(n.stopped)

	for {
		notification, err := n.conn.WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() == nil {
				n.err = fmt.Errorf("idempotency-keys: Postgres listen: %w", err)
				onError(n.err)
			}

			return
		}

		if notification.Channel == n.channel {
			n.listeners.Dispatch(notification.Payload)
		}
	}
}
