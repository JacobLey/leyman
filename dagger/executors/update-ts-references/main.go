package main

import (
	"context"
	"dagger/update-ts-references/internal/dagger"
	"path"
	"strings"
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
	// +ignore=["*","!biome.json","!pnpm-lock.yaml","!pnpm-workspace.yaml","!**/package.json","!**/project.json","!**/tsconfig.json"]
	source *dagger.Directory,
	projectDir string,
	projectOutput *dagger.Directory,
	directDependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer()

	files := []string{"biome.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"}
	for _, dir := range directDependencyDirs {
		files = append(
			files,
			path.Join(dir, "package.json"),
			path.Join(dir, "project.json"),
			path.Join(dir, "tsconfig.json"),
		)
	}
	nodeContainer = nodeContainer.
		WithDirectory(
			".",
			source,
			dagger.ContainerWithDirectoryOpts{
				Include: files,
			},
		).
		WithExec([]string{
			"bash",
			"-c",
			strings.Join(
				[]string{
					"echo {} > nx.json",
					"echo {} > package.json",
					"mkdir ./node_modules",
					"echo {} > ./node_modules/.modules.yaml",
				},
				" && ",
			),
		}).
		WithDirectory(projectDir, projectOutput).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.
		WithExec([]string{
			"update-ts-references",
			"--ci",
		}).
		Sync(ctx)

	return err
}
