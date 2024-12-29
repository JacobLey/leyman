import { bind, createContainer } from 'haywire';
import { lifecycleInternalId, lifecycleInternalModule } from '../../lifecycle/index.js';
import { Lifecycle } from './lifecycle.js';

const lifecycleModule = lifecycleInternalModule.addBinding(
    bind(Lifecycle).withDependencies([lifecycleInternalId]).withConstructorProvider()
);

const lifecycle = createContainer(lifecycleModule).get(Lifecycle);

export default lifecycle.lifecycle;
