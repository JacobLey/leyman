package dynamodb_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	dynamodbstore "github.com/JacobLey/leyman/tools/idempotency-keys/go/dynamodb"
)

const (
	fingerprint = "f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"
	other       = "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f"
)

// The emulator and table are shared by the package's tests, which TestMain starts and stops. Each test uses
// identities of its own.
var (
	client *dynamodb.Client //nolint:gochecknoglobals // TestMain owns it, for every test of the package
	table  string           //nolint:gochecknoglobals // TestMain owns it, for every test of the package
)

func TestMain(m *testing.M) {
	ctx := context.Background()

	running, err := startEmulator(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	client = running.client
	table = uniqueName("idempotency_keys_test_")

	if err := running.createTable(ctx, table); err != nil {
		running.stop()
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	code := m.Run()

	running.stop()
	os.Exit(code)
}

func newStore() *dynamodbstore.Store {
	return dynamodbstore.NewStore(client, dynamodbstore.StoreOptions{Table: table})
}

// newIdentity is an identity no other test uses.
func newIdentity() string {
	var id [32]byte

	_, _ = rand.Read(id[:])

	return hex.EncodeToString(id[:])
}

func claimParams(identity, fingerprint, token string, lease time.Duration) idempotencykeys.ClaimParams {
	return idempotencykeys.ClaimParams{Identity: identity, Fingerprint: fingerprint, Token: token, Lease: lease, TTL: time.Hour}
}

func claimed() idempotencykeys.ClaimResult {
	return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}
}

func running() idempotencykeys.ClaimResult {
	return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimRunning, Fingerprint: fingerprint}
}

func claim(t *testing.T, store *dynamodbstore.Store, params idempotencykeys.ClaimParams) idempotencykeys.ClaimResult {
	t.Helper()

	result, err := store.Claim(t.Context(), params)
	if err != nil {
		t.Fatal(err)
	}

	return result
}

