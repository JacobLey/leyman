---
'juniper-arbitrary': patch
---

A URI, IRI, URI template or reference, email address, hostname, or JSON pointer (plain or relative) with a `minLength` is now lengthened to a length picked between its bounds, in its fragment, local part, labels or a new segment, rather than generated at a size and rejected when it fell short. A `uri` of 30 to 40 characters took about 4 tries per value, now 1. `byte` is drawn directly at the lengths of whole base64 groups between the bounds. With a `maxLength`, the fast-check sizes are weighted by how often their values fit, so a size that rarely does is rarely drawn. Unbounded formats generate the same values as before.
