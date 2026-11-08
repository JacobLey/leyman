package valkey_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/valkey-io/valkey-go"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	valkeystore "github.com/JacobLey/leyman/tools/idempotency-keys/go/valkey"
)

var errDown = errors.New("valkey is down")

const (
	fingerprint = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"
	identity    = "1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a"
	other       = "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f"
)

// client is shared by the package's tests, which TestMain opens and closes.
var client valkey.Client //nolint:gochecknoglobals // TestMain owns it, for every test of the package

func TestMain(m *testing.M) {
	var err error

	// The devcontainer runs Valkey as a sidecar under this name, and Dagger binds it under the same one
	client, err = valkey.NewClient(valkey.ClientOption{ //nolint:exhaustruct_v5 // Options left out are the defaults
		InitAddress: []string{"valkey:6379"},
		SelectDB:    6,
	})
	if err != nil {
		panic(err)
	}

	code := m.Run()

	client.Close()
	os.Exit(code)
}

func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + hex.EncodeToString(id[:])
}

func newTestStore() *valkeystore.Store {
	return newStore(client)
}

func newStore(client valkeystore.Client) *valkeystore.Store {
	return valkeystore.NewStore(client, valkeystore.StoreOptions{Prefix: uniqueName("idempotency-keys-test:")})
}

func claimParams(fingerprint, token string, lease time.Duration) idempotencykeys.ClaimParams {
	return idempotencykeys.ClaimParams{Identity: identity, Fingerprint: fingerprint, Token: token, Lease: lease, TTL: time.Hour}
}

func claimed() idempotencykeys.ClaimResult {
	return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}
}

func expectClaim(t *testing.T, store *valkeystore.Store, params idempotencykeys.ClaimParams, want idempotencykeys.ClaimResult) {
	t.Helper()

	if got := claim(t, store, params); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

// expectChanged checks the result of a complete or release.
func expectChanged(t *testing.T, what string, want bool) func(changed bool, err error) {
	t.Helper()

	return func(changed bool, err error) {
		t.Helper()

		if err != nil || changed != want {
			t.Fatalf("%s: got %v, %v; want %v", what, changed, err, want)
		}
	}
}

func claim(t *testing.T, store *valkeystore.Store, params idempotencykeys.ClaimParams) idempotencykeys.ClaimResult {
	t.Helper()

	result, err := store.Claim(t.Context(), params)
	if err != nil {
		t.Fatal(err)
	}

	return result
}

// replyClient runs a script of its own instead of each command, to get a reply the store's scripts never give.
type replyClient struct {
	valkey.Client

	script string
}

func (c replyClient) Do(ctx context.Context, _ valkey.Completed) valkey.ValkeyResult {
	return c.Client.Do(ctx, c.B().Eval().Script(c.script).Numkeys(0).Build())
}

// failingClient fails every command.
type failingClient struct {
	valkey.Client
}

func (failingClient) Do(context.Context, valkey.Completed) valkey.ValkeyResult {
	return valkey.NewErrorResult(errDown)
}

func TestStoreRejectsReplies(t *testing.T) {
	t.Parallel()

	for name, script := range map[string]string{
		"not an array":         "return 5",
		"not strings":          "return {1}",
		"an unknown state":     "return {'unknown'}",
		"a status not decimal": "return {'completed', 'f', 'abc', '[]', 'b'}",
		"headers not pairs":    "return {'completed', 'f', '200', '{', 'b'}",
		"too few for running":  "return {'running'}",
	} {
		t.Run("rejects a claim reply of "+name, func(t *testing.T) {
			t.Parallel()

			_, err := newStore(replyClient{Client: client, script: script}).Claim(
				t.Context(), claimParams(fingerprint, "t1", time.Minute),
			)
			if !errors.Is(err, idempotencykeys.ErrStoredRecord) {
				t.Fatalf("got %v", err)
			}
		})
	}

	for name, script := range map[string]string{"not a number": "return 'x'", "a number but 0 or 1": "return 2"} {
		t.Run("rejects a complete or release reply of "+name, func(t *testing.T) {
			t.Parallel()

			store := newStore(replyClient{Client: client, script: script})

			_, completeErr := store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200})
			_, releaseErr := store.Release(t.Context(), identity, "t1")

			for _, err := range []error{completeErr, releaseErr} {
				if !errors.Is(err, idempotencykeys.ErrStoredRecord) {
					t.Fatalf("got %v", err)
				}
			}
		})
	}
}

