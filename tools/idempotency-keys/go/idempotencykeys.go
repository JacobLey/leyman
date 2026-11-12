// Package idempotencykeys handles the Idempotency-Key header of HTTP writes: a request with a key runs once, across
// every server on the same store, a duplicate of a running request waits for it, and every later request with the
// key gets its response back. It follows the idempotency-keys specification, so it shares keys with the TypeScript
// implementation:
// https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md
//
// The store and the notifier are interfaces. The postgres and valkey packages hold the spec's.
package idempotencykeys

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"
	"unicode/utf8"
)

// SpecVersion is the version of the idempotency-keys spec this module implements:
// https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md
//
// It is major.minor: servers whose implementations share a major version share keys, records and notifications, and a
// minor version only adds what older ones can ignore. It is independent of the module's version.
const SpecVersion = "1.0"

// Action is how the respond policy ends an attempt.
type Action string

const (
	// ActionComplete stores the response, to replay to every later request with the key.
	ActionComplete Action = "complete"
	// ActionRelease deletes the record, so the next request with the key runs.
	ActionRelease Action = "release"
)

// RespondPolicy decides how an attempt ends, from its response.
type RespondPolicy func(response StoredResponse) Action

// DefaultRespondPolicy completes every response but a 429 (Too Many Requests), which says nothing was done. A 5xx is
// completed too: a handler that failed halfway may have written something, and running it again could write it
// twice.
func DefaultRespondPolicy(response StoredResponse) Action {
	if response.Status == http.StatusTooManyRequests {
		return ActionRelease
	}

	return ActionComplete
}

// Outcome is how [Keys.Begin] answers a request.
type Outcome string

const (
	// OutcomeRun is a request that holds the key, so it runs, and ends its attempt.
	OutcomeRun Outcome = "run"
	// OutcomeReplay is a key whose request completed, so the request gets that response.
	OutcomeReplay Outcome = "replay"
	// OutcomeConflict is a key whose request is still running, after waiting ran out: a 409.
	OutcomeConflict Outcome = "conflict"
	// OutcomeMismatch is a key used on a different request: a 422.
	OutcomeMismatch Outcome = "mismatch"
)

// BeginParams identify a request's key, and what a reused key must match.
type BeginParams struct {
	// Scope is who is calling: a user or tenant id. Not empty.
	Scope string
	// Operation is which operation the request is for, e.g. an OpenAPI operationId, or "" for none.
	Operation string
	// Key is the key, as [ParseKey] reads it.
	Key string
	// Fingerprint is the request's fingerprint, from [ComputeFingerprint].
	Fingerprint string
}

// BeginResult is how [Keys.Begin] answers a request, with the Attempt to end when it runs, and the Response when it
// replays.
type BeginResult struct {
	Attempt  *Attempt
	Response *StoredResponse
	Outcome  Outcome
}

const (
	defaultTTL   = 24 * time.Hour
	defaultLease = 60 * time.Second
	defaultWait  = 10 * time.Second

	// Polling, the fallback for a lost notification, starts at this interval and doubles up to the next.
	firstPoll = 50 * time.Millisecond
	maxPoll   = time.Second

	tokenBytes = 16
)

// Keys is Idempotency-Key handling over one store. It is safe for concurrent use.
type Keys struct {
	store              Store
	notifier           Notifier
	respondPolicy      RespondPolicy
	onError            func(err error, identity string)
	problem            ProblemWriter
	errorHandler       ErrorHandler
	fingerprintHeaders []string
	ttl                time.Duration
	lease              time.Duration
	wait               time.Duration
}

// Option configures [New].
type Option func(*Keys)

// WithNotifier wakes waiting requests when a record changes, on this server and others. Without one, they only poll.
func WithNotifier(notifier Notifier) Option {
	return func(k *Keys) { k.notifier = notifier }
}

