import { Ajv2020 } from 'ajv/dist/2020.js';

export const ajv = new Ajv2020({ strict: true, formats: { 'uri-reference': true } });
