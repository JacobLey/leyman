import type { FilesFormatter } from '#types';
import { bind, createContainer, identifier, singletonScope } from 'haywire';
import * as lib from '#lib';

export type { FileFormatter, FilesFormatter, Formatters, TextFormatter } from '#types';

const formatterId = identifier(lib.Formatter);
const formatterWrapperId = identifier(lib.FormatterWrapper);
const filesFormatterId = identifier<FilesFormatter>();

const container = createContainer(
    lib.dependenciesModule
        .addBinding(
            bind(formatterId)
                .withDependencies([
                    lib.canUseBiomeId.supplier('async'),
                    lib.formatBiomeId,
                    lib.canUsePrettierId.supplier('async'),
                    lib.formatPrettierId,
                ])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .addBinding(
            bind(filesFormatterId)
                .withDependencies([formatterId])
                .withProvider(formatter => formatter.formatFiles)
                .scoped(singletonScope)
        )
        .addBinding(
            bind(formatterWrapperId)
                .withDependencies([
                    filesFormatterId,
                    lib.readFileId,
                    lib.writeFileId,
                    lib.tmpFileFactoryId,
                ])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .addBinding(bind(lib.biomePathId).withGenerator(lib.biomePath).scoped(singletonScope))
        .addBinding(bind(lib.prettierPathId).withGenerator(lib.prettierPath).scoped(singletonScope))
        .addBinding(
            bind(lib.Biome)
                .withDependencies([lib.executorId, lib.findUpId, lib.biomePathId.supplier()])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .addBinding(
            bind(lib.canUseBiomeId)
                .withDependencies([lib.Biome])
                .withAsyncProvider(async biome => biome.canUseBiome())
                .scoped(singletonScope)
        )
        .addBinding(
            bind(lib.formatBiomeId)
                .withDependencies([lib.Biome])
                .withProvider(biome => biome.formatBiomeFiles)
        )
        .addBinding(
            bind(lib.Prettier)
                .withDependencies([
                    lib.executorId,
                    lib.prettierPathId.supplier(),
                    lib.prettierResolveConfigId.supplier('async'),
                ])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .addBinding(
            bind(lib.canUsePrettierId)
                .withDependencies([lib.Prettier])
                .withAsyncProvider(async prettier => prettier.canUsePrettier())
                .scoped(singletonScope)
        )
        .addBinding(
            bind(lib.formatPrettierId)
                .withDependencies([lib.Prettier])
                .withProvider(prettier => prettier.formatPrettierFiles)
        )
);

export const [{ formatFiles }, { formatFile, formatText }] = await Promise.all([
    container.getAsync(formatterId),
    container.getAsync(formatterWrapperId),
]);
