import type { GenericFactory } from '#factory';
import type { GenericModule } from '#module';
import { createContainer as createFactoryContainer, Factory } from '#factory';
import { createContainer as createModuleContainer } from '#module';

export {
    AsyncContainer,
    type GenericContainer,
    isSyncContainer,
    SyncContainer,
} from '#container';

type CreateContainer = typeof createFactoryContainer & typeof createModuleContainer;
export const createContainer: CreateContainer = ((
    factoryOrModule: GenericFactory | GenericModule
) => {
    if (factoryOrModule instanceof Factory) {
        return createFactoryContainer(factoryOrModule);
    }
    return createModuleContainer(factoryOrModule);
}) as CreateContainer;
