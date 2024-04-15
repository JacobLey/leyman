import { bind, createContainer, identifier, singletonScope } from 'haywire';
import * as lib from '#lib';

export type {
    FileFormatter,
    FilesFormatter,
    TextFormatter,
    TextFormatterOptions,
} from '#lib';

const formatterId = identifier(lib.Formatter);

const container = createContainer(
    lib.dependenciesModule
        .addBinding(
            bind(formatterId)
                .withDependencies([
                    lib.executorId,
                    lib.biomePathId.supplier(),
                    lib.readFileId,
                    lib.writeFileId,
                    lib.tmpFileFactoryId,
                ])
                .withConstructorProvider()
        )
        .addBinding(bind(lib.biomePathId).withGenerator(lib.biomePath).scoped(singletonScope))
);

const formatter = await container.getAsync(formatterId);

export const { formatFile, formatFiles, formatText } = formatter;
