// Package dynamodb holds the spec's DynamoDB store, on the AWS SDK for Go v2
// (https://github.com/aws/aws-sdk-go-v2). It has no notifier of its own: any notifier works with any store, so pair it
// with the Valkey or Postgres one, or none.
package dynamodb

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	idempotencykeys "github.com/JacobLey/leyman/tools/idempotency-keys/go"
	"github.com/JacobLey/leyman/tools/idempotency-keys/go/internal/wire"
)

const (
	defaultName = "idempotency_keys"
	millisecond = 1000
	// The value every condition compares expiries with.
	nowValue = ":now"
)

// The item's attributes, as the spec's "DynamoDB" section names them. Expressions refer to them through
// ExpressionAttributeNames, as some (status, ttl) are DynamoDB reserved words.
const (
	attrIdentity       = "identity"
	attrFingerprint    = "fingerprint"
	attrToken          = "token"
	attrLeaseExpiresAt = "lease_expires_at"
	attrExpiresAt      = "expires_at"
	attrTTL            = "ttl"
	attrStatus         = "status"
	attrHeaders        = "headers"
	attrBody           = "body"
)

const (
	claimCondition = "attribute_not_exists(#identity) OR #expires_at <= :now" +
		" OR (#lease_expires_at <= :now AND #fingerprint = :fingerprint)"
	holdsTokenCondition = "#token = :token AND #expires_at > :now" //nolint:gosec // A condition, not a credential
	completeUpdate      = "SET #status = :status, #headers = :headers, #body = :body REMOVE #token, #lease_expires_at"
)

// Client is what the store needs from a DynamoDB client. A [*dynamodb.Client] fits as is.
type Client interface {
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (
		*dynamodb.PutItemOutput, error,
	)
	UpdateItem(ctx context.Context, params *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (
		*dynamodb.UpdateItemOutput, error,
	)
	DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (
		*dynamodb.DeleteItemOutput, error,
	)
}

var _ Client = (*dynamodb.Client)(nil)

// StoreOptions configure [NewStore], [CreateTableInput] and [UpdateTimeToLiveInput].
type StoreOptions struct {
	// Table is the table's name. "idempotency_keys" when empty.
	Table string
}

func tableName(options StoreOptions) string {
	if options.Table == "" {
		return defaultName
	}

	return options.Table
}

// CreateTableInput is the CreateTable request of the spec's table, billed on demand, for a migration or
// infrastructure code to send or copy.
func CreateTableInput(options StoreOptions) *dynamodb.CreateTableInput {
	return &dynamodb.CreateTableInput{ //nolint:exhaustruct_v5 // Fields left out are DynamoDB's defaults
		TableName: aws.String(tableName(options)),
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String(attrIdentity), AttributeType: types.ScalarAttributeTypeB},
		},
		KeySchema:   []types.KeySchemaElement{{AttributeName: aws.String(attrIdentity), KeyType: types.KeyTypeHash}},
		BillingMode: types.BillingModePayPerRequest,
	}
}

// UpdateTimeToLiveInput is the UpdateTimeToLive request that turns on DynamoDB's own expiry for the table's ttl
// attribute, so expired items are deleted some time after they expire. The store never relies on it: every condition
// checks the expiry itself, so without it expired items only stay until a claim writes over them.
func UpdateTimeToLiveInput(options StoreOptions) *dynamodb.UpdateTimeToLiveInput {
	return &dynamodb.UpdateTimeToLiveInput{
		TableName: aws.String(tableName(options)),
		TimeToLiveSpecification: &types.TimeToLiveSpecification{
			AttributeName: aws.String(attrTTL),
			Enabled:       aws.Bool(true),
		},
	}
}

// Store is the strict store: a claim is a conditional write, so it is exclusive, and DynamoDB keeps it durably.
// DynamoDB has no clock a condition can read, so every time is this server's (time.Now), and the lease must cover the
// worst clock drift between servers as well as the slowest handler. An item holds at most 400 KB, so a response that
// doesn't fit is an error when completing, and the attempt is left to its lease. The layout is the spec's, in its
// "DynamoDB" section.
type Store struct {
	client Client
	table  *string
}

