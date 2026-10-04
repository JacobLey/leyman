import { commonProxy } from 'common-proxy';

const methodsProm = import('./methods.js');

export const addAllNums = commonProxy(methodsProm.then(mod => mod.addAllNums));
export const delayForLongestTime = commonProxy(methodsProm.then(mod => mod.delayForLongestTime));
export const slowReverse = commonProxy(methodsProm.then(mod => mod.slowReverse));
