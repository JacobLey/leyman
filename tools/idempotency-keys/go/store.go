package idempotencykeys

import (
	"context"
	"time"
)

// StoredResponse is a response as stored and replayed.
type StoredResponse struct {
	// Headers are [name, value] pairs, names in lower case once stored, repeated names kept, values as the bytes sent.
	Headers [][2]string
	// Body is the raw body.
	Body []byte
	// Status is an integer from 200 to 599 once stored.
	Status int
}

// ClaimParams are what a claim writes.
type ClaimParams struct {
	// Identity is the key's identity, as 64 hex characters.
	Identity string
	// Fingerprint is the request's fingerprint, as 64 hex characters.
	Fingerprint string
	// Token is 32 hex characters, new for every claim.
	Token string
	// Lease is how long the claim holds the key, a whole number of milliseconds.
	Lease time.Duration
	// TTL is how long the key lasts, a whole number of milliseconds.
	TTL time.Duration
}

// ClaimState is what a claim found.
type ClaimState string

const (
	// ClaimClaimed is no record (or an expired one, or a running one whose lease ran out with the same fingerprint),
	// so the request holds it now.
	ClaimClaimed ClaimState = "claimed"
	// ClaimRunning is a record another request holds.
	ClaimRunning ClaimState = "running"
	// ClaimCompleted is a record holding a response.
	ClaimCompleted ClaimState = "completed"
)

// ClaimResult is what a claim found, with the record's fingerprint unless claimed, and its response when completed.
type ClaimResult struct {
	Response    *StoredResponse
	State       ClaimState
	Fingerprint string
}

// Store is where records live, as the spec's three atomic operations. Every time is the store's own clock. The
// postgres and valkey packages hold the spec's stores.
type Store interface {
	// Claim claims the record for a request, or says what holds it.
	Claim(ctx context.Context, params ClaimParams) (ClaimResult, error)
	// Complete stores the response if the record still holds the token, and says whether it did.
	Complete(ctx context.Context, identity, token string, response StoredResponse) (bool, error)
	// Release deletes the record if it still holds the token, and says whether it did.
	Release(ctx context.Context, identity, token string) (bool, error)
}

// Notifier tells other servers that an identity's record changed, so their waiting requests claim again sooner. Only
// an optimization: waiting requests poll the store regardless. The postgres and valkey packages hold the spec's
// notifiers.
type Notifier interface {
	// Publish announces that an identity's record was completed or released.
	Publish(ctx context.Context, identity string) error
	// Subscribe calls listener whenever an identity's record is announced, until the returned function is called.
	// The listener may be called from another goroutine, and must not block.
	Subscribe(identity string, listener func()) (unsubscribe func())
}
