import type { GetGitIgnore } from './git-ignore.js';
import type { GenerateGoFile } from './go-generator.js';
import type { NormalizeOptions } from './normalizer.js';
import type { NxDagger } from './nx-dagger.js';
import { bind, identifier } from 'haywire';
import { getGitIgnoreProvider } from './git-ignore.js';
import { generateGoFile } from './go-generator.js';
import {
    dependenciesModule,
    isCiId,
    parseCwdId,
    populateFilesId,
    readFileId,
    workspaceRootId,
} from './lib/depedencies.js';
import { Normalizer } from './normalizer.js';
import { nxDaggerProvider } from './nx-dagger.js';

const getGitIgnoreId = identifier<GetGitIgnore>();
const generateGoFileId = identifier<GenerateGoFile>();
const normalizeOptionsId = identifier<NormalizeOptions>();
export const nxDaggerId = identifier<NxDagger>();

export const nxDaggerModule = dependenciesModule
    .addBinding(
        bind(getGitIgnoreId)
            .withDependencies([readFileId, workspaceRootId])
            .withProvider(getGitIgnoreProvider)
    )
    .addBinding(bind(generateGoFileId).withInstance(generateGoFile))
    .addBinding(
        bind(Normalizer)
            .withDependencies([isCiId.supplier(), parseCwdId, readFileId])
            .withConstructorProvider()
    )
    .addBinding(
        bind(normalizeOptionsId)
            .withDependencies([Normalizer])
            .withProvider(n => n.normalizeOptions)
    )
    .addBinding(
        bind(nxDaggerId)
            .withDependencies([
                workspaceRootId,
                getGitIgnoreId,
                normalizeOptionsId,
                generateGoFileId,
                populateFilesId,
            ])
            .withProvider(nxDaggerProvider)
    );
