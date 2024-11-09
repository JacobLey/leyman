import { bind, singletonScope } from 'haywire';
import { Barrel } from './barrel.js';
import {
    dependenciesModule,
    findImportId,
    globbyId,
    populateFileId,
    readFileId,
} from './dependencies.js';
import { FindPackageJson, isExplicitlyModuleDirectoryId } from './find-package-json.js';
import { Glob } from './glob.js';

export const barrelModule = dependenciesModule
    .addBinding(
        bind(Barrel)
            .withDependencies([readFileId, populateFileId, Glob])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(FindPackageJson)
            .withDependencies([findImportId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(isExplicitlyModuleDirectoryId)
            .withDependencies([FindPackageJson])
            .withProvider(findPackageJson =>
                findPackageJson.isExplicitlyModuleDirectory.bind(findPackageJson)
            )
            .scoped(singletonScope)
    )
    .addBinding(
        bind(Glob)
            .withDependencies([globbyId, isExplicitlyModuleDirectoryId])
            .withConstructorProvider()
            .scoped(singletonScope)
    );
