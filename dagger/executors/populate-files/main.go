package main

import (
	"context"
	"dagger/populate-files/internal/dagger"
)

type PopulateFiles struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *PopulateFiles {
	return &PopulateFiles{
		NodeVersion: nodeVersion,
	}
}

func (m *PopulateFiles) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Executes load-populate-files on projectDir, ensuring that generated files are both up to date
// and properly checked into version control.
func (m *PopulateFiles) CI(
	ctx context.Context,
	// +ignore=["*","!biome.json"]
	source *dagger.Directory,
	projectDir string,
	projectOutput *dagger.Directory,
) error {

	nodeContainer := m.node().NodeContainer()

	nodeContainer = nodeContainer.
		WithMountedDirectory(
			projectDir,
			projectOutput,
		).
		WithMountedFile(
			"biome.json",
			source.File("biome.json"),
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{"load-populate-files", "--filePath", "./dist/file-content.js"})

	_, err := nodeContainer.Sync(ctx)

	return err
}
