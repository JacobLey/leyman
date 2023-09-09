import { objectSchema, type SchemaType, stringSchema } from 'npm-juniper';

const buildOptionsSchema = objectSchema({
    title: 'Typescript Build Target',
    description: 'Builds using TypeScript.',
    properties: {
        tsConfig: stringSchema({
            description: 'The path to the Typescript configuration file.',
        }),
    },
    required: ['tsConfig'],
}).metadata({
    version: 1,
    outputCapture: "direct-nodejs",
    cli: "nx",
});

export default buildOptionsSchema.toJSON();
export type BuildOptions = SchemaType<typeof buildOptionsSchema>;
