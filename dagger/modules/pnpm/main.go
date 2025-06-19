package main

import (
	"dagger/pnpm/internal/dagger"
	"path"
	"strings"
)

type Pnpm struct {
	// Version to use
	Version string
}

func New(
	// Version to use
	pnpmVersion string,
) *Pnpm {
	return &Pnpm{
		Version: pnpmVersion,
	}
}

var nodeVersion = "24.2.0"
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

	pnpmContainer := m.PnpmContainer().
		WithMountedDirectory(".", dag.Directory())

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
		WithMountedFile("package.json", source.File(path.Join(projectDir, "package.json"))).
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
	pnpmBaseDir := pnpmAttached.Directory(".")

	pnpmAttached = pnpmAttached.
		WithMountedDirectory(".", output.WithoutDirectory("**/node_modules")).
		WithDirectory(".", pnpmBaseDir)

	for _, dependencyProjectDir := range dependencyProjectDirs {
		pnpmAttached = pnpmAttached.WithMountedFile(
			path.Join(dependencyProjectDir, "package.json"),
			m.reformatPackageJson(source, dependencyProjectDir),
		)
	}

	pnpmAttached = pnpmAttached.
		WithMountedDirectory(projectDir, projectSource.WithoutFile(".npmignore")).
		WithWorkdir(projectDir).
		WithMountedFile("package.json", m.reformatPackageJson(source, projectDir)).
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
	ctr := m.PnpmContainer().
		WithDirectory(
			".",
			source,
			dagger.ContainerWithDirectoryOpts{
				Include: []string{".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs"},
			},
		).
		WithMountedDirectory(
			projectDir,
			projectOutput,
		)

	for _, dependencyDir := range directDependencyProjectDirs {
		pkgJsonPath := path.Join(dependencyDir, "package.json")
		ctr = ctr.WithMountedFile(
			pkgJsonPath,
			output.File(pkgJsonPath),
		)
	}

	tarballFilename := "dagger.tgz"
	deployDirectory := "deploy"
	packageDirectory := path.Join(deployDirectory, "package")
	return ctr.
		WithWorkdir(projectDir).
		WithMountedFile(".npmignore", projectSource.File(".npmignore")).
		WithExec([]string{"pnpm", "pack", "--out", tarballFilename}).
		WithExec([]string{"mkdir", deployDirectory}).
		WithMountedDirectory(packageDirectory, dag.Directory()).
		WithExec([]string{"tar", "xvf", tarballFilename, "-C", deployDirectory}).
		Directory(packageDirectory)
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
	pnpmBaseDir := pnpmAttached.Directory(".")

	pnpmAttached = pnpmAttached.
		WithMountedDirectory(".", output.WithoutDirectory("**/node_modules")).
		WithDirectory(".", pnpmBaseDir)

	pnpmAttached = pnpmAttached.
		WithMountedDirectory(projectDir, projectOutput.WithoutDirectory("node_modules")).
		WithWorkdir(projectDir).
		WithMountedFile(".npmignore", projectSource.File(".npmignore")).
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
