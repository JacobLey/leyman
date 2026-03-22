import { bind } from 'haywire';
import { BarrelifyApi } from './barrelify-api.js';
import { Barrel } from './lib/barrel.js';
import { parseCwdId } from './lib/dependencies.js';
import { barrelModule } from './lib/index.js';

export const barrelifyContainer = barrelModule
    .addBinding(bind(BarrelifyApi).withDependencies([Barrel, parseCwdId]).withConstructorProvider())
    .toContainer();
