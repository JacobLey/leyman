package main

import (
	"dagger/debian/internal/dagger"
)

type Debian struct{}

var debianVersion = "12.9"

// Generate a default debian container, configured for this workspace
func (m *Debian) BaseContainer() *dagger.Container {
	return dag.Container().
		From("debian:"+debianVersion).
		WithEnvVariable("USER", "leyman").
		WithEnvVariable("HOME", "/home/$USER", dagger.ContainerWithEnvVariableOpts{Expand: true}).
		WithExec([]string{"adduser", "$USER"}, dagger.ContainerWithExecOpts{Expand: true}).
		WithExec([]string{"apt-get", "update"}).
		WithExec([]string{"apt-get", "upgrade", "-y"}).
		WithWorkdir("/workspace")
}
