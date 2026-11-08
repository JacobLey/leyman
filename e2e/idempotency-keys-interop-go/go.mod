module github.com/JacobLey/leyman/e2e/idempotency-keys-interop-go

go 1.26

require (
	github.com/JacobLey/leyman/tools/idempotency-keys/go v0.0.0
	github.com/jackc/pgx/v5 v5.12.0
	github.com/valkey-io/valkey-go v1.0.79
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)

replace github.com/JacobLey/leyman/tools/idempotency-keys/go => ../../tools/idempotency-keys/go
