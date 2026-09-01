/**
 * The shared add-on is what actually reaches a team, and it had no tests.
 *
 * Everything here is a hook: it runs unattended, its output is advisory, and
 * every failure mode is silence. So these cover the two things silence hides —
 * whether a hook can find the core at all, and whether it reports a store that
 * is stuck.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HOOKS = join(import.meta.dirname, "..", "hooks");
const { findCore: coreFor } = await import(pathToFileURL(join(HOOKS, "find-core.mjs")).href);
let home, store, remote;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/**
 * Run a hook and keep BOTH streams.
 *
 * These hooks fail open and explain themselves on stderr. Piping stderr into
 * the void made every failure here an empty string with no cause attached —
 * the test was hiding exactly the diagnostic the hook exists to print.
 */
let lastStderr = "";
const runHook = (file, payload = {}, env = {}) => {
	const r = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", join(HOOKS, file)], {
		input: JSON.stringify(payload), encoding: "utf8", cwd: store,
		env: { ...process.env, VESTIGE_HOME: home, ...env },
	});
	lastStderr = r.stderr ?? "";
	return r.stdout ?? "";
};
const why = (msg) => [
	msg,
	`  hook stderr: ${lastStderr.trim() || "(silent)"}`,
	`  VESTIGE_CORE: ${process.env.VESTIGE_CORE ?? "(unset)"}`,
	`  findCore():   ${(() => { try { return coreFor() ?? "null"; } catch (e) { return `threw ${e.message}`; } })()}`,
].join("\n");

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "addon-home-"));
	remote = mkdtempSync(join(tmpdir(), "addon-remote-"));
	execFileSync("git", ["init", "-q", "--bare", remote]);
	store = join(home, "memories");
	mkdirSync(store, { recursive: true });
	git(store, "init", "-q", "-b", "main");
	git(store, "config", "user.email", "t@t");
	git(store, "config", "user.name", "t");
	git(store, "remote", "add", "origin", remote);
	writeFileSync(join(store, "a.md"), "---\nscope: project\n---\n\n# a\n\nbody\n");
	git(store, "add", "-A"); git(store, "commit", "-qm", "seed"); git(store, "push", "-q", "-u", "origin", "main");
});

describe("finding the core", () => {
	test("findCore resolves, or returns null — never throws", async () => {
		const { findCore } = await import(pathToFileURL(join(HOOKS, "find-core.mjs")).href);
		const core = findCore();
		assert.ok(core === null || typeof core === "string");
	});
	test("VESTIGE_CORE is honoured when it points at a real core", async () => {
		const { findCore } = await import(pathToFileURL(join(HOOKS, "find-core.mjs")).href);
		const real = findCore();
		if (!real) return; // no sibling checkout in this environment
		process.env.VESTIGE_CORE = real;
		assert.equal(findCore(), real);
		delete process.env.VESTIGE_CORE;
	});
});

describe("preflight reports a stuck store", () => {
	test("a commit that never left is reported", () => {
		writeFileSync(join(store, "b.md"), "---\nscope: project\n---\n\n# b\n\nbody\n");
		git(store, "add", "-A"); git(store, "commit", "-qm", "unpushed");
		const out = runHook("preflight.mjs", { session_id: "s1" });
		assert.match(out, /never pushed/i, why("memories committed and never pushed are invisible otherwise"));
	});

	test("a healthy store says nothing", () => {
		const out = runHook("preflight.mjs", { session_id: "s2" });
		assert.equal(out.trim(), "", "a hook that speaks when nothing is wrong trains the reader to skip it");
	});

	test("an unreachable remote is reported, a reachable one is not", () => {
		const clean = runHook("preflight.mjs", { session_id: "s3" });
		assert.doesNotMatch(clean, /unreachable/i, "a reachable remote must never be reported as unreachable");
		git(store, "remote", "set-url", "origin", join(tmpdir(), "definitely-not-a-repo-xyz"));
		const broken = runHook("preflight.mjs", { session_id: "s4" });
		assert.match(broken, /unreachable/i, why("an unreachable remote must be reported"));
	});

	test("quarantined memories are surfaced — git cannot see them", () => {
		mkdirSync(join(home, "memories-quarantine"), { recursive: true });
		writeFileSync(join(home, "memories-quarantine", "leaky.md"), "x\n");
		const out = runHook("preflight.mjs", { session_id: "s5" });
		assert.match(out, /quarantined/i, why("quarantined memories are invisible to git"));
	});

	test("it repeats nothing within one session", () => {
		writeFileSync(join(store, "c.md"), "---\nscope: project\n---\n\n# c\n\nbody\n");
		git(store, "add", "-A"); git(store, "commit", "-qm", "unpushed");
		const first = runHook("preflight.mjs", { session_id: "dup" });
		const second = runHook("preflight.mjs", { session_id: "dup" });
		assert.match(first, /never pushed/i, why("the first report in a session must fire"));
		assert.equal(second.trim(), "", "a warning repeated every resume is a warning that gets filtered out");
	});

	test("it never repairs anything", () => {
		writeFileSync(join(store, "d.md"), "---\nscope: project\n---\n\n# d\n\nbody\n");
		git(store, "add", "-A"); git(store, "commit", "-qm", "unpushed");
		const before = git(store, "rev-parse", "HEAD");
		runHook("preflight.mjs", { session_id: "s6" });
		assert.equal(git(store, "rev-parse", "HEAD"), before);
		assert.equal(git(remote, "rev-list", "--count", "main"), "1", "reporting is not fixing; each of these wants a decision");
	});
});

describe("the plugin manifest", () => {
	test("does not declare the auto-loaded hooks file", () => {
		const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
		assert.equal(manifest.hooks, undefined, "hooks/hooks.json is loaded automatically; declaring it too fails the entire hook load");
	});
	test("every hook the manifest wires up exists and parses", () => {
		const hooks = JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8"));
		const files = JSON.stringify(hooks).match(/[\w-]+\.mjs/g) ?? [];
		assert.ok(files.length, "a hooks file that wires up nothing is a plugin that does nothing");
		for (const f of new Set(files)) execFileSync(process.execPath, ["--check", join(HOOKS, f)]);
	});
	test("the marketplace entry carries the name the installer requires", () => {
		const m = JSON.parse(readFileSync(join(import.meta.dirname, "..", ".claude-plugin", "marketplace.json"), "utf8"));
		for (const p of m.plugins ?? []) assert.ok(p.name, "an entry without a name fails installation with no useful error");
	});
});
