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