func expectClaim(t *testing.T, store *dynamodbstore.Store, params idempotencykeys.ClaimParams, want idempotencykeys.ClaimResult) {
	t.Helper()

	if got := claim(t, store, params); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

// expectChanged checks the result of a complete, release or renew.
func expectChanged(t *testing.T, what string, want bool) func(changed bool, err error) {
	t.Helper()

	return func(changed bool, err error) {
		t.Helper()

		if err != nil || changed != want {
			t.Fatalf("%s: got %v, %v; want %v", what, changed, err, want)
		}
	}
}

func digest(t *testing.T, value string) []byte {
	t.Helper()

	bytes, err := hex.DecodeString(value)
	if err != nil {
		t.Fatal(err)
	}

	return bytes
}

// getItem reads an item as DynamoDB holds it.
func getItem(t *testing.T, identity string) map[string]types.AttributeValue {
	t.Helper()

	output, err := client.GetItem(t.Context(), &dynamodb.GetItemInput{ //nolint:exhaustruct_v5 // Defaults
		TableName:      aws.String(table),
		Key:            map[string]types.AttributeValue{"identity": &types.AttributeValueMemberB{Value: digest(t, identity)}},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		t.Fatal(err)
	}

	return output.Item
}

func number(t *testing.T, item map[string]types.AttributeValue, name string) int64 {
	t.Helper()

	attribute, ok := item[name].(*types.AttributeValueMemberN)
	if !ok {
		t.Fatalf("%s is %#v, not a number", name, item[name])
	}

	value, err := strconv.ParseInt(attribute.Value, 10, 64)
	if err != nil {
		t.Fatal(err)
	}

	return value
}

func TestStoreClaimsRunsAndCompletesARecord(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()

	expectClaim(t, store, claimParams(identity, fingerprint, "t1", time.Minute), claimed())
	expectClaim(t, store, claimParams(identity, fingerprint, "t2", time.Minute), running())
	expectClaim(t, store, claimParams(identity, other, "t2", time.Minute), running())

	response := idempotencykeys.StoredResponse{
		Headers: [][2]string{{"content-type", "application/octet-stream"}, {"x-name", "caf\xe9"}},
		Body:    []byte{0x00, 0xff, 0xfe, 'a'},
		Status:  201,
	}

	expectChanged(t, "completed with another token", false)(store.Complete(t.Context(), identity, "t2", response))
	expectChanged(t, "completed", true)(store.Complete(t.Context(), identity, "t1", response))
	expectClaim(t, store, claimParams(identity, other, "t3", time.Minute), idempotencykeys.ClaimResult{
		Response:    &response,
		State:       idempotencykeys.ClaimCompleted,
		Fingerprint: fingerprint,
	})
	expectChanged(t, "completed again", false)(store.Complete(t.Context(), identity, "t1", response))
	expectChanged(t, "released a completed record", false)(store.Release(t.Context(), identity, "t1"))
}

// checkClaimedItem checks a running record's item, as the spec lays it out, and returns its expiry and ttl.
func checkClaimedItem(t *testing.T, identity string, before, after int64) (int64, int64) {
	t.Helper()

	item := getItem(t, identity)
	if len(item) != 6 ||
		!reflect.DeepEqual(item["identity"], &types.AttributeValueMemberB{Value: digest(t, identity)}) ||
		!reflect.DeepEqual(item["fingerprint"], &types.AttributeValueMemberB{Value: digest(t, fingerprint)}) ||
		!reflect.DeepEqual(item["token"], &types.AttributeValueMemberS{Value: "t1"}) {
		t.Fatalf("claimed %#v", item)
	}

	lease, expires, ttl := number(t, item, "lease_expires_at"), number(t, item, "expires_at"), number(t, item, "ttl")
	if lease < before+60_000 || lease > after+60_000 || expires-lease != 3_600_001-60_000 {
		t.Fatalf("lease_expires_at %d, expires_at %d, claimed between %d and %d", lease, expires, before, after)
	}

	// Seconds, rounded up
	if ttl*1000 < expires || ttl*1000 >= expires+1000 {
		t.Fatalf("ttl %d, expires_at %d", ttl, expires)
	}

	return expires, ttl
}

func TestStoreWritesTheSpecsItem(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	before := time.Now().UnixMilli()

	claim(t, store, idempotencykeys.ClaimParams{
		Identity: identity, Fingerprint: fingerprint, Token: "t1", Lease: time.Minute, TTL: time.Hour + time.Millisecond,
	})

	expires, ttl := checkClaimedItem(t, identity, before, time.Now().UnixMilli())

	expectChanged(t, "completed", true)(store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{
		Headers: [][2]string{{"x-name", "caf\xe9"}},
		Body:    []byte("hi"),
		Status:  201,
	}))

	completed := getItem(t, identity)
	if len(completed) != 7 ||
		!reflect.DeepEqual(completed["status"], &types.AttributeValueMemberN{Value: "201"}) ||
		!reflect.DeepEqual(completed["headers"], &types.AttributeValueMemberS{Value: `[["x-name","café"]]`}) ||
		!reflect.DeepEqual(completed["body"], &types.AttributeValueMemberB{Value: []byte("hi")}) ||
		number(t, completed, "expires_at") != expires || number(t, completed, "ttl") != ttl {
		t.Fatalf("completed %#v", completed)
	}
}

func TestStoreRenewsTheSpecsItem(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	claim(t, store, claimParams(identity, fingerprint, "t1", 50*time.Millisecond))

	expectChanged(t, "renewed with another token", false)(store.Renew(t.Context(), identity, "t2", time.Minute, time.Hour))
	time.Sleep(100 * time.Millisecond)

	before := time.Now().UnixMilli()

	expectChanged(t, "renewed once the lease ran out", true)(
		store.Renew(t.Context(), identity, "t1", time.Minute, time.Hour+time.Millisecond),
	)
	checkClaimedItem(t, identity, before, time.Now().UnixMilli())
	expectClaim(t, store, claimParams(identity, fingerprint, "t3", time.Minute), running())

	response := idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}
	expectChanged(t, "completed", true)(store.Complete(t.Context(), identity, "t1", response))
	expectChanged(t, "renewed a completed record", false)(store.Renew(t.Context(), identity, "t1", time.Minute, time.Hour))
}

func TestStoreStoresAnEmptyBody(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	response := idempotencykeys.StoredResponse{Headers: [][2]string{}, Body: nil, Status: 204}

	claim(t, store, claimParams(identity, fingerprint, "t1", time.Minute))
	expectChanged(t, "completed", true)(store.Complete(t.Context(), identity, "t1", response))

	result := claim(t, store, claimParams(identity, fingerprint, "t2", time.Minute))
	if result.Response == nil || result.Response.Body == nil || len(result.Response.Body) != 0 ||
		len(result.Response.Headers) != 0 || result.Response.Status != 204 {
		t.Fatalf("got %+v", result.Response)
	}
}

