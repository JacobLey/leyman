import type { PopulateFileParams } from 'load-populate-files';

export default {
    // Resolved against `targetDir`, a temp directory in tests.
    filePath: 'signed.ts',
    content: 'export const generated = 1;\n',
    signed: true,
} satisfies PopulateFileParams;
