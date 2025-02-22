// Code generated by nx-dagger. DO NOT EDIT.
package main

import (
	"dagger/monorepo/internal/dagger"

	"context"
	"errors"
	"sync"

	"golang.org/x/sync/errgroup"
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

type NxProjectRuntime string

const (
	_runtime_node NxProjectRuntime = "node"
)

type NxProjectDir string

const (
	_project_barrelify             NxProjectDir = "apps/barrelify"
	_project_commonProxy           NxProjectDir = "tools/common-proxy"
	_project_defaultImport         NxProjectDir = "tools/default-import"
	_project_entryScript           NxProjectDir = "tools/entry-script"
	_project_enumToArray           NxProjectDir = "tools/enum-to-array"
	_project_findImport            NxProjectDir = "tools/find-import"
	_project_formatFile            NxProjectDir = "tools/format-file"
	_project_haywire               NxProjectDir = "tools/haywire"
	_project_haywireLauncher       NxProjectDir = "tools/haywire-launcher"
	_project_isoCrypto             NxProjectDir = "tools/iso-crypto"
	_project_juniper               NxProjectDir = "apps/juniper"
	_project_leymanEslintConfig    NxProjectDir = "leyman/eslint-config"
	_project_loadPopulateFiles     NxProjectDir = "apps/populate-files/load-populate-files"
	_project_mochaChain            NxProjectDir = "tools/mocha-chain"
	_project_namedPatch            NxProjectDir = "tools/named-patch"
	_project_normalizedReactQuery  NxProjectDir = "tools/normalized-react-query"
	_project_nxDagger              NxProjectDir = "apps/nx-dagger"
	_project_nxLifecycle           NxProjectDir = "apps/nx-lifecycle"
	_project_nxPluginHandler       NxProjectDir = "tools/nx-plugin-handler"
	_project_nxUpdateTsReferences  NxProjectDir = "apps/nx-update-ts-references"
	_project_parseCwd              NxProjectDir = "tools/parse-cwd"
	_project_pnpmDedicatedLockfile NxProjectDir = "apps/pnpm-dedicated-lockfile"
	_project_populateFiles         NxProjectDir = "apps/populate-files/populate-files"
	_project_punycodeEsm           NxProjectDir = "tools/punycode-esm"
	_project_sinonTypedStub        NxProjectDir = "tools/sinon-typed-stub"
	_project_staticEmitter         NxProjectDir = "tools/static-emitter"
)

type NxTarget string

const (
	_target_barrelify          NxTarget = "barrelify"
	_target_biome              NxTarget = "biome"
	_target_eslint             NxTarget = "eslint"
	_target_mochaC8            NxTarget = "mocha-c8"
	_target_populateFiles      NxTarget = "populate-files"
	_target_tsc                NxTarget = "tsc"
	_target_updateTsReferences NxTarget = "update-ts-references"
)

type NxProject struct {
	runtime                     NxProjectRuntime
	dependencyProjectDirs       []NxProjectDir
	directDependencyProjectDirs []NxProjectDir
	targets                     []NxTarget
}

var nxConfig = map[NxProjectDir]NxProject{
	_project_barrelify: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_entryScript,
			_project_findImport,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_commonProxy: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_pnpmDedicatedLockfile,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_barrelify,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_defaultImport: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_haywire,
			_project_mochaChain,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_entryScript: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_haywire,
			_project_mochaChain,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_mochaChain,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_enumToArray: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_findImport: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_formatFile: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_haywire,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_barrelify,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_haywire: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_barrelify,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_haywireLauncher: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_mochaChain,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_entryScript,
			_project_haywire,
			_project_mochaChain,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_isoCrypto: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_barrelify,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_juniper: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_leymanEslintConfig: {
		runtime:                     _runtime_node,
		dependencyProjectDirs:       []NxProjectDir{},
		directDependencyProjectDirs: []NxProjectDir{},
		targets: []NxTarget{
			_target_biome,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_loadPopulateFiles: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_formatFile,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_populateFiles,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_populateFiles,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_mochaChain: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_haywire,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_haywire,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_namedPatch: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_normalizedReactQuery: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_nxDagger: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_formatFile,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_loadPopulateFiles,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_populateFiles,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_loadPopulateFiles,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_populateFiles,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_populateFiles,
			_target_mochaC8,
		},
	},
	_project_nxLifecycle: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_formatFile,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_loadPopulateFiles,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_populateFiles,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_formatFile,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_loadPopulateFiles,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_populateFiles,
			_target_mochaC8,
		},
	},
	_project_nxPluginHandler: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_haywire,
			_project_mochaChain,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_nxUpdateTsReferences: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_populateFiles,
			_target_mochaC8,
		},
	},
	_project_parseCwd: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_pnpmDedicatedLockfile: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_populateFiles: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_barrelify,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_findImport,
			_project_formatFile,
			_project_haywire,
			_project_haywireLauncher,
			_project_juniper,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_formatFile,
			_project_haywire,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_parseCwd,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_punycodeEsm: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_sinonTypedStub: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_pnpmDedicatedLockfile,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
	_project_staticEmitter: {
		runtime: _runtime_node,
		dependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_commonProxy,
			_project_defaultImport,
			_project_entryScript,
			_project_haywire,
			_project_haywireLauncher,
			_project_mochaChain,
			_project_nxPluginHandler,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
			_project_sinonTypedStub,
		},
		directDependencyProjectDirs: []NxProjectDir{
			_project_leymanEslintConfig,
			_project_mochaChain,
			_project_nxUpdateTsReferences,
			_project_pnpmDedicatedLockfile,
		},
		targets: []NxTarget{
			_target_biome,
			_target_eslint,
			_target_updateTsReferences,
			_target_tsc,
			_target_mochaC8,
		},
	},
}

