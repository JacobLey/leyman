package main

import (
	"context"
	"dagger/update-ts-references/internal/dagger"
	"nxexecutor"
)

type UpdateTsReferences struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *UpdateTsReferences {
	return &UpdateTsReferences{
		NodeVersion: nodeVersion,
	}
}

func (m *UpdateTsReferences) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Ensure that all tsconfig.json files have their dependencies field up to date.
func (m *UpdateTsReferences) CI(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
	directDependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer().WithFile(
		"biome.json",
		source.File("biome.json"),
	)

	for _, dir := range directDependencyDirs {
		nodeContainer = nodeContainer.WithDirectory(
			dir,
			output.Directory(dir),
			dagger.ContainerWithDirectoryOpts{
				Include: []string{
					"package.json",
					"project.json",
					"tsconfig.build.json",
				},
			},
		)
	}

	_, err := nodeContainer.
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{
			"nx-update-ts-references",
			"--ci",
		}).Sync(ctx)

	return err
}

var _ nxexecutor.NxExecutorCI[dagger.Directory] = &UpdateTsReferences{}
