package idempotencykeys_test

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"
	dynamodbstore "github.com/JacobLey/leyman/tools/idempotency-keys/go/dynamodb"
)

// AWS Emulator (https://github.com/aws/aws-emulator) serves DynamoDB on HTTPS, with a certificate made for this host
// only, so each test run starts its own through aws-emulator-launch instead of using a sidecar. The dynamodb
// package's tests have the same helper: a test file can't be imported, and a package of its own would count against
// coverage.

// tableTimeout bounds the wait for a new table to be active, which takes the emulator a few seconds, as it does AWS.
const tableTimeout = 30 * time.Second

// emulator is a running AWS Emulator, with a client trusting its certificate and signing with its keys.
type emulator struct {
	running *awsemulator.Emulator
	client  *dynamodb.Client
}

// startEmulator starts the emulator, with authentication on, and a client for it.
func startEmulator(ctx context.Context) (*emulator, error) {
	running, err := awsemulator.Launch(ctx, awsemulator.Options{}) //nolint:exhaustruct_v5 // The defaults
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

// createTable creates a table and waits until it is active. Time to Live stays off, as the store never relies on it.
func (e *emulator) createTable(ctx context.Context, table string) error {
	options := dynamodbstore.StoreOptions{Table: table}
	if _, err := e.client.CreateTable(ctx, dynamodbstore.CreateTableInput(options)); err != nil {
		return fmt.Errorf("create table: %w", err)
	}

	err := dynamodb.NewTableExistsWaiter(e.client, func(waiter *dynamodb.TableExistsWaiterOptions) {
		waiter.MinDelay = 100 * time.Millisecond
		waiter.MaxDelay = 500 * time.Millisecond
	}).Wait(ctx, &dynamodb.DescribeTableInput{TableName: aws.String(table)}, tableTimeout)
	if err != nil {
		return fmt.Errorf("wait for table: %w", err)
	}

	return nil
}

// stop ends the emulator, and its tables with it, as it keeps everything in memory.
func (e *emulator) stop() {
	e.running.Stop()
}
