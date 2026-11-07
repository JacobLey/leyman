module github.com/JacobLey/leyman/apps/genever/go

go 1.26

require (
	github.com/JacobLey/leyman/apps/genever/vectors v0.0.0
	github.com/JacobLey/leyman/apps/populate-files/go-impl v0.0.0
	github.com/JacobLey/leyman/tools/generated-signature/go-impl v0.0.0
)

require go.yaml.in/yaml/v3 v3.0.6

// Workspace projects, never fetched
replace (
	github.com/JacobLey/leyman/apps/genever/vectors => ../vectors
	github.com/JacobLey/leyman/apps/populate-files/go-impl => ../../populate-files/go-impl
	github.com/JacobLey/leyman/apps/populate-files/test-vectors => ../../populate-files/test-vectors
	github.com/JacobLey/leyman/tools/generated-signature/go-impl => ../../../tools/generated-signature/go-impl
	github.com/JacobLey/leyman/tools/generated-signature/test-vectors => ../../../tools/generated-signature/test-vectors
)
