# Vestige — Shared Memories

Optional add-on for [Vestige](https://github.com/breferrari/vestige). Puts memories in a git repository shared across a team.

```
/plugin marketplace add breferrari/vestige-shared
/plugin install vestige-shared
```

Requires the `vestige` plugin — this add-on ships no memory logic of its own. It resolves the base plugin's core rather than vendoring a copy, because two copies of one write contract drift, and the drift is invisible until the stricter one blocks something the other allowed.

## What it adds

- **Pull at session start, push at the turn boundary.** The base plugin syncs from its own server, so this is an optimisation rather than the mechanism — nothing breaks without it, which is also why Codex works without hooks at all.
- **Deletions are held back.** A write adds a memory; a deletion removes it for **everyone**, including whoever wrote it and is not in your session to object. Deletions are parked and reported; `/approve-memories` is the deliberate review, and `VESTIGE_SYNC=full` publishes them.
- **Bounded retry with jitter.** One `pull --rebase` and one `push` loses almost every race under simultaneous writers — measured at 21 of 845 memories landing, with 98 of 100 engineers permanently stalled. With retry: 492.
- **Arrival announcements.** A shared store otherwise pulls in silence, so a memory a teammate wrote is either rediscovered from scratch or never found.
- **`/memory-doctor`.** Tells apart the three things that all present as "memory isn't working": nothing stored, nothing reachable (a reach mismatch), nothing ranked (the engine is missing or broken).

## Setting up the store

Declare an `external` store in `.vestige/config.json`:

```json
{ "name": "team", "kind": "external",
  "url": "git@example.com:acme/memories.git", "branch": "main",
  "path": ".vestige/.team", "accepts": ["platform", "general"] }
```

The clone is single-branch, blobless and sparse, so only the memory markdown materialises. The remote is probed **before** anything is written — a missing SSH key, a dropped VPN, revoked access and a wrong branch otherwise all present as one empty directory. The checkout is excluded via `.git/info/exclude` rather than your project's `.gitignore`, because where you keep your memories is your choice and does not belong in shared source.

The distribution model here is taken from [`mcs-cli/shared-memories`](https://github.com/mcs-cli/shared-memories), including the deletion-review default and the pre-flight remote probe.

MIT.
