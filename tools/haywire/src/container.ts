import { createContainer as createFactoryContainer, Factory, type GenericFactory } from '#factory';
import { createContainer as createModuleContainer, type GenericModule } from '#module';

export { AsyncContainer, isSyncContainer, SyncContainer } from '#container';

type CreateContainer = typeof createFactoryContainer & typeof createModuleContainer;
export const createContainer: CreateContainer = ((
    factoryOrModule: GenericFactory | GenericModule
) => {
    if (factoryOrModule instanceof Factory) {
        return createFactoryContainer(factoryOrModule);
    }
    return createModuleContainer(factoryOrModule);
}) as CreateContainer;
