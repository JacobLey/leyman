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

// Store is where records live, as the spec's three operations. The postgres and valkey packages hold the spec's
// stores, and a server may bring its own: implement Store to the spec's store contract
// (https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract).
//
// In short: each operation is atomic for its identity, reads see every completed write, a record past its TTL counts
// as absent, a takeover only happens with a matching fingerprint, Complete and Release only change a record that holds
// their token, and a failure is an error, never an answer. Every lease and expiry is measured on one clock all servers
// agree on: the built-in stores use their own. A store without a clock of its own may use the servers' (time.Now),
// but then the worst drift between servers eats into the lease, so the lease must cover it as well as the slowest
// handler. Its layout is its own, so servers in other languages share it only if they implement it too.
type Store interface {
	// Claim claims the record for a request, or says what holds it: claimed when there is no record, an expired one, or
	// a running one with the same fingerprint whose lease ran out.
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
