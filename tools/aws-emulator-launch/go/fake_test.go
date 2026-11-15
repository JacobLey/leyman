package awsemulator_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"maps"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"
)

const (
	fakeConfig = "[default]\nregion = eu-west-3\nendpoint_url = https://127.0.0.1:1234\ns3 =\n" +
		"  region = nested\nregion = later\n"
	//nolint:gosec // The fake emulator's keys
	fakeCredentials = "[default]\naws_access_key_id = EMULATORKEY\naws_secret_access_key = EMULATORSECRET\n"
)

// fakeCA is a certificate authority's certificate, as PEM, as the emulator writes one.
func fakeCA(t *testing.T) string {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	template := &x509.Certificate{ //nolint:exhaustruct_v5 // Fields left out are the defaults
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "fake-ca"}, //nolint:exhaustruct_v5 // Only its name
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}

	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Headers: nil, Bytes: der}))
}

// fakes is a directory of fake emulators, each a shell script, and the files they name. The tests that write them
// don't run in parallel: a script written while another test forks can't be run until that child execs, since it
// inherited the open file (ETXTBSY, https://github.com/golang/go/issues/22315).
type fakes struct {
	t   *testing.T
	dir string
	ca  string
}

func newFakes(t *testing.T) fakes {
	t.Helper()

	return fakes{t: t, dir: t.TempDir(), ca: fakeCA(t)}
}

// write writes a fake emulator, which gets the arguments the real one would.
func (f fakes) write(name, body string) string {
	f.t.Helper()

	path := filepath.Join(f.dir, name)
	//nolint:gosec // A script to run, so executable
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		f.t.Fatal(err)
	}

	return path
}

// writeFiles writes the files a real emulator would (config, keys and certificate authority) in a directory of their
// own, each replaced by the text given, and returns the startup line naming them.
func (f fakes) writeFiles(name string, replaced map[string]string) string {
	f.t.Helper()

	dir := filepath.Join(f.dir, name+"-files")
	if err := os.Mkdir(dir, 0o700); err != nil {
		f.t.Fatal(err)
	}

	files := map[string]string{"config": fakeConfig, "emulator_credentials": fakeCredentials, "ca.pem": f.ca}
	maps.Copy(files, replaced)

	for file, text := range files {
		if err := os.WriteFile(filepath.Join(dir, file), []byte(text), 0o600); err != nil {
			f.t.Fatal(err)
		}
	}

	line, err := json.Marshal(map[string]any{
		"timestamp": "2026-11-15T00:00:00.000000Z",
		"level":     "INFO",
		"fields": map[string]string{
			"message":              "emulator server information",
			"endpoint_url":         "https://127.0.0.1:1234",
			"health_check_url":     "https://127.0.0.1:1234/__admin/health",
			"config_file":          filepath.Join(dir, "config"),
			"ca_file":              filepath.Join(dir, "ca.pem"),
			"java_truststore_file": filepath.Join(dir, "truststore.p12"),
		},
		"target": "aws_emulator_server",
	})
	if err != nil {
		f.t.Fatal(err)
	}

	return string(line)
}

// serving writes a fake emulator that writes its arguments and process id, prints the lines given, then runs until
// stopped. It returns its path, and the files of its arguments and process id.
func (f fakes) serving(name string, lines ...string) (string, string, string) {
	f.t.Helper()

	argsFile := filepath.Join(f.dir, name+".args")
	pidFile := filepath.Join(f.dir, name+".pid")
	script := []string{"echo \"$@\" > " + shellQuote(argsFile), "echo $$ > " + shellQuote(pidFile)}

	for _, line := range lines {
		script = append(script, "echo "+shellQuote(line))
	}

	return f.write(name, strings.Join(append(script, "exec sleep 30"), "\n")), argsFile, pidFile
}

func shellQuote(text string) string {
	return "'" + strings.ReplaceAll(text, "'", `'\''`) + "'"
}

func readText(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path) //nolint:gosec // A file of the test's
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}

