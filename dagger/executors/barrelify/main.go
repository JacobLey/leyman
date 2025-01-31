package main

import (
	"context"
	"dagger/barrelify/internal/dagger"
	"nxexecutor"
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
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer()

	nodeContainer = nodeContainer.
		WithDirectory(
			projectDir,
			output.Directory(projectDir),
		).
		WithFile(
			"biome.json",
			source.File("biome.json"),
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.WithExec([]string{"barrel"}).Sync(ctx)
	return err
}

var _ nxexecutor.NxExecutorCI[dagger.Directory] = &Barrelify{}
