package main

import (
	"dagger/pnpm/internal/dagger"
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
				Include: []string{".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"},
			},
		).
		WithExec([]string{"pnpm", "fetch"})

	return pnpmContainer.
		WithDirectory(
			".",
			source,
			dagger.ContainerWithDirectoryOpts{
				Include: []string{".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"},
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
	// +ignore=["*", "!.npmrc", "!.pnpmfile.cjs", "!pnpm-lock.yaml", "!pnpm-workspace.yaml"]
	source *dagger.Directory,
	// +ignore=["**/node_modules"]
	output *dagger.Directory,
	projectDir string,
	// +ignore=[".npmignore"]
	projectSource *dagger.Directory,
	dependencyProjectDirs []string,
) *dagger.Directory {

	pnpmAttached := m.attachPnpmStore(source)

	pnpmAttached = pnpmAttached.WithDirectory(
		".",
		output,
		dagger.ContainerWithDirectoryOpts{
			Exclude: []string{"**/node_modules"},
			Include: dependencyProjectDirs,
		},
	)

	pnpmAttached = pnpmAttached.
		WithDirectory(projectDir, projectSource, dagger.ContainerWithDirectoryOpts{Exclude: []string{".npmignore"}}).
		WithWorkdir(projectDir).
		WithExec([]string{"pnpm", "deploy", "--legacy", "--prefer-offline", "--filter", ".", "./deploy"})

	return pnpmAttached.Directory("deploy")
}

// Returns a production "deploy"ed version of workspace.
// All dev dependencies and npmignore-d files will be omitted
func (m *Pnpm) DeployPackage(
	// +ignore=["*", "!.npmrc", "!.pnpmfile.cjs", "!pnpm-lock.yaml", "!pnpm-workspace.yaml"]
	source *dagger.Directory,
	// +ignore=["**/node_modules"]
	output *dagger.Directory,
	projectDir string,
	// +ignore=["*", "!.npmignore"]
	projectSource *dagger.Directory,
	projectOutput *dagger.Directory,
	dependencyProjectDirs []string,
) *dagger.Directory {

	pnpmAttached := m.attachPnpmStore(source)

	pnpmAttached = pnpmAttached.WithDirectory(
		".",
		output,
		dagger.ContainerWithDirectoryOpts{
			Exclude: []string{"**/node_modules"},
			Include: dependencyProjectDirs,
		},
	)

	pnpmAttached = pnpmAttached.
		WithDirectory(projectDir, projectOutput, dagger.ContainerWithDirectoryOpts{Exclude: []string{"node_modules"}}).
		WithWorkdir(projectDir).
		WithFile(".npmignore", projectSource.File(".npmignore")).
		WithExec([]string{"pnpm", "deploy", "--legacy", "--filter", ".", "--prod", "./deploy"})

	return pnpmAttached.Directory("deploy")
}
