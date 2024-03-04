import {
    booleanSchema,
    objectSchema,
    type SchemaType,
    stringSchema,
} from 'juniper';

const populateFilesOptionsSchema = objectSchema({
    title: 'Populate Files Target',
    description: 'Load and dynamically populate files.',
    properties: {
        filePath: stringSchema({
            description:
                'Path to file with content and file paths to populate.',
        }),
        cwd: stringSchema({
            description:
                'Path to resolve all provided paths (_excluding_ above `filePath`). Defaults to process.cwd().',
        }),
        check: booleanSchema({
            description:
                'Fails if files are not already written, will not overwrite. Defaults to true during CI, false otherwise.',
        }),
        dryRun: booleanSchema({
            description: 'Load files and content, but do not write anything.',
        }),
    },
    required: ['filePath'],
}).metadata({
    version: 1,
    outputCapture: 'direct-nodejs',
    cli: 'nx',
});

export default populateFilesOptionsSchema.toJSON();
export type PopulateFilesOptions = SchemaType<
    typeof populateFilesOptionsSchema
>;