func TestStoreReleasesOnlyWithTheToken(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	claim(t, store, claimParams(identity, fingerprint, "t1", time.Minute))

	expectChanged(t, "released with another token", false)(store.Release(t.Context(), identity, "t2"))
	expectChanged(t, "released", true)(store.Release(t.Context(), identity, "t1"))
	expectChanged(t, "released again", false)(store.Release(t.Context(), identity, "t1"))
	expectClaim(t, store, claimParams(identity, other, "t3", time.Minute), claimed())
}

func TestStoreTakesOverALeaseThatRanOutOnlyWithTheSameFingerprint(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	claim(t, store, claimParams(identity, fingerprint, "t1", 50*time.Millisecond))
	time.Sleep(100 * time.Millisecond)

	expectClaim(t, store, claimParams(identity, other, "t2", time.Minute), running())
	expectClaim(t, store, claimParams(identity, fingerprint, "t3", time.Minute), claimed())

	response := idempotencykeys.StoredResponse{Headers: nil, Body: []byte("late"), Status: 200}
	expectChanged(t, "completed with the stale token", false)(store.Complete(t.Context(), identity, "t1", response))
	expectChanged(t, "released with the stale token", false)(store.Release(t.Context(), identity, "t1"))
	expectChanged(t, "completed with the new token", true)(store.Complete(t.Context(), identity, "t3", response))
}

func TestStoreForgetsAnExpiredKey(t *testing.T) {
	t.Parallel()

	store := newStore()
	response := idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}
	short := func(identity, fingerprint, token string) idempotencykeys.ClaimParams {
		return idempotencykeys.ClaimParams{
			Identity: identity, Fingerprint: fingerprint, Token: token, Lease: 50 * time.Millisecond, TTL: 100 * time.Millisecond,
		}
	}

	runningKey, completedKey := newIdentity(), newIdentity()
	claim(t, store, short(runningKey, fingerprint, "t1"))
	claim(t, store, short(completedKey, fingerprint, "t1"))
	expectChanged(t, "completed", true)(store.Complete(t.Context(), completedKey, "t1", response))
	time.Sleep(150 * time.Millisecond)

	expectChanged(t, "completed once expired", false)(store.Complete(t.Context(), runningKey, "t1", response))
	expectChanged(t, "released once expired", false)(store.Release(t.Context(), runningKey, "t1"))
	expectChanged(t, "renewed once expired", false)(store.Renew(t.Context(), runningKey, "t1", time.Minute, time.Hour))

	for _, identity := range []string{runningKey, completedKey} {
		expectClaim(t, store, claimParams(identity, other, "t2", time.Minute), claimed())
	}
}

func TestStoreRefusesAResponseOverTheItemLimit(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	claim(t, store, claimParams(identity, fingerprint, "t1", time.Minute))

	_, err := store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{
		Headers: nil,
		Body:    make([]byte, 400*1024),
		Status:  200,
	})

	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) || apiErr.ErrorCode() != "ValidationException" {
		t.Fatalf("got %v", err)
	}

	// Left to its lease
	expectClaim(t, store, claimParams(identity, fingerprint, "t2", time.Minute), running())
}

// putItem writes an item no implementation writes, unexpired, with the given attributes over a completed record's.
func putItem(t *testing.T, identity string, attributes map[string]types.AttributeValue) {
	t.Helper()

	item := map[string]types.AttributeValue{
		"identity":    &types.AttributeValueMemberB{Value: digest(t, identity)},
		"fingerprint": &types.AttributeValueMemberB{Value: digest(t, fingerprint)},
		"expires_at":  &types.AttributeValueMemberN{Value: strconv.FormatInt(time.Now().Add(time.Hour).UnixMilli(), 10)},
		"status":      &types.AttributeValueMemberN{Value: "200"},
		"headers":     &types.AttributeValueMemberS{Value: "[]"},
		"body":        &types.AttributeValueMemberB{Value: []byte("b")},
	}

	for name, value := range attributes {
		if value == nil {
			delete(item, name)
		} else {
			item[name] = value
		}
	}

	if _, err := client.PutItem(t.Context(), &dynamodb.PutItemInput{ //nolint:exhaustruct_v5 // Defaults
		TableName: aws.String(table),
		Item:      item,
	}); err != nil {
		t.Fatal(err)
	}
}

