import { parentPort } from 'node:worker_threads';
import { expose } from 'comlink';
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs';
import { hash } from './node.js';

expose({ hash }, nodeEndpoint(parentPort!));