var mapMutex = sync.RWMutex{}

// Execute Nx targets over all projects in dependency order
// and return the fully built monorepo directory
func (m *Monorepo) Build(
	ctx context.Context,
	nodeVersion string,
	pnpmVersion string,
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

	var triggerProjectBuild func(projectDir NxProjectDir)
	var triggerProjectBuildGroup func(projectDir NxProjectDir)
	triggerProjectBuild = func(projectDir NxProjectDir) {

		projectConfig := nxConfig[projectDir]
		dependencyDirs := make(map[NxProjectDir]*dagger.Directory, len(projectConfig.dependencyProjectDirs))

		for _, dependencyProjectDir := range projectConfig.dependencyProjectDirs {
			// Syncronously wait for each dependency to build,
			// because top-level has already kicked off each project
			triggerProjectBuildGroup(dependencyProjectDir)
			if buildError != nil {
				return
			}
			mapMutex.RLock()
			dependencyDirs[dependencyProjectDir] = builtProjects[dependencyProjectDir].directory
			mapMutex.RUnlock()
		}

		if buildError != nil {
			return
		}

		directory, err := m.buildProject(
			ctx,
			nodeVersion,
			pnpmVersion,
			projectDir,
			dependencyDirs,
		)
		if err != nil {
			if buildError == nil {
				// Not very concerned with race condition.
				// So long as _some_ early error gets flagged
				buildError = err
			}
		} else if buildError == nil {
			mapMutex.Lock()
			defer mapMutex.Unlock()
			project := builtProjects[projectDir]
			project.directory = directory
			builtProjects[projectDir] = project
		}
	}
	triggerProjectBuildGroup = func(projectDir NxProjectDir) {
		mapMutex.RLock()
		projectOnce := builtProjects[projectDir].once
		mapMutex.RUnlock()
		// Only run project build once, reporting wait/error groups
		projectOnce.Do(func() {
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

func (m *Monorepo) buildProject(
	ctx context.Context,
	nodeVersion string,
	pnpmVersion string,
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
			nodeVersion,
			pnpmVersion,
		).Run(
			m.Source,
			output,
			string(projectDir),
			projectSource,
			dependencyProjectDirs,
		)
	default:
		return nil, errors.New("No matching runtime: " + string(nxConfig[projectDir].runtime))
	}

	ciErrors, cancelCtx := errgroup.WithContext(ctx)

	for _, target := range nxConfig[projectDir].targets {

		switch target {
		case _target_barrelify:
			ciErrors.Go(func() error {
				return dag.Barrelify(
					nodeVersion,
				).Ci(
					cancelCtx,
					m.Source,
					string(projectDir),
					built,
				)
			})
		case _target_biome:
			ciErrors.Go(func() error {
				return dag.Biome(
					nodeVersion,
				).Ci(
					cancelCtx,
					m.Source,
					string(projectDir),
					built,
				)
			})
		case _target_eslint:
			ciErrors.Go(func() error {
				return dag.Eslint(
					nodeVersion,
				).Ci(
					cancelCtx,
					m.Source,
					string(projectDir),
					built,
					directDependencyProjectDirs,
				)
			})
		case _target_mochaC8:
			ciErrors.Go(func() error {
				return dag.MochaC8(
					nodeVersion,
				).Ci(
					cancelCtx,
					m.Source,
					string(projectDir),
					built,
					directDependencyProjectDirs,
				)
			})
		case _target_populateFiles:
			ciErrors.Go(func() error {
				return dag.PopulateFiles(
					nodeVersion,
				).Ci(
					cancelCtx,
					m.Source,
					string(projectDir),
					built,
				)
			})
		case _target_tsc:
			built = dag.Tsc(
				nodeVersion,
			).Run(
				m.Source,
				string(projectDir),
				built,
			)
		case _target_updateTsReferences:
			ciErrors.Go(func() error {
				return dag.UpdateTsReferences(
					nodeVersion,
				).Ci(
					cancelCtx,
					m.Source,
					string(projectDir),
					built,
					directDependencyProjectDirs,
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
			nodeVersion,
			pnpmVersion,
		).Run(
			m.Source,
			output,
			string(projectDir),
			projectSource,
			built,
			dependencyProjectDirs,
		)
	default:
		return nil, errors.New("No matching runtime: " + string(nxConfig[projectDir].runtime))
	}

	return built, nil
}
