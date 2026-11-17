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
	github.com/JacobLey/leyman/apps/genever/go v0.0.0 // indirect
	github.com/JacobLey/leyman/apps/populate-files/go v0.2.0 // indirect
	github.com/JacobLey/leyman/tools/generated-signature/go v0.1.0 // indirect
	go.yaml.in/yaml/v3 v3.0.6 // indirect
)

tool github.com/JacobLey/leyman/apps/genever/go/cmd/genever