// isRunning is whether the process in a pid file still runs.
func isRunning(t *testing.T, pidFile string) bool {
	t.Helper()

	pid, err := strconv.Atoi(strings.TrimSpace(readText(t, pidFile)))
	if err != nil {
		t.Fatal(err)
	}

	return syscall.Kill(pid, 0) == nil
}

// options runs the binary given, with every other option's default.
func options(binary string) awsemulator.Options {
	return awsemulator.Options{Binary: binary, IdleTimeout: 0, StartTimeout: 0}
}

func launch(t *testing.T, options awsemulator.Options) *awsemulator.Emulator {
	t.Helper()

	emulator, err := awsemulator.Launch(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}

	return emulator
}

func TestLaunchReadsTheStartupLineAndTheFilesItNames(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	binary, _, _ := fake.serving("reads", fake.writeFiles("reads", nil))

	emulator := launch(t, options(binary))
	emulator.Stop()

	want := awsemulator.Credentials{AccessKeyID: "EMULATORKEY", SecretAccessKey: "EMULATORSECRET"}
	if emulator.Endpoint != "https://127.0.0.1:1234" || emulator.Region != "eu-west-3" ||
		emulator.Credentials != want || string(emulator.CA) != fake.ca ||
		emulator.CAFile != filepath.Join(fake.dir, "reads-files", "ca.pem") {
		t.Errorf("got %+v", emulator)
	}
}

func TestLaunchIgnoresEveryOtherLine(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	binary, _, _ := fake.serving("ignores",
		"This emulator collects usage and error telemetry",
		"",
		"null",
		`{"fields":null}`,
		`{"fields":"emulator server information"}`,
		`{"fields":{"message":"aws-emulator emulator starting"}}`,
		`{"fields":{"message":"emulator server information"}}`,
		`{"fields":{"message":"emulator server information","endpoint_url":"https://127.0.0.1:1"}}`,
		`{"fields":{"message":"emulator server information","endpoint_url":"https://127.0.0.1:1","config_file":"/c"}}`,
		fake.writeFiles("ignores", nil),
	)

	emulator := launch(t, options(binary))
	emulator.Stop()

	if emulator.Endpoint != "https://127.0.0.1:1234" {
		t.Errorf("got %s", emulator.Endpoint)
	}
}

func TestLaunchReadsAStartupLineWrittenInPieces(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	line := fake.writeFiles("pieces", nil)
	binary := fake.write("pieces", strings.Join([]string{
		"printf '%s' " + shellQuote(line[:20]),
		"sleep 0.1",
		"echo " + shellQuote(line[20:]),
		"exec sleep 30",
	}, "\n"))

	emulator := launch(t, options(binary))
	emulator.Stop()

	if emulator.Region != "eu-west-3" {
		t.Errorf("got %s", emulator.Region)
	}
}

func TestLaunchRunsOnAFreePortWithAuthenticationOnAndTelemetryOff(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	binary, argsFile, _ := fake.serving("defaults", fake.writeFiles("defaults", nil))

	launch(t, options(binary)).Stop()

	if args := readText(t, argsFile); args != "-b 127.0.0.1 -p 0 -a on --idle-timeout 600 -t off\n" {
		t.Errorf("got %q", args)
	}
}

func TestLaunchRoundsTheIdleTimeoutUp(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	binary, argsFile, _ := fake.serving("options", fake.writeFiles("options", nil))

	launch(t, awsemulator.Options{Binary: binary, IdleTimeout: 1500 * time.Millisecond, StartTimeout: 0}).Stop()

	if args := readText(t, argsFile); args != "-b 127.0.0.1 -p 0 -a on --idle-timeout 2 -t off\n" {
		t.Errorf("got %q", args)
	}
}

func TestStopWaitsUntilItHasExited(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	binary, _, pidFile := fake.serving("stops", fake.writeFiles("stops", nil))

	launch(t, options(binary)).Stop()

	if isRunning(t, pidFile) {
		t.Error("still running")
	}
}

