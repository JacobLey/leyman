package main

import (
	"context"
	"dagger/node-install/internal/dagger"
	"nxexecutor"
)

type NodeInstall struct {
	// Node version to use
	NodeVersion string
	PnpmVersion string
}

func New(
	// Node version to use
	nodeVersion string,
	// Pnpm version to use
	pnpmVersion string,
) *NodeInstall {
	return &NodeInstall{
		NodeVersion: nodeVersion,
		PnpmVersion: pnpmVersion,
	}
}

func (m *NodeInstall) pnpm() *dagger.Pnpm {
	return dag.Pnpm(m.PnpmVersion, m.NodeVersion)
}

// Adds node_modules directory to projectDir, with all dependencies installed.
// Local dependencies are fully installed, rather than synlinked, to ensure only
// production dependencies are copied over.
// Proxies call to pnpm module.
func (m *NodeInstall) Run(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) *dagger.Directory {

	return m.pnpm().InstallPackage(
		source,
		output,
		projectDir,
		dependencyDirs,
	)
}

var _ nxexecutor.NxExecutorRun[dagger.Directory] = &NodeInstall{}
