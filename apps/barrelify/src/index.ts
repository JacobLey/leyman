import type { Barrelify } from './barrelify-api.js';
import { bind } from 'haywire';
import { BarrelifyApi } from './barrelify-api.js';
import { Barrel } from './lib/barrel.js';
import { parseCwdId } from './lib/dependencies.js';
import { barrelModule } from './lib/index.js';

const barrelifyApi = barrelModule
    .addBinding(bind(BarrelifyApi).withDependencies([Barrel, parseCwdId]).withConstructorProvider())
    .toContainer()
    .get(BarrelifyApi);

export const barrelify: Barrelify = barrelifyApi.barrelify.bind(barrelifyApi);
