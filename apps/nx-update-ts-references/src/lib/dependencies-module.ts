import { readFile } from 'node:fs/promises';
import { formatText, type TextFormatter } from 'npm-format-file';
import { populateFile, type PopulateFile } from 'npm-populate-files';
import { bind, createModule, identifier, optimisticSingletonScope } from 'haywire';
import { UpdateTsReferencesFactory, updateTsReferencesId } from './update-ts-references.js';

export const readFileId = identifier<typeof readFile>();
export const textFormatterId = identifier<TextFormatter>();
export const populateFileId = identifier<PopulateFile>();

export const dependenciesModule = createModule(bind(readFileId).withInstance(readFile))
    .addBinding(bind(textFormatterId).withInstance(formatText))
    .addBinding(bind(populateFileId).withInstance(populateFile))
    .addBinding(
        bind(UpdateTsReferencesFactory)
            .withDependencies([readFileId, textFormatterId, populateFileId])
            .withConstructorProvider()
    )
    .addBinding(
        bind(updateTsReferencesId)
            .withDependencies([UpdateTsReferencesFactory])
            .withProvider(factory => factory.updateTsReferences)
            .scoped(optimisticSingletonScope)
    );
