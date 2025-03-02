package main

import (
	"dagger/node-deploy/internal/dagger"
	"slices"
)

type NodeDeploy struct {
	// Node version to use
	NodeVersion string
	PnpmVersion string
}

func New(
	// Node version to use
	nodeVersion string,
	// Pnpm version to use
	pnpmVersion string,
) *NodeDeploy {
	return &NodeDeploy{
		NodeVersion: nodeVersion,
		PnpmVersion: pnpmVersion,
	}
}

func (m *NodeDeploy) pnpm() *dagger.Pnpm {
	return dag.Pnpm(m.PnpmVersion, m.NodeVersion)
}

// Packages that actually get deployed (.npmignore applied by pnpm)
var deployedPackages = []string{}

// Replaces projectDir with "deploy"ed version.
// Meaning all dev dependencies and npmignore-ed files are stripped out.
// This directory is now safe to consume by other packages or execute.
// Proxies call to pnpm module.
func (m *NodeDeploy) Run(
	// +ignore=["*", "!.npmrc", "!.pnpmfile.cjs", "!pnpm-lock.yaml", "!pnpm-workspace.yaml"]
	source *dagger.Directory,
	// +ignore=["**/node_modules"]
	output *dagger.Directory,
	projectDir string,
	// +ignore=["*", "!.npmignore"]
	projectSource *dagger.Directory,
	// +ignore=["node_modules"]
	projectOutput *dagger.Directory,
	dependencyProjectDirs []string,
	directDependencyProjectDirs []string,
) *dagger.Directory {

	if slices.Contains(deployedPackages, projectDir) {
		return m.pnpm().DeployPackage(
			source,
			output,
			projectDir,
			projectSource,
			projectOutput,
			dependencyProjectDirs,
		)
	}

	return m.pnpm().RepackPackage(
		source,
		output,
		projectDir,
		projectSource,
		projectOutput,
		directDependencyProjectDirs,
	)
}
