# Releasing svelte-pdf-mini

A release publishes `packages/svelte-pdf-mini` to npm as [`svelte-pdf-mini`](https://www.npmjs.com/package/svelte-pdf-mini) (with provenance) and creates a GitHub release `vX.Y.Z` with the changelog section and the packed tarball attached. It is triggered by pushing a tag `vX.Y.Z`.

> **Ordering with Xivly.** [Xivly](https://github.com/julien-blanchon/xivly) installs svelte-pdf-mini from npm. When a Xivly release needs a new svelte-pdf-mini, release svelte-pdf-mini **first**, wait until `npm view svelte-pdf-mini@X.Y.Z` answers, then bump the dependency in Xivly (`bun add svelte-pdf-mini@^X.Y.Z`, commit `bun.lock`) and release Xivly. Xivly's release workflow refuses to run if the version locked in its `bun.lock` isn't on npm.

## Prerequisites

- **npm trusted publishing** (current setup): on npmjs.com, the `svelte-pdf-mini` package → *Settings → Trusted publishing* lists GitHub Actions, repository `julien-blanchon/svelte-pdf-mini`, workflow **`release.yml`**, no environment. The workflow file must keep that name. No secret is needed.
- **No npm token.** Publishing works only through trusted publishing, so a leaked token can't publish. On npmjs.com, *Settings → Publishing access*: "Require two-factor authentication and disallow tokens" (recommended). Third-party actions in the workflows are pinned to commit SHAs (the comment gives the tag).
- `GITHUB_TOKEN` (automatic) creates the GitHub release.
- Push access to `main` and permission to push tags.

## Workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | pull requests, pushes to `main` | lint, knip, type check, build, unit tests, e2e smoke tests, changeset reminder |
| `version.yml` | pushes to `main` | Changesets: opens/updates the "chore: version packages" PR (bumps `package.json`, writes `CHANGELOG.md`). Never publishes. |
| `release.yml` | tag `vX.Y.Z`, or manual run with a tag | verify → publish to npm → GitHub release |
| `pages.yml` | pushes to `main` | deploys the docs to GitHub Pages |

## Steps

1. **Changesets.** Every library PR adds one (`bun changeset`). After merge, `version.yml` opens the *chore: version packages* PR.
2. **Version bump.** Review and merge that PR. It sets `packages/svelte-pdf-mini/package.json` `version` and adds a `## X.Y.Z` section to `packages/svelte-pdf-mini/CHANGELOG.md`.
   (Without Changesets: edit the `version` and the changelog by hand, commit to `main`.)
3. **Tag** the merge commit on `main` with the same version:

   ```sh
   git switch main && git pull
   VERSION=$(jq -r .version packages/svelte-pdf-mini/package.json)
   git tag -a "v$VERSION" -m "v$VERSION"
   git push origin "v$VERSION"
   ```

   Prereleases use `vX.Y.Z-beta.N`; they are published under the npm dist-tag `next` and marked as prereleases on GitHub.

4. **Watch** the run: `gh run watch -R julien-blanchon/svelte-pdf-mini $(gh run list -R julien-blanchon/svelte-pdf-mini -w release.yml -L 1 --json databaseId -q '.[0].databaseId')`.

## What `release.yml` does

**verify** (no write permissions)

1. Checks out the tag and fails unless the tag is exactly `v` + `packages/svelte-pdf-mini/package.json` version.
2. `bun install --frozen-lockfile`, `bun run lint`, `bun run check`, `bun --filter svelte-pdf-mini build` (Vite + `svelte-package` + `publint`), downloads the test fixtures and runs `bun run test:full` (server, client and browser projects).
3. `npm pack` → `svelte-pdf-mini-X.Y.Z.tgz`, uploaded as the `npm-tarball` workflow artifact.

**publish** (`contents: write`, `id-token: write`)

1. `npm publish svelte-pdf-mini-X.Y.Z.tgz --provenance --access public` (the exact tarball that was tested). Skipped with a notice if that version is already on npm, so re-running a failed release is safe.
2. Creates the GitHub release `vX.Y.Z` titled *svelte-pdf-mini vX.Y.Z*. Notes: the `## X.Y.Z` section of `CHANGELOG.md` (extracted by `.github/scripts/changelog-section.sh`), or GitHub-generated notes when there is none, plus a link to the npm page. The tarball is attached. On a re-run the release is kept and the tarball replaced.

The e2e smoke tests are not part of the release gate (they run in `ci.yml`). Check that CI is green on the commit before tagging.

### Dry run

*Actions → Release → Run workflow*, tag `vX.Y.Z` (the tag must exist), **dry-run** checked: runs every check and `npm publish --dry-run`, creates nothing.

```sh
gh workflow run release.yml -R julien-blanchon/svelte-pdf-mini -f tag=vX.Y.Z -f dry-run=true
```

## Verify

```sh
npm view svelte-pdf-mini@X.Y.Z version dist.tarball          # published
npm view svelte-pdf-mini dist-tags                           # latest (or next) points at it
npm audit signatures                                         # in a project depending on it: provenance verified
gh release view vX.Y.Z -R julien-blanchon/svelte-pdf-mini    # notes + svelte-pdf-mini-X.Y.Z.tgz
```

The package page on npmjs.com shows the *Provenance* badge linking to the workflow run.

## If something fails

- **Tag/version mismatch**: delete the tag (`git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`), fix the version on `main`, tag again.
- **Tests fail**: fix on `main`, bump to the next patch version, tag that. Never move a tag that was already published to npm (npm versions are immutable).
- **npm publish fails with 401/403/404**: trusted publishing isn't matching (workflow name `release.yml`, repository, or the package's trusted publisher settings on npmjs.com).
- **GitHub release step fails after npm succeeded**: re-run the failed jobs; publishing is skipped and the release is created.

Older releases (≤ 0.2.0) were tagged `svelte-pdf-mini@X.Y.Z` by `changeset publish`; from now on tags are `vX.Y.Z`.
