---
description: Review memories deleted locally and decide whether to remove them for the whole team.
---

Deletions are held back from the shared store by default. Removing a memory removes it for **everyone**, including whoever wrote it and is not here to object, so it needs a decision rather than a side effect.

Do this:

1. Run the doctor to see the shared store's state, then list what is pending: from the store directory, `git status --porcelain` — lines beginning `D` are memories deleted locally but still present for the team.
2. For each one, read what is being removed (`git show HEAD:<path>`) and say why it should go: superseded by a better memory, no longer true, or never qualified. "Tidying up" is not a reason.
3. Present the list with your reasoning and **ask the user to confirm**. Never approve on their behalf.
4. On approval, publish the removals by running the sync with `VESTIGE_SYNC=full` set.
5. To keep one instead, restore it: `git checkout -- <path>`.

If nothing is pending, say so plainly — that is the normal state.
