package main

import (
	"context"
	"dagger/update-ts-references/internal/dagger"
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
	projectDir string,
	projectOutput *dagger.Directory,
	directDependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer().WithFile(
		"biome.json",
		source.File("biome.json"),
	)

	for _, dir := range directDependencyDirs {
		nodeContainer = nodeContainer.WithDirectory(
			dir,
			source.Directory(dir),
			dagger.ContainerWithDirectoryOpts{
				Include: []string{
					"package.json",
					"project.json",
					"tsconfig.json",
				},
			},
		)
	}

	_, err := nodeContainer.
		WithDirectory(projectDir, projectOutput).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{
			"nx-update-ts-references",
			"--ci",
		}).Sync(ctx)

	return err
}
