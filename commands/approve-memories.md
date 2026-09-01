---
description: Review pending memory changes — additions awaiting review and deletions held back — and decide what the whole team gets.
---

Two different things end up here, and they are held for opposite reasons.

**Deletions are always held back.** Removing a memory removes it for *everyone*, including whoever wrote it and is not here to object, so it needs a decision rather than a side effect.

**Additions are held back only under `VESTIGE_SYNC=review`.** That mode exists for a team that wants a lead to see incoming lessons before they become everybody else's context. Under the default `auto`, additions have already gone out and only deletions will be waiting.

Do this:

1. **List what is pending.** From the store directory, `git status --porcelain`: lines beginning `D` are deletions held back; `??` and `M` are additions and edits awaiting review. If nothing is pending, say so plainly and stop — that is the normal state.
2. **Read each one before judging it.** For a deletion, `git show HEAD:<path>` — you are deciding on content you have not seen otherwise. For an addition, read the file: does it state a claim, does it carry reach that matches what it actually applies to, and does it duplicate something already in the store? A near-twin should supersede rather than land beside its sibling.
3. **Say why.** A deletion needs a reason: superseded, no longer true, or never qualified. "Tidying up" is not a reason. An addition needs the opposite check — would this help someone on a different project?
4. **Present the list with your reasoning and ask the user to confirm.** Never approve on their behalf.
5. **On approval, publish.** From the store directory:
   ```
   git add -A
   git commit -m "review: <reason>"
   git pull --rebase --autostash
   git push
   ```
   Use `review: audit cleanup` as the subject when this is a housekeeping pass rather than a specific judgement — a readable history is the point of naming it.
6. **To keep something instead**, restore it: `git checkout -- <path>` for a deletion, or delete the file for an addition you are refusing.

The content gate runs before anything is staged, so a memory carrying a credential or a private host is already quarantined and will not appear in this list. That is deliberate: this command is for judgement about *reach and value*, never a last line of defence for secrets.
