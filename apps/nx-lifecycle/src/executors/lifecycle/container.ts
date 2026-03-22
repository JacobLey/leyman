import { bind, createContainer } from 'haywire';
import { lifecycleInternalId, lifecycleInternalModule } from '../../lifecycle/index.js';
import { Lifecycle } from './lifecycle.js';

export const lifecycleContainer = createContainer(
    lifecycleInternalModule.addBinding(
        bind(Lifecycle).withDependencies([lifecycleInternalId]).withConstructorProvider()
    )
);
