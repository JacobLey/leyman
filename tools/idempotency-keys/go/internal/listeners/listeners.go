// Package listeners holds the requests waiting on each identity in a process, so one subscription to a notifier's
// channel serves them all.
package listeners

import "sync"

// Listeners is safe for concurrent use. The zero value is empty and ready.
type Listeners struct {
	byIdentity map[string]map[*func()]struct{}
	mu         sync.Mutex
}

// Subscribe calls listener whenever identity is dispatched, until the returned function is called. Subscribing one
// function twice gives two subscriptions that end separately.
func (l *Listeners) Subscribe(identity string, listener func()) func() {
	entry := &listener

	l.mu.Lock()
	defer l.mu.Unlock()

	if l.byIdentity == nil {
		l.byIdentity = make(map[string]map[*func()]struct{})
	}

	set, ok := l.byIdentity[identity]
	if !ok {
		set = make(map[*func()]struct{})
		l.byIdentity[identity] = set
	}

	set[entry] = struct{}{}

	return func() {
		l.mu.Lock()
		defer l.mu.Unlock()

		delete(set, entry)
		// The identity's current set: once emptied, a later subscription made a new one
		if len(l.byIdentity[identity]) == 0 {
			delete(l.byIdentity, identity)
		}
	}
}

// Dispatch calls every listener of an identity, the message heard on a channel.
func (l *Listeners) Dispatch(identity string) {
	l.mu.Lock()

	listeners := make([]func(), 0, len(l.byIdentity[identity]))
	for entry := range l.byIdentity[identity] {
		listeners = append(listeners, *entry)
	}
	l.mu.Unlock()

	for _, listener := range listeners {
		listener()
	}
}
