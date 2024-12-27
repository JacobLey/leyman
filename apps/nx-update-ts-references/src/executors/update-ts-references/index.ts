import { bind, createContainer } from 'npm-haywire';
import { dependenciesModule } from '../../lib/dependencies-module.js';
import { updateTsReferencesId } from '../../lib/update-ts-references.js';
import { NxUpdateTsReferencesExecutor } from './executor.js';
import { errorLoggerId, executorDependenciesModule, isCiId } from './lib/dependencies.js';

const executor = createContainer(
    dependenciesModule
        .mergeModule(executorDependenciesModule)
        .addBinding(
            bind(NxUpdateTsReferencesExecutor)
                .withDependencies([isCiId, updateTsReferencesId, errorLoggerId])
                .withConstructorProvider()
        )
).get(NxUpdateTsReferencesExecutor);

export default executor.execute;
