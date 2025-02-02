package main

import (
	"context"
	"dagger/biome/internal/dagger"
	"nxexecutor"
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
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
	directDependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer().
		WithDirectory(
			projectDir,
			output.Directory(projectDir),
		).
		WithFiles(
			".",
			[]*dagger.File{
				source.File(".gitignore"),
				source.File("biome.json"),
			},
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.WithExec([]string{"biome", "format", "."}).Sync(ctx)
	return err
}

var _ nxexecutor.NxExecutorCI[dagger.Directory] = &Biome{}
