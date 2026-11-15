module github.com/JacobLey/leyman/tools/idempotency-keys/go

go 1.25.0

require (
	github.com/JacobLey/leyman/tools/aws-emulator-launch/go v0.1.0
	github.com/aws/aws-sdk-go-v2 v1.47.8
	github.com/aws/aws-sdk-go-v2/service/dynamodb v1.73.2
	github.com/aws/smithy-go v1.28.8
	github.com/jackc/pgx/v5 v5.12.0
	github.com/valkey-io/valkey-go v1.0.79
)

require (
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.5.11 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.8.11 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.24 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/endpoint-discovery v1.13.11 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)

replace github.com/JacobLey/leyman/tools/aws-emulator-launch/go => ../../aws-emulator-launch/go
