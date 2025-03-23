package main

import (
	"context"
	"dagger/mocha-c-8/internal/dagger"
	"path"
	"strings"
)

type MochaC8 struct {
	// GoLang version to use
	GoVersion string
	// Node version to use
	NodeVersion string
}

func New(
	// GoLang version to use
	goLangVersion string,
	// Node version to use
	nodeVersion string,
) *MochaC8 {
	return &MochaC8{
		GoVersion:   goLangVersion,
		NodeVersion: nodeVersion,
	}
}

func (m *MochaC8) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

var biomeFormattedPackages = map[string]bool{
	"apps/nx-dagger":                          true,
	"apps/nx-lifecycle":                       true,
	"apps/populate-files/load-populate-files": true,
	"apps/populate-files/populate-files":      true,
	"apps/nx-update-ts-references":            true,
	"tools/format-file":                       true,
}
var goFormattedPackages = map[string]bool{
	"apps/nx-dagger": true,
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

	if goFormattedPackages[projectDir] {
		nodeContainer = dag.GoLang(m.GoVersion).InstallGo(nodeContainer)
	}

	if projectDir == "apps/pnpm-dedicated-lockfile" {
		nodeContainer = nodeContainer.WithMountedFile(
			"pnpm-lock.yaml",
			source.File("pnpm-lock.yaml"),
		).WithMountedFile(
			"pnpm-workspace.yaml",
			source.File("pnpm-workspace.yaml"),
		)
	} else if projectDir == "apps/nx-update-ts-references" {
		files := []string{"pnpm-lock.yaml", "pnpm-workspace.yaml"}
		for _, dir := range directDependencyDirs {
			files = append(
				files,
				path.Join(dir, "package.json"),
				path.Join(dir, "project.json"),
				path.Join(dir, "tsconfig.json"),
			)
		}
		for _, file := range files {
			nodeContainer = nodeContainer.WithMountedFile(
				file,
				source.File(file),
			)
		}

		nodeContainer = nodeContainer.
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

	if biomeFormattedPackages[projectDir] {
		nodeContainer = nodeContainer.WithMountedFile(
			"biome.json",
			source.File("biome.json"),
		)
	}

	nodeContainer = nodeContainer.
		WithMountedDirectory(
			projectDir,
			projectOutput,
		).
		WithWorkdir(projectDir).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	if projectDir == "tools/named-patch" {
		nodeContainer = nodeContainer.
			WithExec([]string{"c8", "--clean=false", "--reporter=none", "mocha", "--recursive", "./dist/tests/unit/noop.spec.js"}).
			WithEnvVariable("NODE_OPTIONS", "-C patchable").
			WithExec([]string{"c8", "--clean=false", "--reporter=none", "mocha", "--recursive", "./dist/tests/unit/patch.spec.js"}).
			WithExec([]string{"c8", "report", "--all", "--check-coverage"})
	} else {
		nodeContainer = nodeContainer.
			WithExec([]string{"c8", "mocha", "--timeout", "5000", "--recursive", "./dist/tests/{unit,integration}/**/*.spec.*js"})
	}

	_, err := nodeContainer.Sync(ctx)
	return err
}
