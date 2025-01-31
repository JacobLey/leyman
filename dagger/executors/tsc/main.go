package main

import (
	"context"
	"dagger/tsc/internal/dagger"
	"nxexecutor"
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
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) *dagger.Directory {

	nodeContainer := m.node().NodeContainer()
	built := output.Directory(projectDir)

	for _, dir := range dependencyDirs {
		pathToTsConfig := path.Join(dir, "tsconfig.json")
		nodeContainer = nodeContainer.
			WithDirectory(
				dir,
				output.Directory(dir),
			).
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
		WithDirectory(projectDir, built).
		WithWorkdir(projectDir).
		// Guarantee directory exists, in case no files get populated
		WithDirectory("dist", dag.Directory()).
		WithEnvVariable("PATH", "node_modules/.bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true})

	typedContainer := nodeContainer.WithExec([]string{"tsc"}).WithoutFile("dist/tsconfig.tsbuildinfo")
	jsContainer := nodeContainer.
		WithExec([]string{"bash", "-c", "swc ./src -d ./dist --config-file .swcrc --strip-leading-paths --only '**/*.ts?(x)'"})
	mjsContainer := nodeContainer.
		WithExec([]string{"bash", "-c", "swc ./src -d ./dist --config-file .swcrc --strip-leading-paths --only '**/*.mts?(x)' --out-file-extension mjs"})
	cjsContainer := nodeContainer.
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

	return built.WithDirectory("dist", dist)
}

var _ nxexecutor.NxExecutorRun[dagger.Directory] = &Tsc{}