// WithTTL is how long a key lasts from when it was claimed, a whole number of milliseconds. 24 hours by default.
func WithTTL(ttl time.Duration) Option {
	return func(k *Keys) { k.ttl = ttl }
}

// WithLease is how long a request may run before another may take over, a whole number of milliseconds below the
// TTL: longer than the slowest handler, so a slow request never runs twice. 60 seconds by default.
func WithLease(lease time.Duration) Option {
	return func(k *Keys) { k.lease = lease }
}

// WithWait is how long a request waits on a running one with its key before a conflict, a whole number of
// milliseconds. 0 answers at once. 10 seconds by default.
func WithWait(wait time.Duration) Option {
	return func(k *Keys) { k.wait = wait }
}

// WithRespondPolicy decides which responses complete and which release. [DefaultRespondPolicy] by default.
func WithRespondPolicy(policy RespondPolicy) Option {
	return func(k *Keys) { k.respondPolicy = policy }
}

// WithFingerprintHeaders names the headers that are part of a request's fingerprint in [Keys.Handle], in any case.
// None by default.
func WithFingerprintHeaders(names ...string) Option {
	return func(k *Keys) { k.fingerprintHeaders = names }
}

// WithOnError is called with a failure that doesn't fail the request, and the identity of its key. Ignored by default.
//
//   - Announcing a completed or released record failed: the attempt still ended as it did, and other servers' waiting
//     requests notice by polling.
//   - In [Keys.Handle], the store failed to complete or release a response: the caller still gets the response, and
//     the key is held until its lease runs out.
func WithOnError(onError func(err error, identity string)) Option {
	return func(k *Keys) { k.onError = onError }
}

// New is Idempotency-Key handling over a store. The error is an [*OptionError] for a nil store, a duration that isn't
// a whole number of milliseconds of at least 1 (the wait may be 0), or a lease not below the TTL.
func New(store Store, options ...Option) (*Keys, error) {
	keys := &Keys{
		store:              store,
		notifier:           nil,
		respondPolicy:      DefaultRespondPolicy,
		onError:            func(error, string) {},
		problem:            WriteProblem,
		errorHandler:       defaultErrorHandler,
		fingerprintHeaders: nil,
		ttl:                defaultTTL,
		lease:              defaultLease,
		wait:               defaultWait,
	}
	for _, option := range options {
		option(keys)
	}

	if store == nil {
		return nil, &OptionError{Value: nil, Option: "store", Reason: "must not be nil"}
	}

	for _, check := range []struct {
		name    string
		value   time.Duration
		minimum time.Duration
	}{
		{name: "ttl", value: keys.ttl, minimum: time.Millisecond},
		{name: "lease", value: keys.lease, minimum: time.Millisecond},
		{name: "wait", value: keys.wait, minimum: 0},
	} {
		// The stores take whole milliseconds, as the spec's options are
		if check.value < check.minimum || check.value%time.Millisecond != 0 {
			return nil, &OptionError{
				Value:  check.value,
				Option: check.name,
				Reason: "must be a whole number of milliseconds of at least " + check.minimum.String(),
			}
		}
	}

	if keys.lease >= keys.ttl {
		return nil, &OptionError{Value: keys.lease, Option: "lease", Reason: "must be less than the ttl"}
	}

	return keys, nil
}

// checkPart checks that a scope, operation or key is UTF-8, as the spec hashes it, and not empty.
func checkPart(option, value string) error {
	if value == "" {
		return &OptionError{Value: value, Option: option, Reason: "must not be empty"}
	}

	if !utf8.ValidString(value) {
		return &OptionError{Value: value, Option: option, Reason: "must be UTF-8"}
	}

	return nil
}

func newToken() string {
	var token [tokenBytes]byte
	// Never fails: https://pkg.go.dev/crypto/rand#Read
	_, _ = rand.Read(token[:])

	return hex.EncodeToString(token[:])
}

