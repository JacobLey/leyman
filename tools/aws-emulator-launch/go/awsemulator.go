// Package awsemulator starts AWS Emulator for tests, on a free port, and returns its endpoint, credentials and
// certificate authority.
//
// It needs AWS Emulator 1.0.290 or later, installed as AWS describes:
// https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html
package awsemulator

import (
	"bytes"
	"cmp"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"
)

const installPage = "https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html"

// The defaults of Options.
const (
	DefaultBinary       = "aws-emulator"
	DefaultIdleTimeout  = 10 * time.Minute
	DefaultStartTimeout = 10 * time.Second
)

// Errors, each matched with errors.Is. Their messages include the emulator's output where it has any.
var (
	// ErrNotRun is a binary that couldn't be run: most often it isn't installed, or isn't on PATH.
	ErrNotRun = errors.New("could not run AWS Emulator")
	// ErrExited is an emulator that exited before it printed its startup line, for instance on an option it doesn't
	// know.
	ErrExited = errors.New("AWS Emulator exited before it started")
	// ErrStartTimeout is an emulator that didn't print its startup line within Options.StartTimeout, so it was
	// killed. Releases before 1.0.290 print a different line, so they always end here.
	ErrStartTimeout = errors.New("AWS Emulator didn't print its startup line in time")
	// ErrFile is a file the startup line named that couldn't be read, or lacks what it should hold (the region, the
	// keys, a certificate), so the emulator was stopped.
	ErrFile = errors.New("could not read a file of AWS Emulator")
)

// Options are how to start the emulator. The zero value of each field is its default.
type Options struct {
	// Binary is the emulator's executable, a path or a name looked up on PATH: DefaultBinary by default.
	Binary string
	// IdleTimeout is how long the emulator runs without an API call before it exits on its own (--idle-timeout,
	// rounded up to whole seconds), so one whose process died before calling Stop doesn't run forever:
	// DefaultIdleTimeout by default.
	IdleTimeout time.Duration
	// StartTimeout is how long to wait for the startup line, after which the emulator is killed:
	// DefaultStartTimeout by default.
	StartTimeout time.Duration
}

// Credentials are an emulator run's keys, which requests are signed with, since authentication is on.
type Credentials struct {
	AccessKeyID     string
	SecretAccessKey string
}

// Emulator is a running emulator, and what a client needs to reach it.
type Emulator struct {
	// Endpoint is where it serves every AWS API, such as https://127.0.0.1:43085.
	Endpoint string
	// Region is the region of its config file.
	Region      string
	Credentials Credentials
	// CA is its certificate authority, as PEM.
	CA []byte
	// CAFile is the path of the same certificate authority, for a client that only takes a file. It is deleted when
	// the emulator stops.
	CAFile string

	cmd      *exec.Cmd
	exited   <-chan struct{}
	client   *http.Client
	stopOnce sync.Once
}

// HTTPClient is a client that trusts the emulator's certificate authority, and no other, to pass to an AWS SDK
// client. Every call returns the same client.
func (e *Emulator) HTTPClient() *http.Client {
	return e.client
}

// Stop stops the emulator (SIGTERM), which deletes its files, and returns once it has exited. Calling it again, or
// after the emulator exited on its own, just waits for that exit.
func (e *Emulator) Stop() {
	e.stopOnce.Do(func() {
		// Fails only once it has exited
		_ = e.cmd.Process.Signal(syscall.SIGTERM)
	})
	<-e.exited
	e.client.CloseIdleConnections()
}

// startResult is the first of the emulator's startup line or its exit, sent in that order.
type startResult struct {
	line    startupLine
	exitErr error
	exited  bool
}

// Launch starts AWS Emulator on a free port of 127.0.0.1, with authentication on and telemetry off, and waits until
// it serves requests. Cancelling ctx only stops the start: once Launch returns, the emulator runs until Stop.
func Launch(ctx context.Context, options Options) (*Emulator, error) {
	binary := cmp.Or(options.Binary, DefaultBinary)
	startTimeout := cmp.Or(options.StartTimeout, DefaultStartTimeout)

	// Its lifetime is Stop's, not ctx's, which only bounds the start
	//nolint:gosec,noctx // The binary the caller chose, as a shell would run it
	cmd := exec.Command(binary, arguments(options)...)

	// One send from the output's watcher, one from the exit
	results := make(chan startResult, 2) //nolint:mnd // Counted above
	output := newWatcher(results)
	cmd.Stdout = writerFunc(output.writeStdout)
	cmd.Stderr = writerFunc(output.writeStderr)

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("%w %s: install it (%s), or set Options.Binary to its path: %w",
			ErrNotRun, binary, installPage, err)
	}

	exited := make(chan struct{})

	go func() {
		// Returns only once the output is written, so a startup line is always sent first
		err := cmd.Wait()
		results <- startResult{line: noStartupLine, exitErr: err, exited: true}

		close(exited)
	}()

	kill := func() {
		_ = cmd.Process.Kill()

		<-exited
	}

	timer := time.NewTimer(startTimeout)
	defer timer.Stop()

	select {
	case result := <-results:
		if result.exited {
			return nil, fmt.Errorf("%w: %w; its output:\n%s", ErrExited, result.exitErr, output.text())
		}

		emulator, err := newEmulator(result.line, cmd, exited)
		if err != nil {
			_ = cmd.Process.Signal(syscall.SIGTERM)

			<-exited

			return nil, err
		}

		return emulator, nil
	case <-timer.C:
		// It may be stuck, so it isn't asked to stop
		kill()

		return nil, fmt.Errorf("%w (%s), so it was killed: it needs version 1.0.290 or later (%s); its output:\n%s",
			ErrStartTimeout, startTimeout, installPage, output.text())
	case <-ctx.Done():
		kill()

		return nil, fmt.Errorf("start AWS Emulator: %w", context.Cause(ctx))
	}
}

