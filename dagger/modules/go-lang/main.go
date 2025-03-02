package main

import (
	"dagger/golang/internal/dagger"
)

type GoLang struct {
	// Version to use
	Version string
}

func New(
	// Version to use
	version string,
) *GoLang {
	return &GoLang{
		Version: version,
	}
}

// Installs golang on the provided executable
func (m *GoLang) InstallGo(container *dagger.Container) *dagger.Container {
	goContainer := dag.Debian().BaseContainer().
		WithExec([]string{"apt-get", "install", "wget", "-y"}).
		WithExec([]string{"wget", "https://dl.google.com/go/go" + m.Version + ".linux-arm64.tar.gz", "-O", "/tmp/go.tar.gz"}).
		WithExec([]string{"tar", "-C", "$HOME", "-xzf", "/tmp/go.tar.gz"}, dagger.ContainerWithExecOpts{Expand: true})

	return container.
		WithEnvVariable("PATH", "${HOME}/go/bin:${PATH}", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithDirectory(
			"${HOME}/go",
			goContainer.Directory("${HOME}/go", dagger.ContainerDirectoryOpts{Expand: true}),
			dagger.ContainerWithDirectoryOpts{Expand: true},
		)
}

// Provide a default container with golang installed
func (m *GoLang) GoLangContainer() *dagger.Container {
	return m.InstallGo(
		dag.Debian().BaseContainer(),
	)
}
