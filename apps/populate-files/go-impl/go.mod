module github.com/JacobLey/leyman/apps/populate-files/go-impl

go 1.26

require (
	github.com/JacobLey/leyman/apps/populate-files/test-vectors v0.0.0
	github.com/JacobLey/leyman/tools/generated-signature/go v0.0.0
)

// Workspace projects, never fetched
replace (
	github.com/JacobLey/leyman/apps/populate-files/test-vectors => ../test-vectors
	github.com/JacobLey/leyman/tools/generated-signature/go => ../../../tools/generated-signature/go
	github.com/JacobLey/leyman/tools/generated-signature/test-vectors => ../../../tools/generated-signature/test-vectors
)
