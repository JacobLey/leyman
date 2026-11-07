module github.com/JacobLey/leyman/apps/populate-files/go

go 1.26

require github.com/JacobLey/leyman/tools/generated-signature/go v0.0.0

// A workspace project, never fetched
replace github.com/JacobLey/leyman/tools/generated-signature/go => ../../../tools/generated-signature/go
