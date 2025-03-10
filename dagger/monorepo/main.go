// Code generated by nx-dagger. DO NOT EDIT.
package main

import (
	"dagger/monorepo/internal/dagger"

	"context"
	"sync"
)

type Monorepo struct {
	// Root of source file
	Source *dagger.Directory
}

func New(
	// Root of source file
	// Ignore needs to mirror .gitignore
	// +ignore=[".git","**/*.log*","**/.DS_Store","**/node_modules",".pnpm-store","**/.eslintcache","**/coverage","**/dist","**/.pnpm-lock-hash","**/.swcrc",".nx","dagger/**/.gitattributes","dagger/**/dagger.gen.go","dagger/**/internal"]
	source *dagger.Directory,
) *Monorepo {
	return &Monorepo{
		Source: dag.Directory().WithDirectory(
			".",
			source,
			dagger.DirectoryWithDirectoryOpts{
				Exclude: []string{
					".git",
					"**/*.log*",
					"**/.DS_Store",
					"**/node_modules",
					".pnpm-store",
					"**/.eslintcache",
					"**/coverage",
					"**/dist",
					"**/.pnpm-lock-hash",
					"**/.swcrc",
					".nx",
					"dagger/**/.gitattributes",
					"dagger/**/dagger.gen.go",
					"dagger/**/internal",
				},
			},
		),
	}
}

// List all project directories, filtered by runtime
// Empty string results in all project directories
func (m *Monorepo) ProjectDirs(
	ctx context.Context,
	runtime string,
) ([]string, error) {

	return dag.MonorepoBuilder(m.Source).ProjectDirs(ctx, runtime)
}

// Execute Nx targets over all projects in dependency order
// and return the fully built monorepo directory
func (m *Monorepo) Build(
	ctx context.Context,
	goLangVersion string,
	nodeVersion string,
	pnpmVersion string,
) (*dagger.Directory, error) {

	type builtProject struct {
		once      *sync.Once
		directory *dagger.Directory
	}
	mapMutex := sync.RWMutex{}
	builtProjects := map[string]builtProject{}
	waitGroup := sync.WaitGroup{}
	projectDirs, projectDirsErr := dag.MonorepoBuilder(m.Source).ProjectDirs(ctx, "")
	if projectDirsErr != nil {
		return nil, projectDirsErr
	}
	for _, projectDir := range projectDirs {
		builtProjects[projectDir] = builtProject{
			once: &sync.Once{},
		}
		waitGroup.Add(1)
	}

	var buildError error
	var triggerProjectBuild func(projectDir string)
	var triggerProjectBuildGroup func(projectDir string)
	triggerProjectBuild = func(projectDir string) {

		monorepoBuilder := dag.MonorepoBuilder(m.Source)

		projectConfig := monorepoBuilder.ProjectConfig(projectDir)
		dependencyDirNames, dependencyProjectDirErr := projectConfig.DependencyProjectDirs(ctx)
		if dependencyProjectDirErr != nil {
			buildError = dependencyProjectDirErr
			return
		}

		outputDirectories := make([]*dagger.Directory, len(dependencyDirNames))
		for i, dependencyProjectDir := range dependencyDirNames {
			// Syncronously wait for each dependency to build,
			// because top-level has already kicked off each project
			triggerProjectBuildGroup(dependencyProjectDir)
			if buildError != nil {
				return
			}
			mapMutex.RLock()
			outputDirectories[i] = builtProjects[dependencyProjectDir].directory
			mapMutex.RUnlock()
		}

		if buildError != nil {
			return
		}

		directory := monorepoBuilder.BuildProject(
			projectDir,
			outputDirectories,
			goLangVersion,
			nodeVersion,
			pnpmVersion,
		)

		mapMutex.Lock()
		defer mapMutex.Unlock()
		project := builtProjects[projectDir]
		project.directory = directory
		builtProjects[projectDir] = project
	}
	triggerProjectBuildGroup = func(projectDir string) {
		mapMutex.RLock()
		projectOnce := builtProjects[projectDir].once
		mapMutex.RUnlock()
		// Only run project build once, reporting wait/error groups
		projectOnce.Do(func() {
			defer waitGroup.Done()
			triggerProjectBuild(projectDir)
		})
	}

	for _, projectDir := range projectDirs {
		// kick off building for each project
		triggerProjectBuildGroup(projectDir)
	}

	waitGroup.Wait()
	if buildError != nil {
		return nil, buildError
	}

	response := dag.Directory()
	for projectDir, project := range builtProjects {
		response = response.WithDirectory(
			projectDir,
			project.directory,
		)
	}

	return response, nil
}
