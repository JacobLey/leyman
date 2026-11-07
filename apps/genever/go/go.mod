module github.com/JacobLey/leyman/apps/genever/go

go 1.24

require (
	github.com/JacobLey/leyman/apps/populate-files/go v0.1.0
	github.com/JacobLey/leyman/tools/generated-signature/go v0.1.0
)

require go.yaml.in/yaml/v3 v3.0.6

// The workspace copies, so a change to one is tested here before it is released. A consumer
// ignores these, and fetches the required (released) versions
replace (
	github.com/JacobLey/leyman/apps/populate-files/go => ../../populate-files/go
	github.com/JacobLey/leyman/tools/generated-signature/go => ../../../tools/generated-signature/go
)
