package main

import (
	"context"
	"dagger/barrelify/internal/dagger"
)

type Barrelify struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *Barrelify {
	return &Barrelify{
		NodeVersion: nodeVersion,
	}
}

func (m *Barrelify) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Asserts that projectDir is properly barrel-ified.
// Meaning files are not only up to date, but also properly checked into version-control.
func (m *Barrelify) CI(
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
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.WithExec([]string{"barrel"}).Sync(ctx)
	return err
}