// Begin claims a key for a request. A request with the key that completed is replayed, and one still running is
// waited on (up to the wait). A key used on a different request is a mismatch, at once.
//
// The error is an [*OptionError] when the scope or key is empty, or the scope, operation or key isn't UTF-8; the
// store's, which fails the request rather than run it unprotected; or the context's, when it ends while waiting.
func (k *Keys) Begin(ctx context.Context, params BeginParams) (BeginResult, error) {
	identity, err := identityOf(params)
	if err != nil {
		return BeginResult{}, err
	}

	// Subscribed before the first claim, so no notification after it is missed. A notification that comes while the
	// request claims, rather than sleeps, ends its next sleep at once
	wake := make(chan struct{}, 1)

	if k.notifier != nil {
		unsubscribe := k.notifier.Subscribe(identity, func() {
			select {
			case wake <- struct{}{}:
			default:
			}
		})
		defer unsubscribe()
	}

	result, token, err := k.claim(ctx, identity, params.Fingerprint, wake)
	if err != nil {
		return BeginResult{}, err
	}

	return k.outcome(result, identity, token, params.Fingerprint), nil
}

// outcome answers a request from what its last claim found.
func (k *Keys) outcome(result ClaimResult, identity, token, fingerprint string) BeginResult {
	switch {
	case result.State == ClaimClaimed:
		return BeginResult{
			Attempt:  &Attempt{keys: k, identity: identity, token: token},
			Response: nil,
			Outcome:  OutcomeRun,
		}
	case result.State == ClaimRunning && result.Fingerprint == fingerprint:
		return BeginResult{Attempt: nil, Response: nil, Outcome: OutcomeConflict}
	case result.State == ClaimRunning || result.Fingerprint != fingerprint:
		return BeginResult{Attempt: nil, Response: nil, Outcome: OutcomeMismatch}
	default:
		return BeginResult{Attempt: nil, Response: result.Response, Outcome: OutcomeReplay}
	}
}

// identityOf checks a request's scope, operation and key, and hashes them.
func identityOf(params BeginParams) (string, error) {
	if err := checkPart("scope", params.Scope); err != nil {
		return "", err
	}

	var operation *string

	if params.Operation != "" {
		if err := checkPart("operation", params.Operation); err != nil {
			return "", err
		}

		operation = &params.Operation
	}

	if err := checkPart("key", params.Key); err != nil {
		return "", err
	}

	return ComputeIdentity(IdentityInput{Operation: operation, Scope: params.Scope, Key: params.Key}), nil
}

// claim claims the record, again and again while another request with the same fingerprint runs, until it claims,
// finds something else, or the wait runs out, and returns what it found last and the token of its last claim. A
// mismatch never waits.
func (k *Keys) claim(
	ctx context.Context,
	identity, fingerprint string,
	wake chan struct{},
) (ClaimResult, string, error) {
	deadline := time.Now().Add(k.wait)
	poll := firstPoll

	for {
		token := newToken()

		result, err := k.store.Claim(ctx, ClaimParams{
			Identity:    identity,
			Fingerprint: fingerprint,
			Token:       token,
			Lease:       k.lease,
			TTL:         k.ttl,
		})
		if err != nil {
			return ClaimResult{}, "", err //nolint:wrapcheck // A store's errors say what failed
		}

		remaining := time.Until(deadline)
		if result.State != ClaimRunning || result.Fingerprint != fingerprint || remaining <= 0 {
			return result, token, nil
		}

		if err := sleep(ctx, wake, min(poll, remaining)); err != nil {
			return ClaimResult{}, "", err
		}

		poll = min(poll<<1, maxPoll)
	}
}

// sleep waits for a notification or the duration, whichever comes first, then forgets any notification so far,
// before claiming again.
func sleep(ctx context.Context, wake chan struct{}, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return fmt.Errorf("idempotency-keys: waiting: %w", context.Cause(ctx))
	case <-wake:
	case <-timer.C:
	}

	select {
	case <-wake:
	default:
	}

	return nil
}
