package main

import (
	"context"
	"dagger/mocha-c-8/internal/dagger"
	"path"
	"strings"
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
	// +ignore=["*","!biome.json","!pnpm-lock.yaml","!pnpm-workspace.yaml","!**/package.json","!**/project.json","!**/tsconfig.json"]
	source *dagger.Directory,
	projectDir string,
	projectOutput *dagger.Directory,
	directDependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer()

	if projectDir == "apps/pnpm-dedicated-lockfile" {
		nodeContainer = nodeContainer.WithFiles(
			".",
			[]*dagger.File{source.File("pnpm-lock.yaml"), source.File("pnpm-workspace.yaml")},
		)
	} else if projectDir == "apps/nx-update-ts-references" {
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
			})
	}

	nodeContainer = nodeContainer.
		WithDirectory(
			projectDir,
			projectOutput,
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	_, err := nodeContainer.
		WithExec([]string{"c8", "mocha", "--recursive", "./dist/tests/{unit,integration}/**/*.spec.*js"}).
		Sync(ctx)
	return err
}
