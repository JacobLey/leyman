import AjvDefault from 'ajv/dist/2020.js';
import { defaultImport } from 'default-import';

const Ajv = defaultImport(AjvDefault);

export const ajv = new Ajv({ strict: true, formats: { 'uri-reference': true } });
