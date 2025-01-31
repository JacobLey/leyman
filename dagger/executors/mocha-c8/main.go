package main

import (
	"context"
	"dagger/mocha-c-8/internal/dagger"
	"nxexecutor"
)

type MochaC8 struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *MochaC8 {
	return &MochaC8{
		NodeVersion: nodeVersion,
	}
}

func (m *MochaC8) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Assert that all tests (both unit + integration) in projectDir are passing
// and achieves required code coverage.
func (m *MochaC8) CI(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer()

	if projectDir == "apps/pnpm-dedicated-lockfile" {
		nodeContainer = nodeContainer.WithFiles(
			".",
			[]*dagger.File{source.File("pnpm-lock.yaml"), source.File("pnpm-workspace.yaml")},
		)
	}

	nodeContainer = nodeContainer.
		WithDirectory(
			projectDir,
			output.Directory(projectDir),
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.
		WithExec([]string{"c8", "mocha", "--recursive", "./dist/tests/{unit,integration}/**/*.spec.*js"}).
		Sync(ctx)
	return err
}

var _ nxexecutor.NxExecutorCI[dagger.Directory] = &MochaC8{}
