---
name: efficient-systems
description: Making a hot system fast and small (simulations, generators, pathfinding, anything run per event at scale): budgets, a bench that matches real load, refactoring with no change in output, and the techniques that have paid off
---

# Efficient systems

Learned making a procedural world generator about 20x faster at half the memory, in TypeScript, with no change in what it computes. The order of work matters more than any single technique.

## Order of work

1. **Write down budgets from a load.** Say what load is assumed ("1,000 actors at 1 event a minute"), and what each operation may cost there. Mark assumed numbers as assumed. A budget is what says when to stop.
2. **Bench before touching anything.** A command printing JSON, never in CI, repeating within about 10%. Record the baseline.
3. **Make the bench's access pattern real.** Many actors scattered over the data, not one actor repeated. One walker repeated hits every cache and looks fine, while 300 scattered walkers evict each other's entries. The biggest win of that refactor showed up only under that load, and wasn't in the plan.
4. **Pin behaviour first, in its own commit.** Generated vectors or golden outputs covering the paths being changed. During the refactor, any diff there is a bug, not a regeneration. Anything that really must change output goes in a separate commit.
5. **Change one thing, rerun, keep the numbers.** Drop any change that doesn't pay for its complexity. Budget met means stop, including for planned items.
6. **Reach for new languages, workers and services last.** Each adds a permanent cost. Measure what TypeScript can do first: that refactor needed none of them.

Report what the bench leaves out as plainly as what it shows. A number that covers walking alone isn't the cost of a tick.

## What to look for

Roughly in the order they paid off.

- **Caches that thrash.** A cache smaller than the working set under real load does the work and also the bookkeeping. Before tuning eviction, ask whether entries can shrink until the whole working set fits.
- **Storing the surprise rather than the value.** If a cheap formula gets most of the answer, keep only the difference from it. Differences are mostly zero, so they run-length encode well. Per-chunk fields went from megabytes each to about 20 MB for the whole world, still exact.
- **Strings as keys.** Looking up by a built `"salt:3:7"` was over half of the generator's time. Pack coordinates into one number (allow for negatives), build the string only on a miss when the string is itself what gets hashed. Check whether the spec fixes what's hashed or only what comes out: a cache hit needn't build anything.
- **Caches that die too soon.** A cache made per call throws away what the neighbouring call needs. Keep it on the long-lived owner, bounded by the data's real size.
- **Value types that are too wide.** Values from a small set take a byte each, by index into a table, with strings only at the public boundary. Fixed-size pages of typed arrays, plus a check of the last page used, beat a map of objects.
- **Allocation per call.** Reuse scratch arrays where the code can't re-enter. Clear only what was touched.
- **Costs paid once per process.** Do them before taking traffic, so no request waits. Then a slow first run is a startup number, not a request number.
- **Anything unbounded.** Give every cache a cap, chosen from how long an entry takes to recompute against how much it holds.

Keep public signatures as they are: JSON at the boundary, compact forms inside. That's what lets the output stay provably unchanged, and lets callers stay simple.

## Testing compact forms

A packed structure can be wrong in ways its callers never notice. Add a test comparing it, entry by entry, with the plain slow version it replaces. Coverage won't find this. That test is also where a separate bug is most likely to show up: treat a surprising number as a finding, not noise.
