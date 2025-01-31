package main

import (
	"context"
	"dagger/eslint/internal/dagger"
	"nxexecutor"
)

type Eslint struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *Eslint {
	return &Eslint{
		NodeVersion: nodeVersion,
	}
}

func (m *Eslint) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Asserts that projectDir is passing linter config
func (m *Eslint) CI(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer()

	for _, dir := range dependencyDirs {
		nodeContainer = nodeContainer.WithDirectory(
			dir,
			output.Directory(dir),
		)
	}

	nodeContainer = nodeContainer.
		WithFile("tsconfig.build.json", source.File("tsconfig.build.json")).
		WithDirectory(
			projectDir,
			output.Directory(projectDir),
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{"eslint", "."})

	_, err := nodeContainer.Sync(ctx)

	return err
}

var _ nxexecutor.NxExecutorCI[dagger.Directory] = &Eslint{}