func TestStoreRejectsItemsNoImplementationWrites(t *testing.T) {
	t.Parallel()

	for name, attributes := range map[string]map[string]types.AttributeValue{
		"a fingerprint not binary": {"fingerprint": &types.AttributeValueMemberS{Value: fingerprint}},
		"a status not a number":    {"status": &types.AttributeValueMemberS{Value: "200"}},
		"a status not an integer":  {"status": &types.AttributeValueMemberN{Value: "200.5"}},
		"no headers":               {"headers": nil},
		"headers not pairs":        {"headers": &types.AttributeValueMemberS{Value: "{"}},
		"no body":                  {"body": nil},
	} {
		t.Run("rejects "+name, func(t *testing.T) {
			t.Parallel()

			identity := newIdentity()
			putItem(t, identity, attributes)

			_, err := newStore().Claim(t.Context(), claimParams(identity, other, "t1", time.Minute))
			if !errors.Is(err, idempotencykeys.ErrStoredRecord) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

// fakeClient answers every request with its error, recording the tables asked for.
type fakeClient struct {
	dynamodbstore.Client

	err    error
	tables *[]string
}

func (c fakeClient) PutItem(_ context.Context, input *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (
	*dynamodb.PutItemOutput, error,
) {
	*c.tables = append(*c.tables, *input.TableName)

	return nil, c.err
}

func (c fakeClient) UpdateItem(_ context.Context, input *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (
	*dynamodb.UpdateItemOutput, error,
) {
	*c.tables = append(*c.tables, *input.TableName)

	return nil, c.err
}

func (c fakeClient) DeleteItem(_ context.Context, input *dynamodb.DeleteItemInput, _ ...func(*dynamodb.Options)) (
	*dynamodb.DeleteItemOutput, error,
) {
	*c.tables = append(*c.tables, *input.TableName)

	return nil, c.err
}

func failedCondition(item map[string]types.AttributeValue) error {
	return &types.ConditionalCheckFailedException{Message: aws.String("failed"), Item: item} //nolint:exhaustruct_v5 // Unused
}

func TestStorePassesOnAFailedClaimWithoutTheItem(t *testing.T) {
	t.Parallel()

	store := dynamodbstore.NewStore(fakeClient{Client: nil, err: failedCondition(nil), tables: &[]string{}}, dynamodbstore.StoreOptions{Table: ""})

	_, err := store.Claim(t.Context(), claimParams(newIdentity(), fingerprint, "t1", time.Minute))

	var failed *types.ConditionalCheckFailedException
	if !errors.As(err, &failed) || errors.Is(err, idempotencykeys.ErrStoredRecord) ||
		!strings.Contains(err.Error(), "returned no item") {
		t.Fatalf("got %v", err)
	}
}

func TestStoreReadsABodyTheSDKGivesAsNil(t *testing.T) {
	t.Parallel()

	store := dynamodbstore.NewStore(fakeClient{Client: nil, err: failedCondition(map[string]types.AttributeValue{
		"fingerprint": &types.AttributeValueMemberB{Value: digest(t, fingerprint)},
		"status":      &types.AttributeValueMemberN{Value: "204"},
		"headers":     &types.AttributeValueMemberS{Value: "[]"},
		"body":        &types.AttributeValueMemberB{Value: nil},
	}), tables: &[]string{}}, dynamodbstore.StoreOptions{Table: ""})

	result := claim(t, store, claimParams(newIdentity(), fingerprint, "t1", time.Minute))
	if result.State != idempotencykeys.ClaimCompleted || result.Response.Body == nil {
		t.Fatalf("got %+v", result)
	}
}

func TestStoreFailsWhenDynamoDBDoes(t *testing.T) {
	t.Parallel()

	// A table that doesn't exist is an error DynamoDB gives for every request
	store := dynamodbstore.NewStore(client, dynamodbstore.StoreOptions{Table: uniqueName("missing_")})
	identity := newIdentity()

	_, claimErr := store.Claim(t.Context(), claimParams(identity, fingerprint, "t1", time.Minute))
	_, completeErr := store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200})
	_, releaseErr := store.Release(t.Context(), identity, "t1")
	_, renewErr := store.Renew(t.Context(), identity, "t1", time.Minute, time.Hour)

	for _, err := range []error{claimErr, completeErr, releaseErr, renewErr} {
		var missing *types.ResourceNotFoundException
		if !errors.As(err, &missing) || errors.Is(err, idempotencykeys.ErrStoredRecord) {
			t.Errorf("got %v", err)
		}
	}
}

func TestStoreRejectsAnIdentityOrFingerprintThatIsntHex(t *testing.T) {
	t.Parallel()

	store := newStore()
	identity := newIdentity()
	response := idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200}

	_, badIdentity := store.Claim(t.Context(), claimParams("not hex", fingerprint, "t1", time.Minute))
	_, badFingerprint := store.Claim(t.Context(), claimParams(identity, "not hex", "t1", time.Minute))
	_, badComplete := store.Complete(t.Context(), "not hex", "t1", response)
	_, badRelease := store.Release(t.Context(), "not hex", "t1")
	_, badRenew := store.Renew(t.Context(), "not hex", "t1", time.Minute, time.Hour)

	for _, err := range []error{badIdentity, badFingerprint, badComplete, badRelease, badRenew} {
		if err == nil {
			t.Error("got no error")
		}
	}
}

func TestNewStoreUsesTheDefaultTable(t *testing.T) {
	t.Parallel()

	var tables []string

	store := dynamodbstore.NewStore(fakeClient{Client: nil, err: errors.New("down"), tables: &tables}, dynamodbstore.StoreOptions{Table: ""}) //nolint:err113 // Only compared by identity

	identity := newIdentity()
	_, _ = store.Claim(t.Context(), claimParams(identity, fingerprint, "t1", time.Minute))
	_, _ = store.Complete(t.Context(), identity, "t1", idempotencykeys.StoredResponse{Headers: nil, Body: nil, Status: 200})
	_, _ = store.Release(t.Context(), identity, "t1")

	if !reflect.DeepEqual(tables, []string{"idempotency_keys", "idempotency_keys", "idempotency_keys"}) {
		t.Fatalf("got %q", tables)
	}
}

func TestCreateTableInput(t *testing.T) {
	t.Parallel()

	input := dynamodbstore.CreateTableInput(dynamodbstore.StoreOptions{Table: ""})
	if *input.TableName != "idempotency_keys" || len(input.KeySchema) != 1 || *input.KeySchema[0].AttributeName != "identity" ||
		input.KeySchema[0].KeyType != types.KeyTypeHash || len(input.AttributeDefinitions) != 1 ||
		input.AttributeDefinitions[0].AttributeType != types.ScalarAttributeTypeB {
		t.Fatalf("got %+v", input)
	}

	if named := dynamodbstore.CreateTableInput(dynamodbstore.StoreOptions{Table: "keys"}); *named.TableName != "keys" {
		t.Fatalf("got %q", *named.TableName)
	}
}

func TestUpdateTimeToLiveInput(t *testing.T) {
	t.Parallel()

	input := dynamodbstore.UpdateTimeToLiveInput(dynamodbstore.StoreOptions{Table: ""})
	if *input.TableName != "idempotency_keys" || *input.TimeToLiveSpecification.AttributeName != "ttl" ||
		!*input.TimeToLiveSpecification.Enabled {
		t.Fatalf("got %+v", input)
	}

	// TestMain's table has it off until now, as no other test relies on it
	if _, err := client.UpdateTimeToLive(t.Context(), dynamodbstore.UpdateTimeToLiveInput(
		dynamodbstore.StoreOptions{Table: table})); err != nil {
		t.Fatal(err)
	}

	// On, or on its way, as DynamoDB takes a while
	output, err := client.DescribeTimeToLive(t.Context(), &dynamodb.DescribeTimeToLiveInput{TableName: aws.String(table)})
	if err != nil {
		t.Fatal(err)
	}

	description := output.TimeToLiveDescription
	if (description.TimeToLiveStatus != types.TimeToLiveStatusEnabled &&
		description.TimeToLiveStatus != types.TimeToLiveStatusEnabling) || *description.AttributeName != "ttl" {
		t.Fatalf("got %+v", *description)
	}
}
