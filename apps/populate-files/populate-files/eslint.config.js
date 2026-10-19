import configGenerator from '@leyman/eslint-config';
import generatedSignature from 'generated-signature/eslint';
import packageJson from './package.json' with { type: 'json' };

export default configGenerator({
    packageJson,
    plugins: [generatedSignature],
    configUrl: import.meta.url,
});
