# Contributing

Thanks for helping with svelte-pdf-mini! Bug reports, docs fixes and pull requests are all welcome.

## Setup

Requires [bun](https://bun.sh) 1.3+.

```sh
git clone https://github.com/julien-blanchon/svelte-pdf-mini
cd svelte-pdf-mini
bun install
bun run fixtures   # download the arXiv PDFs used by the unit tests
bun run dev        # docs and demos on http://localhost:5173
```

The docs app imports the library straight from `packages/svelte-pdf-mini/src`, so changes show up in the demos as you save.

## Layout

- `packages/svelte-pdf-mini/src/lib/core`: framework-free TypeScript (pdf.js, geometry, text, annotations, PDF codec, paper analysis).
- `packages/svelte-pdf-mini/src/lib/state`: Svelte 5 runes classes (viewer, annotations, paper, …).
- `packages/svelte-pdf-mini/src/lib/components`: headless compound components (`Viewer.Root`, `Annotations.Layer`, …).
- `apps/docs`: the documentation site; demos live in `src/lib/demos/examples/<name>` and are shown full screen at `/demo/<name>`.

## Before opening a pull request

```sh
bun run lint       # ESLint + Prettier (library)
bun run check      # svelte-check (library + docs)
bun run test       # fast unit tests
bun run test:e2e   # @smoke end-to-end tests (Playwright, reuses the dev server)
```

`bun run test:full` and `bun run test:e2e:full` run everything; CI runs the full unit suite and the smoke tests.

## Changesets

If your pull request changes the library (anything under `packages/svelte-pdf-mini`), add a changeset:

```sh
bun changeset
```

Pick `patch` for fixes, `minor` for new features (and, before 1.0, breaking changes), and write one or two sentences for the changelog, from a user's point of view. Docs-only changes don't need one. CI reminds you when it's missing.

## Code style

- Svelte 5 runes only; parts follow the existing conventions: `ref`, `child` / `children` snippets, `data-pdf-*` attributes for state, CSS custom properties for per-instance values, structural layout in the component's `<style>` block (zero-specificity `:where()` rules), theming in `styles.css`.
- No nested ternaries (ESLint enforces it): use a lookup table, early returns or a `switch`.
- User-facing text goes through the message catalogue (`core/i18n/messages.ts`) so apps can translate it.
- Keep comments short and about *why*.
