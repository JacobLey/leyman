package main

import (
	"context"
	"dagger/populate-static/internal/dagger"
	"nxexecutor"
)

type PopulateStatic struct{}

type FileMap struct {
	OriginalName string
	CopiedName   string
}

// Copies generic files from source over to project dir
// so they do not have to be explicitly maintained on a per-project level
func (m *PopulateStatic) Run(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) *dagger.Directory {

	copyDir := output.Directory(projectDir)
	fileMap := []FileMap{
		{
			OriginalName: ".swcrc.jsonc",
			CopiedName: ".swcrc",
		},
	}

	for _, fileMap := range fileMap {
		copyDir = copyDir.WithFile(
			fileMap.CopiedName,
			source.File(fileMap.OriginalName),
		)
	}
	return copyDir
}

var _ nxexecutor.NxExecutorRun[dagger.Directory] = &PopulateStatic{}