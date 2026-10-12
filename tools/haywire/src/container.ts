import type { GenericContainerFactory } from '#container-factory';
import type { GenericModule } from '#module';
import {
    ContainerFactory,
    createContainer as createContainerFromFactory,
} from '#container-factory';
import { createContainer as createContainerFromModule } from '#module';

export {
    Container,
    type GenericContainer,
    isSyncContainer,
    SyncContainer,
} from '#container';

type CreateContainer = typeof createContainerFromFactory & typeof createContainerFromModule;
export const createContainer: CreateContainer = ((
    factoryOrModule: GenericContainerFactory | GenericModule
) =>
    factoryOrModule instanceof ContainerFactory
        ? createContainerFromFactory(factoryOrModule)
        : createContainerFromModule(factoryOrModule)) as CreateContainer;
