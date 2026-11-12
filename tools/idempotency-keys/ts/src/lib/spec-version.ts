/**
 * Version of the idempotency-keys spec this package implements:
 * https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md
 *
 * `major.minor`: servers whose implementations share a major version share keys, records and notifications, and a
 * minor version only adds what older ones can ignore. Independent of the package's version.
 */
export const SPEC_VERSION = '1.0';
