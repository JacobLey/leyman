import { lifecycleContainer } from './container.js';
import { Lifecycle } from './lifecycle.js';

const lifecycle = lifecycleContainer.get(Lifecycle);

export default lifecycle.lifecycle;
