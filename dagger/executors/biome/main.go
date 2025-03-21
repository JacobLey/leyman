package main

import (
	"context"
	"dagger/biome/internal/dagger"
)

type Biome struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *Biome {
	return &Biome{
		NodeVersion: nodeVersion,
	}
}

func (m *Biome) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Asserts that projectDir is formatted according to biome configuration.
func (m *Biome) CI(
	ctx context.Context,
	// +ignore=["*","!.gitignore","!biome.json"]
	source *dagger.Directory,
	projectDir string,
	projectOutput *dagger.Directory,
) error {

	nodeContainer := m.node().NodeContainer().
		WithMountedDirectory(
			projectDir,
			projectOutput,
		).
		WithMountedFile(
			"biome.json",
			source.File("biome.json"),
		).
		WithMountedFile(
			".gitignore",
			source.File(".gitignore"),
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.WithExec([]string{"biome", "format", "."}).Sync(ctx)
	return err
}