var _ idempotencykeys.Store = (*Store)(nil)

// NewStore is the DynamoDB store on a client.
func NewStore(client Client, options StoreOptions) *Store {
	return &Store{client: client, table: aws.String(tableName(options))}
}

func digest(name, value string) ([]byte, error) {
	bytes, err := hex.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("idempotency-keys: %s %q: %w", name, value, err)
	}

	return bytes, nil
}

// names are the ExpressionAttributeNames of attributes, each as #<name>.
func names(attributes ...string) map[string]string {
	placeholders := make(map[string]string, len(attributes))
	for _, attribute := range attributes {
		placeholders["#"+attribute] = attribute
	}

	return placeholders
}

func number(value int64) *types.AttributeValueMemberN {
	return &types.AttributeValueMemberN{Value: strconv.FormatInt(value, 10)}
}

// now is the time conditions compare with, in milliseconds since the epoch.
func now() int64 {
	return time.Now().UnixMilli()
}

// Claim writes a running record in one PutItem, conditioned on there being no unexpired record it may not take over.
// A failed condition returns the record found, so a claim never reads after it.
func (s *Store) Claim(ctx context.Context, params idempotencykeys.ClaimParams) (idempotencykeys.ClaimResult, error) {
	identity, err := digest("identity", params.Identity)
	if err != nil {
		return idempotencykeys.ClaimResult{}, err
	}

	fingerprint, err := digest("fingerprint", params.Fingerprint)
	if err != nil {
		return idempotencykeys.ClaimResult{}, err
	}

	start := now()
	expiresAt := start + params.TTL.Milliseconds()

	_, err = s.client.PutItem(ctx, &dynamodb.PutItemInput{ //nolint:exhaustruct_v5 // Fields left out are unused
		TableName: s.table,
		Item: map[string]types.AttributeValue{
			attrIdentity:       &types.AttributeValueMemberB{Value: identity},
			attrFingerprint:    &types.AttributeValueMemberB{Value: fingerprint},
			attrToken:          &types.AttributeValueMemberS{Value: params.Token},
			attrLeaseExpiresAt: number(start + params.Lease.Milliseconds()),
			attrExpiresAt:      number(expiresAt),
			// Seconds, rounded up, so DynamoDB never deletes an item before it expires
			attrTTL: number((expiresAt + millisecond - 1) / millisecond),
		},
		ConditionExpression:      aws.String(claimCondition),
		ExpressionAttributeNames: names(attrIdentity, attrExpiresAt, attrLeaseExpiresAt, attrFingerprint),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			nowValue:       number(start),
			":fingerprint": &types.AttributeValueMemberB{Value: fingerprint},
		},
		ReturnValuesOnConditionCheckFailure: types.ReturnValuesOnConditionCheckFailureAllOld,
	})
	if err == nil {
		return idempotencykeys.ClaimResult{Response: nil, State: idempotencykeys.ClaimClaimed, Fingerprint: ""}, nil
	}

	var failed *types.ConditionalCheckFailedException
	if !errors.As(err, &failed) {
		return idempotencykeys.ClaimResult{}, fmt.Errorf("idempotency-keys: DynamoDB claim: %w", err)
	}

	return found(failed.Item)
}

func itemError(item map[string]types.AttributeValue, reason string) error {
	return fmt.Errorf("%w: DynamoDB item %v: %s", idempotencykeys.ErrStoredRecord, item, reason)
}

// found reads the record a failed claim returned: running without a status, completed with one.
func found(item map[string]types.AttributeValue) (idempotencykeys.ClaimResult, error) {
	fingerprint, isBinary := item[attrFingerprint].(*types.AttributeValueMemberB)
	if !isBinary {
		return idempotencykeys.ClaimResult{}, itemError(item, "no binary fingerprint")
	}

	status, hasStatus := item[attrStatus]
	if !hasStatus {
		return idempotencykeys.ClaimResult{
			Response:    nil,
			State:       idempotencykeys.ClaimRunning,
			Fingerprint: hex.EncodeToString(fingerprint.Value),
		}, nil
	}

	response, err := storedResponse(item, status)
	if err != nil {
		return idempotencykeys.ClaimResult{}, err
	}

	return idempotencykeys.ClaimResult{
		Response:    response,
		State:       idempotencykeys.ClaimCompleted,
		Fingerprint: hex.EncodeToString(fingerprint.Value),
	}, nil
}

