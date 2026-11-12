package idempotencykeys

import (
	"errors"
	"fmt"
)

var (
	// ErrKeyHeader matches every [*KeyHeaderError].
	ErrKeyHeader = errors.New("idempotency-keys: invalid Idempotency-Key header")
	// ErrOption matches every [*OptionError].
	ErrOption = errors.New("idempotency-keys: invalid option")
	// ErrStoredRecord is a record a store can't read: a reply or row that isn't what the spec stores, which only a
	// store written to by something else holds.
	ErrStoredRecord = errors.New("idempotency-keys: unreadable stored record")
	// ErrUnsendableResponse is a response [Attempt.Respond] can't store, as a replay couldn't send it: a status outside
	// 200 to 599, or a body with a 204, 205 or 304. See the spec's "Responses" section.
	ErrUnsendableResponse = errors.New("idempotency-keys: unsendable response")
)

// KeyHeaderError is an Idempotency-Key header that can't be read: more than one header, a malformed Structured Field
// String, or a key that isn't 1 to 255 characters of 0x20 to 0x7E. [Keys.Handle] answers it with a 400.
type KeyHeaderError struct {
	// Values are the header's values, as given.
	Values []string
}

func (e *KeyHeaderError) Error() string {
	return fmt.Sprintf("%v: %q", ErrKeyHeader, e.Values)
}

// Is matches [ErrKeyHeader].
func (*KeyHeaderError) Is(target error) bool {
	return target == ErrKeyHeader
}

// OptionError is an option out of range: a duration that isn't a whole number of milliseconds of at least 1 (the
// wait may be 0), a lease not below the TTL, a missing store, a Postgres name that is empty or too long, or a scope,
// operation or key that is empty or not UTF-8.
type OptionError struct {
	Value  any
	Option string
	Reason string
}

func (e *OptionError) Error() string {
	if text, ok := e.Value.(string); ok {
		return fmt.Sprintf("%v %s %q: %s", ErrOption, e.Option, text, e.Reason)
	}

	return fmt.Sprintf("%v %s %v: %s", ErrOption, e.Option, e.Value, e.Reason)
}

// Is matches [ErrOption].
func (*OptionError) Is(target error) bool {
	return target == ErrOption
}
