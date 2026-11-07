module github.com/JacobLey/leyman/apps/genever/go

go 1.26

require github.com/JacobLey/leyman/apps/genever/vectors v0.0.0

require go.yaml.in/yaml/v3 v3.0.6

// A workspace project, never fetched
replace github.com/JacobLey/leyman/apps/genever/vectors => ../vectors