func TestStoreClaimsRunsAndCompletesARecord(t *testing.T) {
	t.Parallel()

	store := newTestStore()
	running := idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimRunning, Fingerprint: fingerprint}

	expectClaim(t, store, claimParams(fingerprint, "t1", time.Minute), claimed())
	expectClaim(t, store, claimParams(fingerprint, "t2", time.Minute), running)
	expectClaim(t, store, claimParams(other, "t2", time.Minute), running)

	response := idempotencykeys.StoredResponse{
		Headers: [][2]string{{"content-type", "application/octet-stream"}, {"x-name", "caf\xe9"}},
		Body:    []byte{0x00, 0xff, 0xfe, 'a'},
		Status:  201,
	}

	expectChanged(t, "completed with another token", false)(store.Complete(t.Context(), identity, "t2", response))
	expectChanged(t, "completed", true)(store.Complete(t.Context(), identity, "t1", response))
	expectClaim(t, store, claimParams(other, "t3", time.Minute), idempotencykeys.ClaimResult{
		Response:    &response,
		State:       idempotencykeys.ClaimCompleted,
		Fingerprint: fingerprint,
	})
	expectChanged(t, "released a completed record", false)(store.Release(t.Context(), identity, "t1"))
}

func TestStoreReleasesOnlyWithTheToken(t *testing.T) {
	t.Parallel()

	store := newTestStore()
	claim(t, store, claimParams(fingerprint, "t1", time.Minute))

	if released, err := store.Release(t.Context(), identity, "t2"); err != nil || released {
		t.Fatalf("got %v, %v", released, err)
	}

	if released, err := store.Release(t.Context(), identity, "t1"); err != nil || !released {
		t.Fatalf("got %v, %v", released, err)
	}

	if result := claim(t, store, claimParams(other, "t3", time.Minute)); result.State != idempotencykeys.ClaimClaimed {
		t.Fatalf("got %+v", result)
	}
}

func TestStoreTakesOverALeaseThatRanOutOnlyWithTheSameFingerprint(t *testing.T) {
	t.Parallel()

	store := newTestStore()
	claim(t, store, claimParams(fingerprint, "t1", 50*time.Millisecond))
	time.Sleep(100 * time.Millisecond)

	if result := claim(t, store, claimParams(other, "t2", time.Minute)); result.State != idempotencykeys.ClaimRunning {
		t.Fatalf("got %+v", result)
	}

	if result := claim(t, store, claimParams(fingerprint, "t3", time.Minute)); result.State != idempotencykeys.ClaimClaimed {
		t.Fatalf("got %+v", result)
	}
}

func TestStoreUsesTheDefaultPrefix(t *testing.T) {
	t.Parallel()

	store := valkeystore.NewStore(client, valkeystore.StoreOptions{Prefix: ""})
	params := claimParams(fingerprint, "t1", time.Minute)
	params.Identity = uniqueName("")
	claim(t, store, params)

	exists, err := client.Do(t.Context(), client.B().Exists().Key("idempotency_keys:"+params.Identity).Build()).AsInt64()
	if err != nil || exists != 1 {
		t.Fatalf("got %d, %v", exists, err)
	}

	if released, err := store.Release(t.Context(), params.Identity, "t1"); err != nil || !released {
		t.Fatalf("got %v, %v", released, err)
	}
}

func TestStoreFailsWhenValkeyDoes(t *testing.T) {
	t.Parallel()

	for _, store := range []*valkeystore.Store{
		newStore(failingClient{Client: client}),
		newStore(replyClient{Client: client, script: "return redis.error_reply('boom')"}),
	} {
		_, claimErr := store.Claim(t.Context(), claimParams(fingerprint, "t1", time.Minute))
		_, completeErr := store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200})
		_, releaseErr := store.Release(t.Context(), identity, "t1")

		for _, err := range []error{claimErr, completeErr, releaseErr} {
			if err == nil || errors.Is(err, idempotencykeys.ErrStoredRecord) {
				t.Errorf("got %v", err)
			}
		}
	}
}
