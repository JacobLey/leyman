import { booleanSchema, objectSchema, type SchemaType } from 'npm-juniper';

const updateTsReferencesOptionsSchema = objectSchema({
    title: 'update-ts-references',
    description: 'Update TSConfig references based on dependencies',
    properties: {
        check: booleanSchema({
            description:
                'Fails if references are not already updated, will not overwrite. Defaults to true during CI, false otherwise.',
        }),
        dryRun: booleanSchema({
            description: 'Load files and content, but do not write anything.',
        }),
    },
}).metadata({
    version: 1,
    outputCapture: 'direct-nodejs',
    cli: 'nx',
});

export default updateTsReferencesOptionsSchema.toJSON();
export type UpdateTsReferencesOptions = SchemaType<
    typeof updateTsReferencesOptionsSchema
>;
