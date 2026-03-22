import { BarrelifyApi } from './barrelify-api.js';
import { barrelifyContainer } from './container.js';

export const { barrelify } = barrelifyContainer.get(BarrelifyApi);
