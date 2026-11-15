# aws-emulator-launch-go

Starts [AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html) for Go tests, on a free port, and returns its endpoint, credentials and certificate authority. It is the Go implementation of [aws-emulator-launch](../), and starts the emulator the same way as the [TypeScript package](../ts/).

```sh
go get github.com/JacobLey/leyman/tools/aws-emulator-launch/go@latest
```

It needs Go 1.24 or later, and AWS Emulator 1.0.290 or later, installed as AWS describes. It has no dependencies outside the standard library. Versions are listed in the [changelog](./CHANGELOG.md).

```go
import awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"

func TestMain(m *testing.M) {
	emulator, err := awsemulator.Launch(context.Background(), awsemulator.Options{})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	client := dynamodb.New(dynamodb.Options{
		BaseEndpoint: aws.String(emulator.Endpoint),
		Region:       emulator.Region,
		Credentials: credentials.NewStaticCredentialsProvider(
			emulator.Credentials.AccessKeyID, emulator.Credentials.SecretAccessKey, ""),
		HTTPClient: emulator.HTTPClient(),
	})
	// ...

	code := m.Run()
	emulator.Stop()
	os.Exit(code)
}
```

`Launch` runs the emulator on a free port (`-p 0`) of 127.0.0.1 (`-b 127.0.0.1`, the address its certificate covers), authentication on (`-a on`), an idle timeout, and telemetry off (`-t off`), and returns once it has logged the line that says it serves requests. Telemetry has no option, since `-t on` can't override `EMULATOR_TELEMETRY` or the emulator's config file anyway: to run the emulator with telemetry, start it from its own command line instead. Cancelling its context stops the start, but not an emulator that already started, which runs until `Stop`.

| `Options` field | Default          | Description                                                                                             |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| `Binary`        | `"aws-emulator"` | The emulator's executable, a path or a name looked up on `PATH`.                                        |
| `IdleTimeout`   | 10 minutes       | How long the emulator runs without an API call before it exits on its own, rounded up to whole seconds. |
| `StartTimeout`  | 10 seconds       | How long to wait for the startup line before killing the emulator.                                      |

An `*Emulator` has the `Endpoint`, the `Region` of its config file, the run's `Credentials`, and its certificate authority as PEM (`CA`) and as a file (`CAFile`, which the emulator deletes when it stops). `HTTPClient()` returns a client that trusts that certificate authority and no other. `Stop()` sends `SIGTERM`, which makes the emulator delete its files and exit, and returns once it has exited. Calling it again, or after the emulator exited on its own, only waits for that exit.

Errors match with `errors.Is`, and include the emulator's output where it wrote any:

| Error             | When                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrNotRun`       | The binary couldn't be run, most often because it isn't installed or isn't on `PATH`. The message links AWS's install guide.           |
| `ErrExited`       | The emulator exited before it started, for instance on an option it doesn't know.                                                      |
| `ErrStartTimeout` | No startup line within `StartTimeout`, so the emulator was killed. A release before 1.0.290 always ends here, and the message says so. |
| `ErrFile`         | A file the startup line names couldn't be read, or lacks the region, a key or a certificate. The emulator is stopped first.            |

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/aws-emulator-launch-go:verify
```

It has no `package.json`. The tests start the installed emulator, and fake ones (shell scripts) for the failures, so `go test ./...` also works directly where `aws-emulator` is on `PATH`.
