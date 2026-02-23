package main

import (
	"dagger/debian/internal/dagger"
)

type Debian struct{}
type DebianOptions struct {
	Username string
}

func (m *Debian) DefaultVersion() string {
	return "13.3"
}

// Generate a default debian container, configured for this workspace
func (m *Debian) BaseContainer(
	// +optional
	username string,
	// +optional
	version string,
) *dagger.Container {
	if username == "" {
		username = "leyman"
	}
	if (version == "") {
		version = m.DefaultVersion()
	}
	return dag.Container().
		From("debian:"+version).
		WithEnvVariable("CI", "1").
		WithEnvVariable("USER", username).
		WithEnvVariable("HOME", "/home/$USER", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{"apt-get", "update"}).
		WithExec([]string{"apt-get", "upgrade", "-y"}).
		WithExec([]string{"apt-get", "install", "adduser", "-y"}).
		WithExec([]string{"adduser", "$USER"}, dagger.ContainerWithExecOpts{Expand: true}).
		WithWorkdir("/workspace")
}
