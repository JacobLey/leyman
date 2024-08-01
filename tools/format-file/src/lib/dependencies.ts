import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { findUp } from 'find-up';
import { file } from 'tmp-promise';
import { bind, createModule, singletonScope } from 'haywire';
import * as ids from './identifiers.js';

export const dependenciesModule = createModule(
    bind(ids.executorId).withInstance(promisify(execFile))
)
    .addBinding(bind(ids.readFileId).withInstance(readFile))
    .addBinding(bind(ids.writeFileId).withInstance(writeFile))
    .addBinding(bind(ids.tmpFileFactoryId).withInstance(file))
    .addBinding(bind(ids.findUpId).withInstance(findUp))
    .addBinding(
        bind(ids.prettierResolveConfigId)
            .withAsyncGenerator(async () => import('prettier').then(p => p.resolveConfig))
            .scoped(singletonScope)
    );
