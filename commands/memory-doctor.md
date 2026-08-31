---
description: Diagnose a memory setup that is not working — stores, remote, retrieval engine, and reach.
---

Run the doctor script from the Vestige core and present its output:

```
node --experimental-strip-types --disable-warning=ExperimentalWarning <vestige>/core/setup/doctor.mjs
```

Then interpret it for the user rather than pasting it. In particular, tell apart the three things that all look like "memory isn't working":

- **nothing stored** — the store is empty, so capture is not running
- **nothing reachable** — memories exist but none are visible here, which is a reach mismatch and `explain` names the cause per memory
- **nothing ranked** — memories are visible but qmd is missing or broken, so results come back in specificity order rather than by relevance

Recommend the fix; do not silently apply it.
