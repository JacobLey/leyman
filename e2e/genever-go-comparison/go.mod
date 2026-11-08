module github.com/JacobLey/leyman/e2e/genever-go-comparison

go 1.26

require (
	github.com/JacobLey/leyman/apps/genever/go v0.0.0-00010101000000-000000000000
	github.com/atombender/go-jsonschema v0.24.1
	github.com/getkin/kin-openapi v0.152.0
	github.com/oapi-codegen/oapi-codegen/v2 v2.8.2
)

require (
	dario.cat/mergo v1.0.2 // indirect
	github.com/JacobLey/leyman/apps/populate-files/go v0.1.0 // indirect
	github.com/JacobLey/leyman/tools/generated-signature/go v0.1.0 // indirect
	github.com/dprotaso/go-yit v0.0.0-20220510233725-9ba8df137936 // indirect
	github.com/go-openapi/jsonpointer v0.23.1 // indirect
	github.com/go-openapi/swag/jsonname v0.26.0 // indirect
	github.com/goccy/go-yaml v1.19.2 // indirect
	github.com/google/go-cmp v0.7.0 // indirect
	github.com/mitchellh/go-wordwrap v1.0.1 // indirect
	github.com/oasdiff/yaml v0.1.1 // indirect
	github.com/oasdiff/yaml3 v0.0.14 // indirect
	github.com/sanity-io/litter v1.5.8 // indirect
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.3 // indirect
	github.com/sosodev/duration v1.4.0 // indirect
	github.com/speakeasy-api/jsonpath v0.6.3 // indirect
	github.com/speakeasy-api/openapi v1.24.0 // indirect
	github.com/vmware-labs/yaml-jsonpath v0.3.2 // indirect
	go.yaml.in/yaml/v3 v3.0.6 // indirect
	golang.org/x/mod v0.38.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	golang.org/x/tools v0.48.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace (
	github.com/JacobLey/leyman/apps/genever/go => ../../apps/genever/go
	github.com/JacobLey/leyman/apps/populate-files/go => ../../apps/populate-files/go
	github.com/JacobLey/leyman/tools/generated-signature/go => ../../tools/generated-signature/go
)
