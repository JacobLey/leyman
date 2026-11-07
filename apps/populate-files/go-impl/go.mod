module github.com/JacobLey/leyman/apps/populate-files/go-impl

go 1.26

require (
	github.com/JacobLey/leyman/apps/populate-files/test-vectors v0.0.0-00010101000000-000000000000
	github.com/JacobLey/leyman/tools/generated-signature/go-impl v0.0.0
)

// Workspace projects, never fetched
replace (
	github.com/JacobLey/leyman/apps/populate-files/test-vectors => ../test-vectors
	github.com/JacobLey/leyman/tools/generated-signature/go-impl => ../../../tools/generated-signature/go-impl
	github.com/JacobLey/leyman/tools/generated-signature/test-vectors => ../../../tools/generated-signature/test-vectors
)
