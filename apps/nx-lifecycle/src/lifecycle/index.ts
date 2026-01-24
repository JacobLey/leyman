import type { ILifecycleInternal } from './lifecycle-internal.js';
import { bind, identifier } from 'haywire';
import { isNxJson, isNxJsonIdentifier, isProjectJson, isProjectJsonIdentifier } from '#schemas';
import {
    dependenciesModule,
    formatFileIdentifier,
    isCiIdentifier,
    loggerIdentifier,
    parseCwdId,
    readFileIdentifier,
    writeFileIdentifier,
} from './depedencies.js';
import { LifecycleInternal } from './lifecycle-internal.js';
import { Normalizer } from './normalizer.js';
import { nxAndProjectJsonProcessorIdentifier, processNxAndProjectJsons } from './processor.js';

export const lifecycleInternalId = identifier<ILifecycleInternal>();

export const lifecycleInternalModule = dependenciesModule
    .addBinding(
        bind(lifecycleInternalId)
            .withDependencies([LifecycleInternal])
            .withProvider(l => l.lifecycleInternal)
    )
    .addBinding(
        bind(LifecycleInternal)
            .withConstructorProvider()
            .withDependencies([
                Normalizer,
                readFileIdentifier,
                writeFileIdentifier,
                formatFileIdentifier,
                nxAndProjectJsonProcessorIdentifier,
                isNxJsonIdentifier,
                isProjectJsonIdentifier,
                loggerIdentifier,
            ])
    )
    .addBinding(
        bind(Normalizer)
            .withDependencies([isCiIdentifier.supplier(), parseCwdId, readFileIdentifier])
            .withConstructorProvider()
    )
    .addBinding(bind(nxAndProjectJsonProcessorIdentifier).withInstance(processNxAndProjectJsons))
    .addBinding(bind(isNxJsonIdentifier).withInstance(isNxJson))
    .addBinding(bind(isProjectJsonIdentifier).withInstance(isProjectJson));
