package nxexecutor

import (
	"context"
)

type NxExecutorRun[Directory any] interface {
	Run(
		ctx context.Context,
		source *Directory,
		output *Directory,
		projectDir string,
		dependencyDirs []string,
		directDepedencyDirs []string,
	) *Directory
}
type NxExecutorCI[Directory any] interface {
	CI(
		ctx context.Context,
		source *Directory,
		output *Directory,
		projectDir string,
		dependencyDirs []string,
		directDepedencyDirs []string,
	) error
}