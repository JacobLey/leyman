import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

// An ESLint config only runs on Node.js
export default configGenerator({ configUrl: import.meta.url, node: true, packageJson });
