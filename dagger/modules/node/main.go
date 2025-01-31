// A generated module for PnpmInstall functions
//
// This module has been generated via dagger init and serves as a reference to
// basic module structure as you get started with Dagger.
//
// Two functions have been pre-created. You can modify, delete, or add to them,
// as needed. They demonstrate usage of arguments and return types using simple
// echo and grep commands. The functions can be called from the dagger CLI or
// from one of the SDKs.
//
// The first line in this comment block is a short description line and the
// rest is a long description with more detail on the module's purpose or usage,
// if appropriate. All modules should have a short description.

package main

import (
	"dagger/node/internal/dagger"
)

type Node struct {
	// Version to use
	Version string
}

func New(
	// Version to use
	version string,
) *Node {
	return &Node{
		Version: version,
	}
}

// Installs node on the provided executable
func (m *Node) InstallNode(container *dagger.Container) *dagger.Container {
	nodeContainer := dag.Debian().BaseContainer().
		WithEnvVariable("NVM_DIR", "$HOME/.nvm", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		// Download Nvm
		WithExec([]string{"apt-get", "install", "curl", "-y"}).
		WithExec([]string{"bash", "-c", "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash"}).
		WithExec([]string{"bash", "-c", ". $NVM_DIR/nvm.sh && nvm install " + m.Version + " && nvm use " + m.Version}, dagger.ContainerWithExecOpts{Expand: true}).
		WithEnvVariable("PATH", "${HOME}/.nvm/versions/node/v"+m.Version+"/bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		// Remove npm
		WithExec([]string{"npm", "uninstall", "-g", "npm"})

	return container.
		WithEnvVariable("PATH", "${HOME}/.nvm/versions/node/v"+m.Version+"/bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithEnvVariable("PATH", "node_modules/bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithDirectory(
			"${HOME}/.nvm/versions/node/v"+m.Version,
			nodeContainer.Directory("${HOME}/.nvm/versions/node/v"+m.Version, dagger.ContainerDirectoryOpts{Expand: true}),
			dagger.ContainerWithDirectoryOpts{Expand: true},
		)
}

// Provide a default container with node installed
func (m *Node) NodeContainer() *dagger.Container {
	return m.InstallNode(
		dag.Debian().BaseContainer(),
	)
}
