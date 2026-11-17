---
description: The Go implementation of aws-emulator-launch, which starts AWS Emulator the same way for Go tests.
---

# Go

aws-emulator-launch has a Go implementation, which takes the same options and returns the same things as the TypeScript package. It needs Go 1.24 or later, and has no dependencies outside the standard library.

```sh
go get github.com/JacobLey/leyman/tools/aws-emulator-launch/go@latest
```

```go
import awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"

emulator, err := awsemulator.Launch(context.Background(), awsemulator.Options{})
if err != nil {
	return err
}
defer emulator.Stop()

client := dynamodb.New(dynamodb.Options{
	BaseEndpoint: aws.String(emulator.Endpoint),
	Region:       emulator.Region,
	Credentials: credentials.NewStaticCredentialsProvider(
		emulator.Credentials.AccessKeyID, emulator.Credentials.SecretAccessKey, ""),
	HTTPClient: emulator.HTTPClient(),
})
```

`HTTPClient()` returns a client that trusts the emulator's certificate authority and no other. Cancelling the context passed to `Launch` stops the start, but not an emulator that already started, which runs until `Stop`. `Stop` kills an emulator still running after `StopTimeout` (10 seconds by default). Errors match with `errors.Is`: `ErrNotRun`, `ErrExited`, `ErrStartTimeout`, `ErrFile` and `ErrOption`.

The full API is in the [README](https://github.com/JacobLey/leyman/tree/main/tools/aws-emulator-launch/go), and versions are in its [changelog](https://github.com/JacobLey/leyman/blob/main/tools/aws-emulator-launch/go/CHANGELOG.md).
