// Code generated by nx-dagger. DO NOT EDIT.
package main

import (
	"dagger/monorepo-builder/internal/dagger"

	"context"
	"errors"

	"golang.org/x/sync/errgroup"
)

type MonorepoBuilder struct {
	// Root of source file
	Source *dagger.Directory
}

func New(
	// Root of source file
	source *dagger.Directory,
) *MonorepoBuilder {
	return &MonorepoBuilder{
		Source: source,
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

// List all project directories, filtered by runtime
// Empty string results in all project directories
func (m *MonorepoBuilder) ProjectDirs(runtime string) []string {

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
func (m *MonorepoBuilder) ProjectConfig(projectDir string) ProjectConfig {

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

func (m *MonorepoBuilder) BuildProject(
	ctx context.Context,
	projectDirStr string,
	dependencyDirectories []*dagger.Directory,
	goLangVersion string,
	nodeVersion string,
	pnpmVersion string,
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
					goLangVersion,
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
			pnpmVersion,
		).Run(
			m.Source,
			output,
			string(projectDir),
			projectSource,
			built,
			dependencyProjectDirs,
			directDependencyProjectDirs,
		)
	default:
		return nil, errors.New("No matching runtime: " + string(nxConfig[projectDir].runtime))
	}

	return built, nil
}
