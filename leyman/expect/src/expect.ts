import { use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

/**
 * Chai's `assert` and `expect`, with `chai-as-promised` already registered.
 */
export { assert, expect } from 'chai';

/**
 * Exported so emitted declarations import `chai-as-promised`, which loads its type augmentations
 * (e.g. `rejectedWith`) for consumers.
 */
export type ChaiAsPromised = typeof chaiAsPromised;
