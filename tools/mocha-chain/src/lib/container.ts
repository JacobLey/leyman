import { createContainer } from 'haywire';
import { contextualHookModule } from './contextual-module.js';
import { mochaModule } from './mocha-module.js';

export const container = createContainer(mochaModule.mergeModule(contextualHookModule));
