# expect

Pre-configured [chai](https://www.chaijs.com/) assertions for internal tests, with [chai-as-promised](https://github.com/chaijs/chai-as-promised) already registered.

```ts
import { expect } from '@leyman/expect';

const thrown: unknown = await expect(myPromise()).to.be.rejectedWith(Error);
expect(thrown).to.have.property('message').that.includes('<ERROR>');
```

Depending on this package (as a dev dependency) replaces depending on `chai`, `chai-as-promised`, and their `@types`.

It is not published, and should not be depended on by published code.
