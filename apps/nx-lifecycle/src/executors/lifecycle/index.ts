import { bind, createContainer, createModule } from 'haywire';
import { handler } from 'nx-plugin-handler';
import { isNxJson, isNxJsonIdentifier, isProjectJson, isProjectJsonIdentifier } from '#schemas';
import {
    dependenciesModule,
    formatFileIdentifier,
    isCiIdentifier,
    loggerIdentifier,
    readFileIdentifier,
    writeFileIdentifier,
} from './depedencies.js';
import { Lifecycle } from './lifecycle.js';
import { Normalizer } from './normalizer.js';
import { nxAndProjectJsonProcessorIdentifier, processNxAndProjectJsons } from './processor.js';

const pluginModule = createModule(
    bind(Lifecycle)
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
    .addBinding(bind(Normalizer).withConstructorProvider().withDependencies([isCiIdentifier]))
    .addBinding(bind(nxAndProjectJsonProcessorIdentifier).withInstance(processNxAndProjectJsons))
    .addBinding(bind(isNxJsonIdentifier).withInstance(isNxJson))
    .addBinding(bind(isProjectJsonIdentifier).withInstance(isProjectJson));

const lifecycle = createContainer(dependenciesModule.mergeModule(pluginModule)).get(Lifecycle);

export default handler(lifecycle.lifecycle);
