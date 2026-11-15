package awsemulator_test

import (
	"context"
	"fmt"
	"os"

	awsemulator "github.com/JacobLey/leyman/tools/aws-emulator-launch/go"
)

// An AWS SDK client takes the emulator's endpoint, region, keys and HTTP client. This one is DynamoDB's, from the AWS
// SDK for Go v2:
//
//	client := dynamodb.New(dynamodb.Options{
//		BaseEndpoint: aws.String(emulator.Endpoint),
//		Region:       emulator.Region,
//		Credentials: credentials.NewStaticCredentialsProvider(
//			emulator.Credentials.AccessKeyID, emulator.Credentials.SecretAccessKey, ""),
//		HTTPClient: emulator.HTTPClient(),
//	})
func ExampleLaunch() {
	emulator, err := awsemulator.Launch(context.Background(), awsemulator.Options{}) //nolint:exhaustruct_v5 // Defaults
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer emulator.Stop()

	fmt.Println(emulator.Region)
	// Output: us-east-1
}
