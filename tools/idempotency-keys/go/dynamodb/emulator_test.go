package dynamodb_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"
	dynamodbstore "github.com/JacobLey/leyman/tools/idempotency-keys/go/dynamodb"
)

// AWS Emulator (https://github.com/aws/aws-emulator) serves DynamoDB on HTTPS, with a certificate made for this host
// only, so each test run starts its own through aws-emulator-launch instead of using a sidecar. The root package's tests have the same helper, to run the vectors'
// scenarios: a test file can't be imported, and a package of its own would count against coverage.
const emulatorTimeout = 30 * time.Second

// emulator is a running AWS Emulator, with a client trusting its certificate and signing with its keys.
type emulator struct {
	running *awsemulator.Emulator
	client  *dynamodb.Client
}

// startEmulator starts the emulator, with authentication on, and a client for it.
func startEmulator(ctx context.Context) (*emulator, error) {
	running, err := awsemulator.Launch(ctx, awsemulator.Options{ //nolint:exhaustruct_v5 // Defaults otherwise
		StartTimeout: emulatorTimeout,
	})
	if errors.Is(err, awsemulator.ErrNotRun) {
		return nil, fmt.Errorf("%w; the devcontainer and Dagger's test container install it: rebuild the devcontainer", err)
	}

	if err != nil {
		return nil, err //nolint:wrapcheck // Only printed
	}

	credentials := aws.Credentials{ //nolint:exhaustruct_v5 // The keys never expire
		AccessKeyID:     running.Credentials.AccessKeyID,
		SecretAccessKey: running.Credentials.SecretAccessKey,
	}

	client := dynamodb.New(dynamodb.Options{ //nolint:exhaustruct_v5 // Options left out are the defaults
		Region:       running.Region,
		BaseEndpoint: aws.String(running.Endpoint),
		Credentials: aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
			return credentials, nil
		}),
		HTTPClient: running.HTTPClient(),
	})

	return &emulator{running: running, client: client}, nil
}

// createTable creates a table, waits until it is active (which takes the emulator a few seconds, as it does AWS), and
// turns on its TTL.
func (e *emulator) createTable(ctx context.Context, table string) error {
	options := dynamodbstore.StoreOptions{Table: table}
	if _, err := e.client.CreateTable(ctx, dynamodbstore.CreateTableInput(options)); err != nil {
		return fmt.Errorf("create table: %w", err)
	}

	err := dynamodb.NewTableExistsWaiter(e.client, func(waiter *dynamodb.TableExistsWaiterOptions) {
		waiter.MinDelay = 100 * time.Millisecond
		waiter.MaxDelay = 500 * time.Millisecond
	}).Wait(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(table)}, emulatorTimeout)
	if err != nil {
		return fmt.Errorf("wait for table: %w", err)
	}

	if _, err := e.client.UpdateTimeToLive(ctx, dynamodbstore.UpdateTimeToLiveInput(options)); err != nil {
		return fmt.Errorf("turn on TTL: %w", err)
	}

	return nil
}

// stop deletes a table and ends the emulator.
func (e *emulator) stop(table string) {
	_, _ = e.client.DeleteTable(context.Background(), &dynamodb.DeleteTableInput{TableName: aws.String(table)})
	e.running.Stop()
}

func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + hex.EncodeToString(id[:])
}
