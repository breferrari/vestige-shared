import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Find the Vestige core.
 *
 * The add-on ships no memory logic of its own — it is the base plugin's sync
 * path, switched on. Resolving the core rather than vendoring it is what keeps
 * the two from drifting into different write contracts.
 *
 * The two plugins install as SEPARATE plugins from separate repositories, so
 * the core is not at a fixed relative path. Search, in order: an explicit
 * override, a sibling checkout (developing both together), and then wherever a
 * plugin host has unpacked the `vestige` plugin.
 */
export function findCore(here = dirname(fileURLToPath(import.meta.url))) {
	const direct = [
		process.env.VESTIGE_CORE,
		resolve(here, "..", "core"),
		resolve(here, "..", "..", "vestige", "core"),
	].filter(Boolean);

	const roots = [join(homedir(), ".claude", "plugins"), join(homedir(), ".codex", "plugins")];
	const found = [];
	for (const root of roots) {
		if (!existsSync(root)) continue;
		const stack = [root];
		// bounded walk: plugin trees are shallow, and an unbounded search from a
		// home directory is how a hook becomes a several-second stall
		for (let depth = 0; depth < 5 && stack.length; depth++) {
			const level = stack.splice(0, stack.length);
			for (const dir of level) {
				let entries = [];
				try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
				for (const e of entries) {
					if (!e.isDirectory()) continue;
					const p = join(dir, e.name);
					if (e.name === "core" && existsSync(join(p, "lib", "sync.ts"))) found.push(p);
					else if (!e.name.startsWith(".") && e.name !== "node_modules") stack.push(p);
				}
			}
		}
	}
	return [...direct, ...found].find((c) => c && existsSync(join(c, "lib", "sync.ts"))) ?? null;
}
