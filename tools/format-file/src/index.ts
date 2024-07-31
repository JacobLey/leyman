import { bind, createContainer, identifier, singletonScope } from "haywire";
import * as lib from "#lib";

const formatterId = identifier(lib.Formatter);

const container = createContainer(
	lib.dependenciesModule
		.addBinding(
			bind(formatterId)
				.withDependencies([
					lib.canUseBiomeId.supplier("async"),
					lib.formatBiomeId,
					lib.canUsePrettierId.supplier("async"),
					lib.formatPrettierId,
					lib.readFileId,
					lib.writeFileId,
					lib.tmpFileFactoryId,
				])
				.withConstructorProvider(),
		)
		.addBinding(
			bind(lib.biomePathId).withGenerator(lib.biomePath).scoped(singletonScope),
		)
		.addBinding(
			bind(lib.prettierPathId)
				.withGenerator(lib.prettierPath)
				.scoped(singletonScope),
		)
		.addBinding(
			bind(lib.Biome)
				.withDependencies([lib.executorId, lib.biomePathId.supplier()])
				.withConstructorProvider()
				.scoped(singletonScope),
		)
		.addBinding(
			bind(lib.canUseBiomeId)
				.withDependencies([lib.Biome])
				.withAsyncProvider(async (biome) => biome.canUseBiome())
				.scoped(singletonScope),
		)
		.addBinding(
			bind(lib.formatBiomeId)
				.withDependencies([lib.Biome])
				.withProvider((biome) => biome.formatBiomeFiles),
		)
		.addBinding(
			bind(lib.Prettier)
				.withDependencies([lib.executorId, lib.prettierPathId.supplier()])
				.withConstructorProvider()
				.scoped(singletonScope),
		)
		.addBinding(
			bind(lib.canUsePrettierId)
				.withDependencies([lib.Prettier])
				.withAsyncProvider(async (prettier) => prettier.canUsePrettier())
				.scoped(singletonScope),
		)
		.addBinding(
			bind(lib.formatPrettierId)
				.withDependencies([lib.Prettier])
				.withProvider((prettier) => prettier.formatPrettierFiles),
		),
);

export const { formatFile, formatFiles, formatText } = await container.getAsync(formatterId);
