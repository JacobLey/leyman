package main

import (
	"context"
	"dagger/eslint/internal/dagger"
	"path"
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
	// +ignore=["*","!tsconfig.build.json", "!**/tsconfig.json"]
	source *dagger.Directory,
	projectDir string,
	projectOutput *dagger.Directory,
	directDependencyDirs []string,
) error {

	nodeContainer := m.node().NodeContainer()

	for _, dir := range directDependencyDirs {
		cfgPath := path.Join(dir, "tsconfig.json")
		nodeContainer = nodeContainer.WithMountedFile(
			cfgPath,
			source.File(cfgPath),
		)
	}

	nodeContainer = nodeContainer.
		WithMountedFile("tsconfig.build.json", source.File("tsconfig.build.json")).
		WithMountedDirectory(
			projectDir,
			projectOutput,
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{"eslint", "."})

	_, err := nodeContainer.Sync(ctx)

	return err
}
