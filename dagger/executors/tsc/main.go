package main

import (
	"dagger/tsc/internal/dagger"
	"path"
)

type Tsc struct {
	// Node version to use
	NodeVersion string
}

func New(
	// Node version to use
	nodeVersion string,
) *Tsc {
	return &Tsc{
		NodeVersion: nodeVersion,
	}
}

func (m *Tsc) node() *dagger.Node {
	return dag.Node(m.NodeVersion)
}

// Generates a /dist directory in projectDir that contains the generated .d.ts and .js files
// Performs type checking as well, and will fail if types are invalid.
func (m *Tsc) Run(
	// +ignore=["*", "!.swcrc.jsonc", "!tsconfig.build.json", "!**/tsconfig.json"]
	source *dagger.Directory,
	projectDir string,
	projectOutput *dagger.Directory,
	directDependencyDirs []string,
) *dagger.Directory {

	nodeContainer := m.node().NodeContainer()

	for _, dir := range directDependencyDirs {
		pathToTsConfig := path.Join(dir, "tsconfig.json")
		nodeContainer = nodeContainer.
			WithFile(
				pathToTsConfig,
				source.File(pathToTsConfig),
			)
	}

	nodeContainer = nodeContainer.
		WithFile(
			"tsconfig.build.json",
			source.File("tsconfig.build.json"),
		).
		WithDirectory(projectDir, projectOutput).
		WithWorkdir(projectDir).
		// Guarantee directory exists, in case no files get populated
		WithDirectory("dist", dag.Directory()).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	typedContainer := nodeContainer.WithExec([]string{"tsc"}).WithoutFile("dist/tsconfig.tsbuildinfo")

	swcContainer := nodeContainer.WithFile(".swcrc", source.File(".swcrc.jsonc"))
	jsContainer := swcContainer.
		WithExec([]string{"bash", "-c", "swc ./src -d ./dist --config-file .swcrc --strip-leading-paths --only '**/*.ts?(x)'"})
	mjsContainer := swcContainer.
		WithExec([]string{"bash", "-c", "swc ./src -d ./dist --config-file .swcrc --strip-leading-paths --only '**/*.mts?(x)' --out-file-extension mjs"})
	cjsContainer := swcContainer.
		WithExec([]string{"bash", "-c", "swc ./src -d ./dist --config-file .swcrc --strip-leading-paths -C module.type=commonjs -C module.ignoreDynamic=true -C module.exportInteropAnnotation=true --only '**/*.cts?(x)' --out-file-extension cjs"})

	dist := typedContainer.
		WithDirectory(
			"dist-js",
			jsContainer.Directory("dist"),
		).
		WithExec([]string{"cp", "-rT", "./dist-js", "./dist"}).
		WithDirectory(
			"dist-mjs",
			mjsContainer.Directory("dist"),
		).
		WithExec([]string{"cp", "-rT", "./dist-mjs", "./dist"}).
		WithDirectory(
			"dist-cjs",
			cjsContainer.Directory("dist"),
		).
		WithExec([]string{"cp", "-rT", "./dist-cjs", "./dist"}).
		Directory("dist")

	return projectOutput.WithDirectory("dist", dist)
}
