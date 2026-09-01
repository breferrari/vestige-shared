#!/usr/bin/env node
/**
 * Say when the shared store is STUCK.
 *
 * Every failure in this layer surfaces the same way — memories stop arriving,
 * or stop leaving — and a session cannot tell that from a quiet week. Nobody
 * runs the doctor, because nothing tells them to.
 *
 * So this reports, at session start, only the states that are actually stuck:
 * commits that never left, a remote that cannot be reached, a rebase halted
 * mid-flight, quarantined memories nobody looked at, and proposals waiting
 * under review. One line each, deduplicated per session.
 *
 * It NEVER repairs. A hook that fixes things silently is a hook that hides the
 * state it was written to surface, and every one of these wants a decision:
 * which commit to keep, whether the deletion was meant, whether the credential
 * in a quarantined file was real.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

try {
	const { findCore } = await import(pathToFileURL(join(import.meta.dirname, "find-core.mjs")).href);
	const core = findCore();
	if (!core) {
		// Fail open, but SAY SO. This hook's whole job is to make a silent state
		// visible; exiting quietly because it could not locate the core makes it
		// indistinguishable from a healthy store, which is the exact confusion it
		// exists to remove.
		process.stderr.write("vestige preflight: base plugin core not found — set VESTIGE_CORE or install the base plugin beside this one\n");
		process.exit(0);
	}
	const { activeStores, vestigeHome } = await import(pathToFileURL(join(core, "lib", "stores.ts")).href);

	let payload = {};
	try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no stdin */ }
	const session = String(payload.session_id ?? "nosession").replace(/[^\w.-]/g, "_");

	const git = (cwd, args) => {
		try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
		catch { return null; }
	};

	const stores = activeStores(process.cwd());
	if (!stores.length) process.stderr.write("vestige preflight: no configured stores resolved here\n");
	const lines = [];
	for (const { config, path } of stores) {
		if (!existsSync(path)) continue;
		const inRepo = git(path, ["rev-parse", "--is-inside-work-tree"]) === "true";
		if (!inRepo) continue;

		// Commits that never left. This is the quietest failure of the set: the
		// memories are captured, committed, and present only on this machine.
		const ahead = git(path, ["rev-list", "--count", "@{upstream}..HEAD"]);
		if (ahead && Number(ahead) > 0) lines.push(`${config.name}: ${ahead} commit(s) never pushed — they exist only on this machine`);

		// A rebase halted mid-flight leaves the store in a state where every
		// later sync fails, and the failures are swallowed by design.
		const gitDir = git(path, ["rev-parse", "--git-dir"]);
		if (gitDir) {
			// isAbsolute, not startsWith("/"): on Windows git reports an absolute
			// git-dir as "C:/repo/.git", where the slash test is false and the
			// path is joined onto itself.
			const abs = isAbsolute(gitDir) ? gitDir : join(path, gitDir);
			if (existsSync(join(abs, "rebase-merge")) || existsSync(join(abs, "rebase-apply"))) {
				lines.push(`${config.name}: a rebase is in progress — sync cannot proceed until it is finished or aborted`);
			}
		}

		// Proposals waiting under review mode.
		if ((process.env.VESTIGE_SYNC ?? "") === "review") {
			const pending = (git(path, ["status", "--porcelain", "--", "."]) ?? "").split("\n").filter((l) => l.trim());
			if (pending.length) lines.push(`${config.name}: ${pending.length} change(s) awaiting review — run /approve-memories`);
		}

		// The remote, probed rather than assumed. A missing key, a dropped VPN
		// and a revoked grant all present later as one empty directory.
		if (config.kind === "external" || git(path, ["remote"])) {
			const reachable = (() => {
				// Probe REACHABILITY, not the existence of a particular ref. The first
				// version asked for `HEAD` with --exit-code, which fails on a bare
				// remote whose HEAD points at an unborn default branch — reporting a
				// perfectly healthy remote as unreachable. A warning that cries wolf
				// every session is worse than no warning: it trains the reader to skip
				// the line that will one day be true.
				try { execFileSync("git", ["ls-remote", "origin"], { cwd: path, stdio: "ignore", timeout: 10000 }); return true; }
				catch { return false; }
			})();
			if (!reachable) lines.push(`${config.name}: remote unreachable — nothing will arrive or leave until access is fixed`);
		}
	}

	// Quarantine sits beside the store, not in it, so it is invisible to git.
	for (const { path } of activeStores(process.cwd())) {
		const q = join(path, "..", "memories-quarantine");
		if (!existsSync(q)) continue;
		const n = readdirSync(q).filter((f) => f.endsWith(".md")).length;
		if (n) lines.push(`${n} quarantined memor${n === 1 ? "y" : "ies"} held outside the store — each carried something that must not be shared`);
	}

	if (!lines.length) process.exit(0);

	// Deduplicate per session: a warning repeated on every resume is a warning
	// that gets filtered out by the reader.
	const stateFile = join(vestigeHome(), "state", `preflight-${session}.json`);
	let shown = [];
	try { shown = JSON.parse(readFileSync(stateFile, "utf8")); } catch { /* first time this session */ }
	const fresh = lines.filter((l) => !shown.includes(l));
	if (!fresh.length) process.exit(0);
	try { mkdirSync(join(vestigeHome(), "state"), { recursive: true }); writeFileSync(stateFile, JSON.stringify([...shown, ...fresh])); } catch { /* best effort */ }

	process.stdout.write(`VESTIGE — the shared store needs attention:\n${fresh.map((l) => `  ${l}`).join("\n")}\n  Run /memory-doctor for the full diagnosis. Nothing was repaired automatically.\n`);
} catch (e) {
	// Fail open — a broken hook must never block a session — but not SILENTLY.
	// The first version swallowed a TypeError from a wrong import name and
	// printed nothing, which is indistinguishable from a healthy store: the
	// precise failure this hook was written to make visible.
	process.stderr.write(`vestige preflight: skipped after an internal error — ${e?.message ?? e}\n`);
}
