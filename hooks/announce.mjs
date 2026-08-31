#!/usr/bin/env node
/**
 * Say what arrived from the team since last time.
 *
 * A shared store pulls silently at session start, so memories written by other
 * people appear with no signal at all. The session then either rediscovers what
 * a teammate already recorded, or never learns it exists — the shared store's
 * whole value leaking away quietly.
 *
 * Names only, capped. This runs at session start and competes with the user's
 * own context; a wall of memory bodies is a wall people learn to skip.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { findCore } from "./find-core.mjs";
const core = findCore();
if (!core) process.exit(0);

try {
	const { activeStores, vestigeHome, currentProject } = await import(pathToFileURL(join(core, "lib", "stores.ts")).href);
	const { recall } = await import(pathToFileURL(join(core, "lib", "vestige.ts")).href);
	const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

	const seenFile = join(vestigeHome(), "state", "announced.json");
	let seen = {};
	try { seen = JSON.parse(readFileSync(seenFile, "utf8")); } catch { /* first run */ }

	const visible = recall({ cwd, limit: 5000 });
	const key = currentProject(cwd) ?? "_anon";
	const known = new Set(seen[key] ?? []);
	const fresh = visible.filter((h) => !known.has(h.name));

	// First run records the baseline without announcing an entire store.
	const baseline = known.size === 0;
	seen[key] = visible.map((h) => h.name);
	mkdirSync(join(vestigeHome(), "state"), { recursive: true });
	writeFileSync(seenFile, JSON.stringify(seen));

	if (baseline || fresh.length === 0) process.exit(0);
	const shown = fresh.slice(0, 8);
	const lines = shown.map((h) => `  - ${h.name.replace(/\.md$/, "").replace(/^[^_]*__/, "").replace(/-/g, " ")}${h.tier === "project" ? "" : ` [${h.tier}]`}`);
	process.stdout.write(
		`${fresh.length} memor${fresh.length === 1 ? "y" : "ies"} reached this project since last session:\n${lines.join("\n")}` +
		`${fresh.length > shown.length ? `\n  ...and ${fresh.length - shown.length} more` : ""}\n` +
		`Search before assuming you know this ground.\n`,
	);
} catch { /* announcing is never worth failing a session start over */ }
