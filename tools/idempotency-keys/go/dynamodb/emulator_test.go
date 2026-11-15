package dynamodb_test

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	dynamodbstore "github.com/JacobLey/leyman/tools/idempotency-keys/go/dynamodb"
)

// AWS Emulator (https://github.com/aws/aws-emulator) serves DynamoDB on HTTPS, with a certificate made for this host
// only, so each test run spawns its own instead of using a sidecar. The root package's tests have the same helper, to
// run the vectors' scenarios: a test file can't be imported, and a package of its own would count against coverage.
const emulatorTimeout = 30 * time.Second

var errEmulator = errors.New("aws-emulator")

// emulator is a running AWS Emulator, with a client trusting its certificate and signing with its keys.
type emulator struct {
	cmd    *exec.Cmd
	client *dynamodb.Client
}

// startupLine is one of the emulator's JSON log lines, whose fields are all strings. The one whose message is
// "emulator server information" gives where it serves, in endpoint_url, ca_file and config_file.
type startupLine struct {
	Fields map[string]string `json:"fields"`
}

// startEmulator spawns the emulator on a free port, with authentication on, and a client for it.
func startEmulator(ctx context.Context) (*emulator, error) {
	path, err := exec.LookPath("aws-emulator")
	if err != nil {
		return nil, fmt.Errorf("%w is not on PATH, which the devcontainer and Dagger's test container install: "+
			"rebuild the devcontainer: %w", errEmulator, err)
	}

	//nolint:gosec // The emulator found on PATH, as a shell would run it
	cmd := exec.CommandContext(ctx, path, "-p", "0", "-t", "off", "--idle-timeout", "120")

	var stderr bytes.Buffer

	cmd.Stderr = &stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errEmulator, err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("%w: %w", errEmulator, err)
	}

	started := make(chan startupLine, 1)

	go func() {
		lines := bufio.NewScanner(stdout)
		for lines.Scan() {
			var line startupLine
			if json.Unmarshal(lines.Bytes(), &line) == nil && line.Fields["message"] == "emulator server information" {
				started <- line

				break
			}
		}
		// Keeps reading, so the emulator never blocks on a full pipe
		_, _ = io.Copy(io.Discard, stdout)
	}()

	stop := func(reason error) (*emulator, error) {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()

		return nil, fmt.Errorf("%w: %w; its output: %s", errEmulator, reason, stderr.String())
	}

	select {
	case line := <-started:
		client, err := emulatorClient(line)
		if err != nil {
			return stop(err)
		}

		return &emulator{cmd: cmd, client: client}, nil
	case <-time.After(emulatorTimeout):
		return stop(errors.New("no startup line")) //nolint:err113 // Only printed
	}
}

// emulatorClient is a client of the emulator in a startup line: its endpoint, region and keys, trusting only its CA.
func emulatorClient(line startupLine) (*dynamodb.Client, error) {
	caPEM, err := os.ReadFile(line.Fields["ca_file"])
	if err != nil {
		return nil, err //nolint:wrapcheck // The caller wraps it
	}

	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("no certificate in %s", line.Fields["ca_file"]) //nolint:err113 // Only printed
	}

	config, err := readINI(line.Fields["config_file"])
	if err != nil {
		return nil, err
	}

	// The keys of this run, written beside its config
	keys, err := readINI(filepath.Join(filepath.Dir(line.Fields["config_file"]), "emulator_credentials"))
	if err != nil {
		return nil, err
	}

	credentials := aws.Credentials{ //nolint:exhaustruct_v5 // The keys never expire
		AccessKeyID:     keys["aws_access_key_id"],
		SecretAccessKey: keys["aws_secret_access_key"],
	}

	return dynamodb.New(dynamodb.Options{ //nolint:exhaustruct_v5 // Options left out are the defaults
		Region:       config["region"],
		BaseEndpoint: aws.String(line.Fields["endpoint_url"]),
		Credentials: aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
			return credentials, nil
		}),
		HTTPClient: &http.Client{ //nolint:exhaustruct_v5 // Options left out are the defaults
			Transport: &http.Transport{ //nolint:exhaustruct_v5 // Options left out are the defaults
				TLSClientConfig: &tls.Config{ //nolint:exhaustruct_v5 // Options left out are the defaults
					RootCAs:    roots,
					MinVersion: tls.VersionTLS12,
				},
			},
		},
	}), nil
}

// readINI reads the key = value lines of an AWS config or credentials file, which for the emulator hold one profile.
func readINI(path string) (map[string]string, error) {
	data, err := os.ReadFile(path) //nolint:gosec // A file the emulator named
	if err != nil {
		return nil, err //nolint:wrapcheck // The caller wraps it
	}

	values := map[string]string{}

	for line := range strings.Lines(string(data)) {
		if key, value, ok := strings.Cut(line, "="); ok {
			values[strings.TrimSpace(key)] = strings.TrimSpace(value)
		}
	}

	return values, nil
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

	if _, err := e.client.UpdateTimeToLive(ctx, dynamodbstore.TimeToLiveInput(options)); err != nil {
		return fmt.Errorf("turn on TTL: %w", err)
	}

	return nil
}

// stop deletes a table and ends the emulator.
func (e *emulator) stop(table string) {
	_, _ = e.client.DeleteTable(context.Background(), &dynamodb.DeleteTableInput{TableName: aws.String(table)})
	_ = e.cmd.Process.Signal(syscall.SIGTERM)
	_ = e.cmd.Wait()
}

func uniqueName(prefix string) string {
	var id [8]byte

	_, _ = rand.Read(id[:])

	return prefix + hex.EncodeToString(id[:])
}
