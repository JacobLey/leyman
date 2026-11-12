package idempotencykeys_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
)

// memoryRecord is a record as memoryStore keeps it: running while it has a token, completed once it has a status.
type memoryRecord struct {
	LeaseExpires time.Time   `json:"leaseExpires"`
	Expires      time.Time   `json:"expires"`
	Fingerprint  string      `json:"fingerprint"`
	Token        string      `json:"token"`
	Headers      [][2]string `json:"headers"`
	Body         []byte      `json:"body"`
	Status       int         `json:"status"`
}

// memoryStore is a store written to the spec's store contract, as an example of one: it keeps records in one process,
// so it serves a single server, and loses them when it exits. One mutex makes each operation atomic, each record is
// kept as JSON so nothing is shared by reference, and it uses the server's clock, as it has none of its own.
type memoryStore struct {
	records map[string][]byte
	mutex   sync.Mutex
}

func newMemoryStore() *memoryStore {
	return &memoryStore{records: map[string][]byte{}, mutex: sync.Mutex{}}
}

func (s *memoryStore) Claim(_ context.Context, params idempotencykeys.ClaimParams) (idempotencykeys.ClaimResult, error) {
	s.lock()
	defer s.mutex.Unlock()

	record, now, err := s.read(params.Identity)
	if err != nil {
		return idempotencykeys.ClaimResult{}, err
	}

	switch {
	case record != nil && record.Status != 0:
		response := &idempotencykeys.StoredResponse{Headers: record.Headers, Body: record.Body, Status: record.Status}

		return idempotencykeys.ClaimResult{Response: response, State: idempotencykeys.ClaimCompleted, Fingerprint: record.Fingerprint}, nil
	// A takeover only happens with a matching fingerprint, so a mismatch never disturbs the request holding the key
	case record != nil && (record.Fingerprint != params.Fingerprint || now.Before(record.LeaseExpires)):
		return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimRunning, Fingerprint: record.Fingerprint}, nil
	}

	s.save(params.Identity, memoryRecord{
		LeaseExpires: now.Add(params.Lease),
		Expires:      now.Add(params.TTL),
		Fingerprint:  params.Fingerprint,
		Token:        params.Token,
		Headers:      nil,
		Body:         nil,
		Status:       0,
	})

	return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}, nil
}

func (s *memoryStore) Complete(_ context.Context, identity, token string, response idempotencykeys.StoredResponse) (bool, error) {
	s.lock()
	defer s.mutex.Unlock()

	record, _, err := s.read(identity)
	if err != nil || record == nil || record.Token != token {
		return false, err
	}

	record.Token, record.Headers, record.Body, record.Status = "", response.Headers, response.Body, response.Status
	s.save(identity, *record)

	return true, nil
}

func (s *memoryStore) Release(_ context.Context, identity, token string) (bool, error) {
	s.lock()
	defer s.mutex.Unlock()

	record, _, err := s.read(identity)
	if err != nil || record == nil || record.Token != token {
		return false, err
	}

	delete(s.records, identity)

	return true, nil
}

// lock locks the store for one operation, after a few milliseconds standing in for a round trip to a real store.
func (s *memoryStore) lock() {
	time.Sleep(2 * time.Millisecond)
	s.mutex.Lock()
}

// read reads a record unless it expired, as an expired record counts as absent.
func (s *memoryStore) read(identity string) (*memoryRecord, time.Time, error) {
	now := time.Now()

	data, found := s.records[identity]
	if !found {
		return nil, now, nil
	}

	record := new(memoryRecord)
	if err := json.Unmarshal(data, record); err != nil {
		return nil, now, fmt.Errorf("%w: %w", idempotencykeys.ErrStoredRecord, err)
	}

	if !now.Before(record.Expires) {
		return nil, now, nil
	}

	return record, now, nil
}

func (s *memoryStore) save(identity string, record memoryRecord) {
	data, _ := json.Marshal(record) //nolint:errchkjson // Strings, times, bytes and an int always marshal
	s.records[identity] = data
}

// A server may bring its own store, written to the spec's store contract. This one keeps records in memory, so it only
// serves one server: a store shared by several servers keeps them where all of them reach it.
func ExampleStore() {
	keys, _ := idempotencykeys.New(newMemoryStore())
	params := idempotencykeys.BeginParams{Scope: "user_1", Operation: "createNote", Key: "k", Fingerprint: strings.Repeat("ab", 32)}

	first, _ := keys.Begin(context.Background(), params)
	result, _ := first.Attempt.Respond(context.Background(), idempotencykeys.StoredResponse{
		Headers: [][2]string{{"Content-Type", "text/plain"}},
		Body:    []byte("created"),
		Status:  http.StatusCreated,
	})
	fmt.Println(first.Outcome, result)

	retry, _ := keys.Begin(context.Background(), params)
	fmt.Println(retry.Outcome, retry.Response.Status, string(retry.Response.Body))
	// Output:
	// run stored
	// replay 201 created
}
