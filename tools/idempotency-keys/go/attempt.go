package idempotencykeys

import (
	"context"
	"net/http"
	"strings"
)

// RespondResult is how [Attempt.Respond] ended an attempt.
type RespondResult string

const (
	// RespondStored is a response stored by the policy, to replay to every later request with the key.
	RespondStored RespondResult = "stored"
	// RespondReleased is a record released by the policy, so the next request with the key runs.
	RespondReleased RespondResult = "released"
	// RespondLost is an attempt whose lease ran out and was taken over, so nothing changed.
	RespondLost RespondResult = "lost"
	// RespondRefused is a response a replay couldn't send (a status outside 200 to 599, or a body with a 204, 205 or
	// 304): the store isn't touched, and the attempt still holds the key, to respond again or release.
	RespondRefused RespondResult = "refused"
)

const (
	minStatus = 200
	maxStatus = 599
)

// isUnstoredHeader is whether a header is one a server recomputes for every response it sends, which would be wrong
// on a replay, or the replay marker, which only the replay adds. See the spec's "Stores" section.
func isUnstoredHeader(name string) bool {
	switch name {
	case "connection", "content-length", "idempotent-replayed", "keep-alive", "transfer-encoding":
		return true
	default:
		return false
	}
}

// isSendable is whether a replay could send a response, as fetch's Response would build it: a status from 200 to 599,
// and no body with a null-body status. https://fetch.spec.whatwg.org/#null-body-status
func isSendable(response StoredResponse) bool {
	if response.Status < minStatus || response.Status > maxStatus {
		return false
	}

	switch response.Status {
	case http.StatusNoContent, http.StatusResetContent, http.StatusNotModified:
		return len(response.Body) == 0
	default:
		return true
	}
}

// Attempt is a request that holds its key, and runs. End it with [Attempt.Respond] or [Attempt.Release]. One that
// never ends (it crashed) holds the key until its lease runs out. The store only changes the record while it still
// holds the attempt's token.
type Attempt struct {
	keys     *Keys
	identity string
	token    string
}

// Identity is the key's identity, as 64 hex characters.
func (a *Attempt) Identity() string {
	return a.identity
}

// Respond ends the attempt with its response, by the respond policy. Header names are stored in lower case, without
// the headers a server recomputes for each response it sends (Content-Length, Transfer-Encoding, Connection,
// Keep-Alive) or any Idempotent-Replayed.
//
// It returns [RespondStored] or [RespondReleased] by the policy, [RespondLost] when the lease ran out and another
// request took over, or [RespondRefused] for a response a replay couldn't send. An error is the store's: the attempt
// is left to its lease.
func (a *Attempt) Respond(ctx context.Context, response StoredResponse) (RespondResult, error) {
	if !isSendable(response) {
		return RespondRefused, nil
	}

	if a.keys.respondPolicy(response) == ActionRelease {
		released, err := a.Release(ctx)
		if err != nil {
			return "", err
		}

		if !released {
			return RespondLost, nil
		}

		return RespondReleased, nil
	}

	headers := make([][2]string, 0, len(response.Headers))
	for _, header := range response.Headers {
		name := strings.ToLower(header[0])
		if !isUnstoredHeader(name) {
			headers = append(headers, [2]string{name, header[1]})
		}
	}

	body := response.Body
	if body == nil {
		body = []byte{}
	}

	stored, err := a.keys.store.Complete(ctx, a.identity, a.token, StoredResponse{
		Headers: headers,
		Body:    body,
		Status:  response.Status,
	})
	if err != nil {
		return "", err //nolint:wrapcheck // A store's errors say what failed
	}

	a.announce(ctx, stored)

	if !stored {
		return RespondLost, nil
	}

	return RespondStored, nil
}

// Release releases the key, whatever the response, so the next request with it runs. It returns whether it
// released, false when another request took over.
func (a *Attempt) Release(ctx context.Context) (bool, error) {
	released, err := a.keys.store.Release(ctx, a.identity, a.token)
	if err != nil {
		return false, err //nolint:wrapcheck // A store's errors say what failed
	}

	a.announce(ctx, released)

	return released, nil
}

// announce tells other waiting requests that the record changed. Only an optimization, so a failure goes to the error
// hook rather than failing the attempt, whose record already changed.
func (a *Attempt) announce(ctx context.Context, changed bool) {
	if !changed || a.keys.notifier == nil {
		return
	}

	if err := a.keys.notifier.Publish(ctx, a.identity); err != nil {
		a.keys.onError(err, a.identity)
	}
}
