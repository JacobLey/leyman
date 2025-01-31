package main

import (
	"context"
	"dagger/pnpm/internal/dagger"
	"path"
)

type Pnpm struct {
	// Version to use
	Version string
	// Node version to use
	NodeVersion string
}

func New(
	// Version to use
	pnpmVersion string,
	// Node version to use
	nodeVersion string,
) *Pnpm {
	return &Pnpm{
		Version:     pnpmVersion,
		NodeVersion: nodeVersion,
	}
}

func (m *Pnpm) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Provide a generic container with pnpm installed
func (m *Pnpm) pnpmContainer() *dagger.Container {
	return m.installPnpm(
		m.node().NodeContainer(),
	)
}

// Install PNPM onto the provided container
func (m *Pnpm) installPnpm(container *dagger.Container) *dagger.Container {

	pnpmHome := "${HOME}/.local/share/pnpm"

	pnpmContainer := m.node().
		NodeContainer().
		WithExec([]string{"apt-get", "install", "curl", "-y"}).
		WithEnvVariable("PNPM_HOME", pnpmHome, dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithEnvVariable("PATH", "${PNPM_HOME}:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithEnvVariable("PNPM_VERSION", m.Version).
		WithExec(
			[]string{"bash", "-c", "curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=$PNPM_VERSION SHELL=bash sh -"},
			dagger.ContainerWithExecOpts{Expand: true},
		)

	return container.
		WithEnvVariable("PNPM_HOME", pnpmHome, dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithEnvVariable("PATH", "${PNPM_HOME}:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithDirectory(
			pnpmHome,
			pnpmContainer.Directory(
				pnpmHome,
				dagger.ContainerDirectoryOpts{Expand: true},
			),
			dagger.ContainerWithDirectoryOpts{Expand: true},
		)
}

// Returns a pnpm container with pre-populated store attached
func (m *Pnpm) attachPnpmStore(
	source *dagger.Directory,
) *dagger.Container {

	pnpmContainer := m.pnpmContainer()

	fetchedContainer := pnpmContainer.
		WithDirectory(
			".",
			source,
			dagger.ContainerWithDirectoryOpts{
				Include: []string{".npmrc", "pnpm-lock.yaml"},
			},
		).
		WithExec([]string{"pnpm", "fetch"})

	return pnpmContainer.
		WithDirectory(
			".",
			source,
			dagger.ContainerWithDirectoryOpts{
				Include: []string{".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml"},
			},
		).
		WithDirectory(
			".pnpm-store",
			fetchedContainer.Directory(".pnpm-store"),
		)
}

// Install dependencies for a single projectDir.
// Actually does a "deploy" without npmignore, which means local dependencies are properly installed
// in node_modules rather than as symlinks.
func (m *Pnpm) InstallPackage(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyProjectDirs []string,
) *dagger.Directory {

	pnpmAttached := m.attachPnpmStore(source)

	for _, dependencyProjectDir := range dependencyProjectDirs {
		pnpmAttached = pnpmAttached.WithDirectory(
			dependencyProjectDir,
			output.Directory(dependencyProjectDir),
		)
	}

	pnpmAttached = pnpmAttached.
		WithFile(".pnpmfile.cjs", source.File(".pnpmfile.cjs")).
		WithDirectory(projectDir, source.Directory(projectDir), dagger.ContainerWithDirectoryOpts{Exclude: []string{".npmignore"}}).
		WithWorkdir(projectDir).
		WithExec([]string{"pnpm", "deploy", "--prefer-offline", "--filter", ".", "./deploy"})

	return pnpmAttached.Directory("deploy")
}

// Returns a production "deploy"ed version of workspace.
// All dev dependencies and npmignore-d files will be omitted
func (m *Pnpm) DeployPackage(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyProjectDirs []string,
) *dagger.Directory {

	pnpmAttached := m.attachPnpmStore(source)

	for _, dependencyProjectDir := range dependencyProjectDirs {
		pnpmAttached = pnpmAttached.WithDirectory(
			dependencyProjectDir,
			output.Directory(dependencyProjectDir),
		)
	}

	pnpmAttached = pnpmAttached.
		WithDirectory(projectDir, output.Directory(projectDir)).
		WithWorkdir(projectDir).
		WithFile(".npmignore", source.File(path.Join(projectDir, ".npmignore"))).
		WithExec([]string{"pnpm", "deploy", "--filter", ".", "--prod", "./deploy"})

	return pnpmAttached.Directory("deploy")
}