func TestStopAgainOrAfterItExitedOnItsOwn(t *testing.T) { //nolint:paralleltest // See fakes
	fake := newFakes(t)
	binary := fake.write("exits", "echo "+shellQuote(fake.writeFiles("exits", nil)))

	emulator := launch(t, options(binary))
	emulator.Stop()
	emulator.Stop()
}

func TestLaunchFailsWhenTheBinaryIsMissing(t *testing.T) { //nolint:paralleltest // See fakes
	_, err := awsemulator.Launch(t.Context(), options(filepath.Join(t.TempDir(), "missing")))
	if !errors.Is(err, awsemulator.ErrNotRun) || !strings.Contains(err.Error(), "getting-started") {
		t.Errorf("got %v", err)
	}
}

func TestLaunchFailsWhenItExitsBeforeTheStartupLine(t *testing.T) { //nolint:paralleltest // See fakes
	binary := newFakes(t).write("crashes", "echo 'unknown option' >&2\nexit 3")

	_, err := awsemulator.Launch(t.Context(), options(binary))
	if !errors.Is(err, awsemulator.ErrExited) || !strings.Contains(err.Error(), "exit status 3") ||
		!strings.Contains(err.Error(), "unknown option") {
		t.Errorf("got %v", err)
	}
}

func TestLaunchKillsItWhenTheStartupLineNeverComes(t *testing.T) { //nolint:paralleltest // See fakes
	binary, _, pidFile := newFakes(t).serving("silent", `{"fields":{"message":"listening on 9297"}}`)

	_, err := awsemulator.Launch(t.Context(), awsemulator.Options{Binary: binary, IdleTimeout: 0, StartTimeout: 200 * time.Millisecond})
	if !errors.Is(err, awsemulator.ErrStartTimeout) || !strings.Contains(err.Error(), "1.0.290") ||
		!strings.Contains(err.Error(), "listening on 9297") {
		t.Errorf("got %v", err)
	}

	if isRunning(t, pidFile) {
		t.Error("still running")
	}
}

func TestLaunchKillsItWhenTheContextIsCancelled(t *testing.T) { //nolint:paralleltest // See fakes
	binary, _, pidFile := newFakes(t).serving("cancelled")
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := awsemulator.Launch(ctx, options(binary))
	if !errors.Is(err, context.Canceled) {
		t.Errorf("got %v", err)
	}

	// The script may not have written its pid before it was killed
	if _, statErr := os.Stat(pidFile); statErr == nil && isRunning(t, pidFile) {
		t.Error("still running")
	}
}

func TestLaunchStopsItWhenAFileIsMissingOrIncomplete(t *testing.T) { //nolint:paralleltest // See fakes
	tests := map[string]struct {
		files   map[string]string
		missing string
	}{
		"certificate authority missing": {files: nil, missing: "ca.pem"},
		"config missing":                {files: nil, missing: "config"},
		"keys missing":                  {files: nil, missing: "emulator_credentials"},
		"no certificate":                {files: map[string]string{"ca.pem": "not a certificate"}, missing: ""},
		"no region":                     {files: map[string]string{"config": "[default]\n"}, missing: ""},
		"no access key": {
			//nolint:gosec // A fake key
			files:   map[string]string{"emulator_credentials": "[default]\naws_secret_access_key = S\n"},
			missing: "",
		},
		"no secret key": {
			//nolint:gosec // A fake key
			files:   map[string]string{"emulator_credentials": "[default]\naws_access_key_id = K\n"},
			missing: "",
		},
	}

	for name, test := range tests { //nolint:paralleltest // See fakes
		t.Run(name, func(t *testing.T) {
			fake := newFakes(t)
			line := fake.writeFiles("files", test.files)

			if test.missing != "" {
				if err := os.Remove(filepath.Join(fake.dir, "files-files", test.missing)); err != nil {
					t.Fatal(err)
				}
			}

			binary, _, pidFile := fake.serving("files", line)

			_, err := awsemulator.Launch(t.Context(), options(binary))
			if !errors.Is(err, awsemulator.ErrFile) {
				t.Errorf("got %v", err)
			}

			if isRunning(t, pidFile) {
				t.Error("still running")
			}
		})
	}
}
