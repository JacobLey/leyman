package main

import (
	"context"
	"dagger/node-deploy/internal/dagger"
	"nxexecutor"
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

// Replaces projectDir with "deploy"ed version.
// Meaning all dev dependencies and npmignore-ed files are stripped out.
// This directory is now safe to consume by other packages or execute.
// Proxies call to pnpm module.
func (m *NodeDeploy) Run(
	ctx context.Context,
	source *dagger.Directory,
	output *dagger.Directory,
	projectDir string,
	dependencyDirs []string,
) *dagger.Directory {

	return m.pnpm().DeployPackage(
		source,
		output,
		projectDir,
		dependencyDirs,
	)
}

var _ nxexecutor.NxExecutorRun[dagger.Directory] = &NodeDeploy{}
