#!/usr/bin/env node
/** The add-on's entry into the shared core. Silent on failure: a memory hook must never fail a turn. */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findCore } from "./find-core.mjs";

const core = findCore();
if (!core) process.exit(0);   // the memory-doctor command is where this is diagnosed
process.argv[2] ??= "push";
await import(pathToFileURL(join(core, "lib", "sync.ts")).href);
