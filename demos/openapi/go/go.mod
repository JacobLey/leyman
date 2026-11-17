module github.com/JacobLey/leyman/demos/openapi/go

go 1.26

// Workspace projects, never fetched
replace (
	github.com/JacobLey/leyman/apps/genever/go => ../../../apps/genever/go
	github.com/JacobLey/leyman/apps/populate-files/go => ../../../apps/populate-files/go
	github.com/JacobLey/leyman/demos/openapi/spec => ../spec
	github.com/JacobLey/leyman/tools/generated-signature/go => ../../../tools/generated-signature/go
	github.com/JacobLey/leyman/tools/idempotency-keys/go => ../../../tools/idempotency-keys/go
)

require (
	github.com/JacobLey/leyman/demos/openapi/spec v0.0.0
	github.com/JacobLey/leyman/tools/idempotency-keys/go v0.0.0
	github.com/jackc/pgx/v5 v5.12.0
	github.com/lestrrat-go/jwx/v3 v3.4.0
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.3
	golang.org/x/text v0.41.0
)

require (
	github.com/JacobLey/leyman/apps/genever/go v0.0.0 // indirect
	github.com/JacobLey/leyman/apps/populate-files/go v0.2.0 // indirect
	github.com/JacobLey/leyman/tools/generated-signature/go v0.1.0 // indirect
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.4.1 // indirect
	github.com/goccy/go-json v0.11.2 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	github.com/lestrrat-go/blackmagic v1.0.4 // indirect
	github.com/lestrrat-go/dsig v1.4.0 // indirect
	github.com/lestrrat-go/dsig-secp256k1 v1.0.0 // indirect
	github.com/lestrrat-go/httpcc v1.0.1 // indirect
	github.com/lestrrat-go/httprc/v3 v3.0.6 // indirect
	github.com/lestrrat-go/option/v2 v2.0.0 // indirect
	github.com/segmentio/asm v1.2.1 // indirect
	github.com/valyala/fastjson v1.6.10 // indirect
	go.yaml.in/yaml/v3 v3.0.6 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
)

tool github.com/JacobLey/leyman/apps/genever/go/cmd/genever
