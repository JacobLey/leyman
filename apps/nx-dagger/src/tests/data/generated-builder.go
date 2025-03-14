// Code generated by nx-dagger. DO NOT EDIT.
package main

import (
	"dagger/monorepo-fn-builder/internal/dagger"

	"context"
	"errors"

	"golang.org/x/sync/errgroup"
)

type MonorepoFnBuilder struct {
	// Root of source file
	Source *dagger.Directory
}

func New(
	// Root of source file
	source *dagger.Directory,
) *MonorepoFnBuilder {
	return &MonorepoFnBuilder{
		Source: source,
	}
}

type NxProjectRuntime string

const (
	_runtime_node NxProjectRuntime = "node"
)

type NxProjectDir string

const (
	_project_a NxProjectDir = "path/to/a"
	_project_b NxProjectDir = "path/to/b"
	_project_c NxProjectDir = "path/to/c"
)

type NxTarget string

const (
	_target_test NxTarget = "test"
	_target_tsc  NxTarget = "tsc"
)

type NxProject struct {
	runtime                     NxProjectRuntime
	dependencyProjectDirs       []NxProjectDir
	directDependencyProjectDirs []NxProjectDir
	targets                     []NxTarget
}

var nxConfig = map[NxProjectDir]NxProject{
	_project_a: {
		runtime:                     _runtime_node,
		dependencyProjectDirs:       []NxProjectDir{},
		directDependencyProjectDirs: []NxProjectDir{},
		targets: []NxTarget{
			_target_tsc,
			_target_test,
		},
	},
	_project_b: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_a,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_a,
		},
		targets: []NxTarget{
			_target_tsc,
		},
	},
	_project_c: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_a,
			_project_b,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_b,
		},
		targets: []NxTarget{
			_target_test,
		},
	},
}

// List all project directories, filtered by runtime
// Empty string results in all project directories
func (m *MonorepoFnBuilder) ProjectDirs(runtime string) []string {

	results := []string{}

	for projectDir, config := range nxConfig {
		if runtime == "" || runtime == string(config.runtime) {
			results = append(results, string(projectDir))
		}
	}

	return results
}

type ProjectConfig struct {
	Runtime                     string
	DependencyProjectDirs       []string
	DirectDependencyProjectDirs []string
	Targets                     []string
}

// Load config settings for the provided project directory
func (m *MonorepoFnBuilder) ProjectConfig(projectDir string) ProjectConfig {

	config := nxConfig[NxProjectDir(projectDir)]
	stringDependencyProjectDirs := make([]string, len(config.dependencyProjectDirs))
	stringDirectDependencyProjectDirs := make([]string, len(config.directDependencyProjectDirs))
	stringTargets := make([]string, len(config.targets))

	for i, dependencyProjectDir := range config.dependencyProjectDirs {
		stringDependencyProjectDirs[i] = string(dependencyProjectDir)
	}
	for i, directDependencyProjectDir := range config.directDependencyProjectDirs {
		stringDirectDependencyProjectDirs[i] = string(directDependencyProjectDir)
	}
	for i, target := range config.targets {
		stringTargets[i] = string(target)
	}

	return ProjectConfig{
		Runtime:                     string(config.runtime),
		DependencyProjectDirs:       stringDependencyProjectDirs,
		DirectDependencyProjectDirs: stringDirectDependencyProjectDirs,
		Targets:                     stringTargets,
	}
}

func (m *MonorepoFnBuilder) BuildProject(
	ctx context.Context,
	projectDirStr string,
	dependencyDirectories []*dagger.Directory,
	barArg int,
	fooArg string,
) (*dagger.Directory, error) {

	projectDir := NxProjectDir(projectDirStr)
	dependencyProjectDirs := make([]string, len(nxConfig[projectDir].dependencyProjectDirs))
	directDependencyProjectDirs := make([]string, len(nxConfig[projectDir].directDependencyProjectDirs))
	output := dag.Directory()
	for i, directoryName := range nxConfig[projectDir].dependencyProjectDirs {
		dependencyProjectDirs[i] = string(directoryName)
		output = output.WithDirectory(string(directoryName), dependencyDirectories[i])
	}
	for i, directory := range nxConfig[projectDir].directDependencyProjectDirs {
		directDependencyProjectDirs[i] = string(directory)
	}
	projectSource := m.Source.Directory(string(projectDir))

	var built *dagger.Directory
	switch nxConfig[projectDir].runtime {
	case _runtime_node:
		built = dag.NodeInstall(
			fooArg,
		).Run()
	default:
		return nil, errors.New("No matching runtime: " + string(nxConfig[projectDir].runtime))
	}

	ciErrors, cancelCtx := errgroup.WithContext(ctx)

	for _, target := range nxConfig[projectDir].targets {

		switch target {
		case _target_test:
			ciErrors.Go(func() error {
				return dag.Test(
					fooArg,
					barArg,
				).Ci(
					cancelCtx,
					string(projectDir),
					dependencyProjectDirs,
				)
			})
		case _target_tsc:
			built = dag.Tsc(
				fooArg,
			).Run(
				projectSource,
				built,
				directDependencyProjectDirs,
			)
		default:
			return nil, errors.New("No matching target executor: " + string(target))
		}
	}

	if err := ciErrors.Wait(); err != nil {
		return nil, err
	}

	switch nxConfig[projectDir].runtime {
	case _runtime_node:
		built = dag.NodeDeploy(
			barArg,
		).Run(
			m.Source,
			output,
		)
	default:
		return nil, errors.New("No matching runtime: " + string(nxConfig[projectDir].runtime))
	}

	return built, nil
}
