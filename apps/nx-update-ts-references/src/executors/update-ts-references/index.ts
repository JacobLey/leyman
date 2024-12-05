import { bind, createContainer } from 'npm-haywire';
import { handler } from 'nx-plugin-handler';
import { dependenciesModule } from '../../lib/dependencies-module.js';
import { updateTsReferencesId } from '../../lib/update-ts-references.js';
import { NxUpdateTsReferencesExecutorFactory } from './executor.js';

const executorFactory = createContainer(
    dependenciesModule.addBinding(
        bind(NxUpdateTsReferencesExecutorFactory)
            .withDependencies([updateTsReferencesId])
            .withConstructorProvider()
    )
).get(NxUpdateTsReferencesExecutorFactory);

export default handler(executorFactory.execute.bind(executorFactory));
