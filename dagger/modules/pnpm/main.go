package main

import (
	"dagger/pnpm/internal/dagger"
	"path"
	"strings"
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
var versionPrefix = "0.0.0-DAGGERDEV"

// Install PNPM onto the provided container
func (m *Pnpm) InstallPnpm(container *dagger.Container) *dagger.Container {

	pnpmHome := "${HOME}/.local/share/pnpm"

	pnpmContainer := dag.Debian().
		BaseContainer().
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

// Provide a generic container with pnpm installed
func (m *Pnpm) PnpmContainer() *dagger.Container {
	return m.InstallPnpm(
		dag.Debian().BaseContainer(),
	)
}

// Returns a pnpm container with pre-populated store attached
func (m *Pnpm) attachPnpmStore(
	source *dagger.Directory,
) *dagger.Container {

	pnpmContainer := m.PnpmContainer()

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

// Update versioning to a "prerelease" so workspace specifiers _only_ match local, and
// remove specifiers _only_ match remote.
// Omitting this can result in funky peer-dependency resolution.
func (m *Pnpm) reformatPackageJson(
	source *dagger.Directory,
	projectDir string,
) *dagger.File {
	return dag.Node(nodeVersion).
		NodeContainer().
		WithFile("package.json", source.File(path.Join(projectDir, "package.json"))).
		// Revert all local packages to 0 so remote packages never prefer them
		WithExec([]string{
			"node",
			"-e",
			strings.Join(
				[]string{
					"const { readFile, writeFile } = await import('node:fs/promises')",
					"const packageJson = JSON.parse(await readFile('./package.json', 'utf8'))",
					"const version0 = { ...packageJson, version: `" + versionPrefix + "${packageJson.version}` }",
					"await writeFile('./package.json', JSON.stringify(version0, null, 2) + '\\n')",
				},
				";",
			),
		}).
		File("package.json")
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
			Exclude: []string{"**/node_modules", "**/package.json"},
			Include: dependencyProjectDirs,
		},
	)

	for _, dependencyProjectDir := range dependencyProjectDirs {
		pnpmAttached = pnpmAttached.WithFile(
			path.Join(dependencyProjectDir, "package.json"),
			m.reformatPackageJson(source, dependencyProjectDir),
		)
	}

	pnpmAttached = pnpmAttached.
		WithDirectory(projectDir, projectSource, dagger.ContainerWithDirectoryOpts{Exclude: []string{".npmignore", "package.json"}}).
		WithWorkdir(projectDir).
		WithFile("package.json", m.reformatPackageJson(source, projectDir)).
		WithExec([]string{"pnpm", "deploy", "--prefer-offline", "--filter", ".", "./deploy"})

	return pnpmAttached.Directory("deploy")
}

// Returns a production "packed"ed version of workspace.
// All npmignore-d files will be omitted, and package.json will be rewritten without workspace/catalog references
func (m *Pnpm) RepackPackage(
	// +ignore=["*", "!.npmrc", "!.pnpmfile.cjs", "!pnpm-lock.yaml", "!pnpm-workspace.yaml"]
	source *dagger.Directory,
	// +ignore=["*", "package.json"]
	output *dagger.Directory,
	projectDir string,
	// +ignore=["*", "!.npmignore"]
	projectSource *dagger.Directory,
	projectOutput *dagger.Directory,
	directDependencyProjectDirs []string,
) *dagger.Directory {

	tarballFilename := "dagger.tgz"
	deployDirectory := "deploy"
	packageJsonPaths := make([]string, len(directDependencyProjectDirs))
	for i, dependencyDir := range directDependencyProjectDirs {
		packageJsonPaths[i] = path.Join(dependencyDir, "package.json")
	}

	return m.PnpmContainer().
		WithDirectory(
			".",
			source,
			dagger.ContainerWithDirectoryOpts{
				Include: []string{".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"},
			},
		).
		WithDirectory(
			".",
			output,
			dagger.ContainerWithDirectoryOpts{
				Include: packageJsonPaths,
			},
		).
		WithDirectory(
			projectDir,
			projectOutput,
			dagger.ContainerWithDirectoryOpts{
				Exclude: []string{"node_modules", "!node_modules/*"},
			},
		).
		WithWorkdir(projectDir).
		WithFile(".npmignore", projectSource.File(".npmignore")).
		WithExec([]string{"pnpm", "pack", "--out", tarballFilename}).
		WithExec([]string{"mkdir", deployDirectory}).
		WithExec([]string{"tar", "xvf", tarballFilename, "-C", deployDirectory}).
		Directory(path.Join(deployDirectory, "package"))
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
		WithExec([]string{"pnpm", "deploy", "--filter", ".", "--prod", "./deploy"})

	return pnpmAttached.Directory("deploy")
}

// Undoes the "reformatting" of package.jsons during install/deploy
func (m *Pnpm) RestoreVersions(
	output *dagger.Directory,
	projectDirs []string,
) *dagger.Directory {

	result := output
	container := dag.Debian().BaseContainer()

	for _, projectDir := range projectDirs {
		packageJsonPath := path.Join(projectDir, "package.json")
		formattedPackageJson := container.
			WithFile("package.json", output.File(packageJsonPath)).
			WithExec([]string{
				"sed",
				"-i",
				"s/" + versionPrefix + "//g",
				"./package.json",
			}).
			File("package.json")

		result = result.WithFile(
			packageJsonPath,
			formattedPackageJson,
		)
	}

	return result
}
