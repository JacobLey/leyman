import { bind, singletonScope } from 'npm-haywire';
import { dependenciesModule, findLockfileDirId, readLockfileId } from './dependencies.js';
import { getPrunedLockfileId, PrunedLockfile } from './pruned-lockfile.js';

export const lockfileModule = dependenciesModule
    .addBinding(
        bind(PrunedLockfile)
            .withDependencies([findLockfileDirId, readLockfileId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(getPrunedLockfileId)
            .withDependencies([PrunedLockfile])
            .withProvider(prunedLockfile => prunedLockfile.getPrunedLockfile.bind(prunedLockfile))
            .scoped(singletonScope)
    );