func storedResponse(
	item map[string]types.AttributeValue,
	status types.AttributeValue,
) (*idempotencykeys.StoredResponse, error) {
	statusNumber, isNumber := status.(*types.AttributeValueMemberN)
	if !isNumber {
		return nil, itemError(item, "the status is not a number")
	}

	code, err := strconv.Atoi(statusNumber.Value)
	if err != nil {
		return nil, itemError(item, "the status is not an integer")
	}

	headers, isString := item[attrHeaders].(*types.AttributeValueMemberS)
	if !isString {
		return nil, itemError(item, "the headers are not a string")
	}

	decoded, err := wire.DecodeHeaders([]byte(headers.Value))
	if err != nil {
		return nil, fmt.Errorf("idempotency-keys: DynamoDB claim: %w", err)
	}

	body, isBinary := item[attrBody].(*types.AttributeValueMemberB)
	if !isBinary {
		return nil, itemError(item, "the body is not binary")
	}

	value := body.Value
	if value == nil {
		value = []byte{}
	}

	return &idempotencykeys.StoredResponse{Headers: decoded, Body: value, Status: code}, nil
}

// conditionFailed is whether err is a failed condition, which Complete and Release answer with false.
func conditionFailed(operation string, err error) (bool, error) {
	var failed *types.ConditionalCheckFailedException
	if errors.As(err, &failed) {
		return false, nil
	}

	return false, fmt.Errorf("idempotency-keys: DynamoDB %s: %w", operation, err)
}

// Complete stores the response in one UpdateItem, if the record still holds the token and the key hasn't expired. A
// response that makes the item larger than 400 KB is DynamoDB's error.
func (s *Store) Complete(
	ctx context.Context,
	identity, token string,
	response idempotencykeys.StoredResponse,
) (bool, error) {
	record, err := digest("identity", identity)
	if err != nil {
		return false, err
	}

	body := response.Body
	if body == nil {
		body = []byte{}
	}

	_, err = s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{ //nolint:exhaustruct_v5 // Fields left out are unused
		TableName:                s.table,
		Key:                      map[string]types.AttributeValue{attrIdentity: &types.AttributeValueMemberB{Value: record}},
		UpdateExpression:         aws.String(completeUpdate),
		ConditionExpression:      aws.String(holdsTokenCondition),
		ExpressionAttributeNames: names(attrStatus, attrHeaders, attrBody, attrToken, attrLeaseExpiresAt, attrExpiresAt),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status":  number(int64(response.Status)),
			":headers": &types.AttributeValueMemberS{Value: wire.EncodeHeaders(response.Headers)},
			":body":    &types.AttributeValueMemberB{Value: body},
			":token":   &types.AttributeValueMemberS{Value: token},
			nowValue:   number(now()),
		},
	})
	if err != nil {
		return conditionFailed("complete", err)
	}

	return true, nil
}

// Release deletes the record in one DeleteItem, if it still holds the token and the key hasn't expired.
func (s *Store) Release(ctx context.Context, identity, token string) (bool, error) {
	record, err := digest("identity", identity)
	if err != nil {
		return false, err
	}

	_, err = s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{ //nolint:exhaustruct_v5 // Fields left out are unused
		TableName:                s.table,
		Key:                      map[string]types.AttributeValue{attrIdentity: &types.AttributeValueMemberB{Value: record}},
		ConditionExpression:      aws.String(holdsTokenCondition),
		ExpressionAttributeNames: names(attrToken, attrExpiresAt),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":token": &types.AttributeValueMemberS{Value: token},
			nowValue: number(now()),
		},
	})
	if err != nil {
		return conditionFailed("release", err)
	}

	return true, nil
}
