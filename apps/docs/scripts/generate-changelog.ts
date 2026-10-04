/**
 * Builds the docs Changelog page (src/lib/content/docs/changelog.svx) from the
 * package CHANGELOG.md that Changesets writes on each release.
 * Run by `bun run api` (before dev and build).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../../packages/svelte-pdf-mini/CHANGELOG.md');
const out = join(here, '../src/lib/content/docs/changelog.svx');
const repo = 'https://github.com/julien-blanchon/svelte-pdf-mini';

/** Escapes what mdsvex would read as Svelte syntax, outside code spans and fences. */
function escapeSvelte(markdown: string): string {
	let fenced = false;
	return markdown
		.split('\n')
		.map((line) => {
			if (line.trimStart().startsWith('```')) fenced = !fenced;
			if (fenced) return line;
			return line
				.split(/(`[^`]*`)/)
				.map((part, i) => (i % 2 ? part : part.replace(/[{}<]/g, (c) => `&#${c.charCodeAt(0)};`)))
				.join('');
		})
		.join('\n');
}

// Drop the "# svelte-pdf-mini" title: the page has its own.
const releases = readFileSync(source, 'utf8').replace(/^# .*\n+/, '').trim();

const body = releases
	? escapeSvelte(releases)
	: `No release yet. Pending changes are listed in the [open "version packages" pull request](${repo}/pulls).`;

writeFileSync(
	out,
	`---
title: Changelog
description: What changed in each release of svelte-pdf-mini.
---

<!-- Generated from packages/svelte-pdf-mini/CHANGELOG.md by scripts/generate-changelog.ts: do not edit. -->

Every release is also on [GitHub Releases](${repo}/releases) and [npm](https://www.npmjs.com/package/svelte-pdf-mini?activeTab=versions). Releases follow [semantic versioning](https://semver.org); until 1.0, minor versions may include breaking changes.

${body}
`
);
console.log(`changelog: ${releases ? (releases.match(/^## /gm)?.length ?? 0) : 0} releases`);
