// Code generated by nx-dagger. DO NOT EDIT.
package main

import (
	"dagger/directory/internal/dagger"

	"context"
	"errors"
	"sync"

	"golang.org/x/sync/errgroup"
)

type MonorepoFn struct {
	// Root of source file
	Source *dagger.Directory
}

func New(
	// Root of source file
	// Ignore needs to mirror .gitignore
	// +ignore=["ignore","stuff/**","!allowed"]
	source *dagger.Directory,
) *MonorepoFn {
	return &MonorepoFn{
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
	_target_build NxTarget = "build"
	_target_test  NxTarget = "test"
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
			_target_build,
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
			_target_build,
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

// Execute Nx targets over all projects in dependency order
// and return the fully built monorepo directory
func (m *MonorepoFn) Build(
	ctx context.Context,
	barArg int,
	fooArg string,
) (*dagger.Directory, error) {

	type builtProject struct {
		once      *sync.Once
		directory *dagger.Directory
	}
	builtProjects := map[NxProjectDir]builtProject{}
	waitGroup := sync.WaitGroup{}
	var buildError error
	for projectDir := range nxConfig {
		builtProjects[projectDir] = builtProject{
			once: &sync.Once{},
		}
		waitGroup.Add(1)
	}

	var triggerProjectBuild func(projectDir NxProjectDir) error
	var triggerProjectBuildGroup func(projectDir NxProjectDir)
	triggerProjectBuild = func(projectDir NxProjectDir) error {

		projectConfig := nxConfig[projectDir]
		dependencyDirs := make(map[NxProjectDir]*dagger.Directory, len(projectConfig.dependencyProjectDirs))

		for _, dependencyProjectDir := range projectConfig.dependencyProjectDirs {
			// Syncronously wait for each dependency to build,
			// because top-level has already kicked off each project
			triggerProjectBuildGroup(dependencyProjectDir)
			if buildError != nil {
				return buildError
			}
			dependencyDirs[dependencyProjectDir] = builtProjects[dependencyProjectDir].directory
		}

		directory, err := m.buildProject(
			ctx,
			barArg,
			fooArg,
			projectDir,
			dependencyDirs,
		)
		if err != nil {
			if buildError == nil {
				// Not very concerned with race condition.
				// So long as _some_ early error gets flagged
				buildError = err
			}
		} else {
			project := builtProjects[projectDir]
			project.directory = directory
			builtProjects[projectDir] = project
		}
		return nil
	}
	triggerProjectBuildGroup = func(projectDir NxProjectDir) {
		// Only run project build once, reporting wait/error groups
		builtProjects[projectDir].once.Do(func() {
			defer waitGroup.Done()
			triggerProjectBuild(projectDir)
		})
	}

	for projectDir := range nxConfig {
		// Asyncronously kick off building for each project
		go triggerProjectBuildGroup(projectDir)
	}

	waitGroup.Wait()
	if buildError != nil {
		return nil, buildError
	}

	response := dag.Directory()
	for projectDir, project := range builtProjects {
		response = response.WithDirectory(
			string(projectDir),
			project.directory,
		)
	}

	return response, nil
}

func (m *MonorepoFn) buildProject(
	ctx context.Context,
	barArg int,
	fooArg string,
	projectDir NxProjectDir,
	dependencyDirectories map[NxProjectDir]*dagger.Directory,
) (*dagger.Directory, error) {

	dependencyProjectDirs := make([]string, len(nxConfig[projectDir].dependencyProjectDirs))
	directDependencyProjectDirs := make([]string, len(nxConfig[projectDir].directDependencyProjectDirs))

	output := dag.Directory()

	for i, directory := range nxConfig[projectDir].dependencyProjectDirs {
		dependencyProjectDirs[i] = string(directory)
		output = output.WithDirectory(string(directory), dependencyDirectories[directory])
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

	ciErrors := errgroup.Group{}

	for _, target := range nxConfig[projectDir].targets {

		switch target {
		case _target_build:
			built = dag.Tsc(
				fooArg,
			).Run(
				projectSource,
				built,
				directDependencyProjectDirs,
			)
		case _target_test:
			ciErrors.Go(func() error {
				return dag.Test(
					fooArg,
					barArg,
				).Ci(
					ctx,
					string(projectDir),
					dependencyProjectDirs,
				)
			})
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
