module github.com/JacobLey/leyman/apps/populate-files/go

go 1.26

require github.com/JacobLey/leyman/tools/generated-signature/go v0.1.0

// The workspace copy, so a change to it is tested here before it is released. A consumer ignores
// this, and fetches the required (released) version
replace github.com/JacobLey/leyman/tools/generated-signature/go => ../../../tools/generated-signature/go