// arguments are the emulator's command line arguments: a free port of the address its certificate covers, whatever
// EMULATOR_BIND_ADDRESS says; authentication on; an idle timeout, rounded up to whole seconds; and telemetry off,
// which always wins over EMULATOR_TELEMETRY and the config file, while on can't override them (aws-emulator --help).
func arguments(options Options) []string {
	idleSeconds := int(math.Ceil(cmp.Or(options.IdleTimeout, DefaultIdleTimeout).Seconds()))

	return []string{"-b", "127.0.0.1", "-p", "0", "-a", "on", "--idle-timeout", strconv.Itoa(idleSeconds), "-t", "off"}
}

// newEmulator reads the files a startup line names: the certificate authority, the config, and the keys beside it.
func newEmulator(line startupLine, cmd *exec.Cmd, exited <-chan struct{}) (*Emulator, error) {
	caPEM, err := readFile(line.CAFile)
	if err != nil {
		return nil, err
	}

	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("%w %s: it holds no certificate", ErrFile, line.CAFile)
	}

	region, err := iniValue(line.ConfigFile, "region")
	if err != nil {
		return nil, err
	}

	credentialsFile := filepath.Join(filepath.Dir(line.ConfigFile), "emulator_credentials")

	accessKeyID, err := iniValue(credentialsFile, "aws_access_key_id")
	if err != nil {
		return nil, err
	}

	secretAccessKey, err := iniValue(credentialsFile, "aws_secret_access_key")
	if err != nil {
		return nil, err
	}

	return &Emulator{
		Endpoint:    line.EndpointURL,
		Region:      region,
		Credentials: Credentials{AccessKeyID: accessKeyID, SecretAccessKey: secretAccessKey},
		CA:          caPEM,
		CAFile:      line.CAFile,
		cmd:         cmd,
		exited:      exited,
		client: &http.Client{ //nolint:exhaustruct_v5 // Options left out are the defaults
			Transport: &http.Transport{ //nolint:exhaustruct_v5 // Options left out are the defaults
				TLSClientConfig: &tls.Config{ //nolint:exhaustruct_v5 // Options left out are the defaults
					RootCAs:    roots,
					MinVersion: tls.VersionTLS12,
				},
				ForceAttemptHTTP2: true,
			},
		},
		stopOnce: sync.Once{},
	}, nil
}

// readFile reads a file the startup line named.
func readFile(path string) ([]byte, error) {
	data, err := os.ReadFile(path) //nolint:gosec // A file the emulator named
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFile, err)
	}

	return data, nil
}

// iniValue reads one value of an AWS config or credentials file.
func iniValue(path, key string) (string, error) {
	data, err := readFile(path)
	if err != nil {
		return "", err
	}

	value := parseINI(data)[key]
	if value == "" {
		return "", fmt.Errorf("%w %s: it has no %s", ErrFile, path, key)
	}

	return value, nil
}

// writerFunc is a function as an io.Writer.
type writerFunc func(p []byte) (int, error)

func (f writerFunc) Write(p []byte) (int, error) {
	return f(p)
}

// watcher reads the emulator's output for its startup line, and keeps it until then, for an error to show. After
// that the output is still read, so the emulator never blocks on a full pipe, but dropped.
type watcher struct {
	mu          sync.Mutex
	output      bytes.Buffer
	partialLine []byte
	// keepStdout and keepStderr are where each stream goes: scanned and kept until the startup line, then dropped
	keepStdout func(p []byte)
	keepStderr func(p []byte)
	results    chan<- startResult
}

func newWatcher(results chan<- startResult) *watcher {
	watching := &watcher{ //nolint:exhaustruct_v5 // Set below, as they refer to it
		results: results,
	}
	watching.keepStdout = watching.scan
	watching.keepStderr = func(chunk []byte) { watching.output.Write(chunk) }

	return watching
}

func (w *watcher) writeStdout(chunk []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.keepStdout(chunk)

	return len(chunk), nil
}

func (w *watcher) writeStderr(chunk []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.keepStderr(chunk)

	return len(chunk), nil
}

// scan keeps a chunk of standard output, and sends the startup line once it is complete.
func (w *watcher) scan(p []byte) {
	w.output.Write(p)
	w.partialLine = append(w.partialLine, p...)

	for {
		line, rest, found := bytes.Cut(w.partialLine, []byte("\n"))
		if !found {
			return
		}

		w.partialLine = rest

		if startup, ok := parseStartupLine(line); ok {
			drop := func([]byte) {}
			w.keepStdout = drop
			w.keepStderr = drop

			w.results <- startResult{line: startup, exitErr: nil, exited: false}

			return
		}
	}
}

// text is the output kept so far.
func (w *watcher) text() string {
	w.mu.Lock()
	defer w.mu.Unlock()

	return w.output.String()
}
