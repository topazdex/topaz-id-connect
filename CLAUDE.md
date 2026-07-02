# CLAUDE.md

Guidance for Claude Code / agents working in this repository.

## What this is

`@topazdex/id-connect` — a thin partner SDK that wraps Privy's cross-app /
global-wallet connector so third-party dapps add **Topaz ID** login. Published to
npm as a public scoped package (`@topazdex`). The consumer demo lives in
`../topaz-id-connect-demo`.

## Commands (Yarn 4 — never npm/pnpm)

- `yarn typecheck` — `tsc --noEmit`
- `yarn test` — Vitest (`src/**/*.test.ts`)
- `yarn build` — tsup; emits ESM + CJS + `.d.ts`/`.d.cts` for every entrypoint
- `yarn test:build` — `publint --strict` + `attw --pack` (packaging/types lint)
- `yarn dev` — `tsup --watch`

Before calling work done, run `typecheck` + `test` + `build` + `test:build` — that
is exactly what CI (`.github/workflows/ci.yml`) runs on push/PR to `main`.

## Entrypoints (keep this map intact)

| Subpath | Source | Exports |
| --- | --- | --- |
| `.` | `src/index.ts` | constants + profile helpers — **pure fetch, zero framework deps** |
| `./connectors` | `src/connectors.ts` | `topazIdWallet`, `topazIdConnector`, `TOPAZ_ID_CHAIN` |
| `./actions` | `src/actions.ts` | `createTopazIdClient`, `txCall`, `contractCall`, `isTopazIdConnectorId` — viem only, no framework deps |
| `./rainbow-kit` | `src/rainbow-kit.ts` | **deprecated** alias of `./connectors` (back-compat only) |
| `./react` | `src/react.tsx` | `TopazIdProvider`, `useTopazIdLogin`, `useTopazIdClient`, `useTopazIdProfile` |
| `./privy` | `src/privy.tsx` | `TopazIdPrivyProvider`, `useTopazIdCrossAppLogin`, `topazIdLoginMethod` |

Shared: `src/constants.ts`, `src/profile.ts`.

## Conventions

- **Backward compatibility is a hard rule.** Never remove or rename an existing
  export or subpath without leaving a deprecation alias (see `rainbow-kit.ts`).
- All peer deps are **optional** and kept `external` in tsup. Don't pull framework
  deps (wagmi/viem/react/rainbowkit) into the root `.` entry — it must stay pure.
- `package.json#exports` use per-condition `types` + a matching `typesVersions`
  block. After touching `exports`, run `yarn test:build` so `attw` stays green
  across `node10`/`node16`/`bundler`.
- The package ships `src/` (for working sourcemaps + go-to-definition); test files
  are excluded via the `files` negation.
- No `"use client"` in library source — consumers draw that boundary.

## Release process — auto-publish on GitHub Release

Publishing is automated by `.github/workflows/publish.yml`. It triggers **only when
a GitHub Release is _published_** — not on a push to `main` and not on a bare tag
push. It uses npm **OIDC trusted publishing** (no `NPM_TOKEN` secret) and generates
provenance automatically.

To cut a release:

1. Land all changes on `main`; confirm CI is green.
2. Bump `version` in `package.json` (semver). This is a pre-1.0 package, so treat a
   **minor** bump as the feature/breaking bump — note that `^0.x` consumers do
   **not** automatically cross a minor (`^0.1.1` excludes `0.2.0`).
3. Commit (`Release vX.Y.Z`) and push to `main`.
4. Publish a GitHub Release whose tag is `vX.Y.Z`. The tag minus its leading `v`
   **must equal** `package.json#version`, or the workflow fails its verify step:
   ```bash
   gh release create vX.Y.Z --title vX.Y.Z --generate-notes
   ```
5. The Publish workflow checks out `main`, builds, verifies tag == version, and runs
   `npm publish`. Watch it under the repo's **Actions** tab.
6. Verify: `npm view @topazdex/id-connect version`.

Notes / gotchas:

- **Do not run `npm publish` locally.** Releases go through the workflow so they get
  OIDC auth + provenance.
- Bump the version **before** creating the Release — the tag-vs-version check will
  block a mismatch.
- One-time setup (already done): the npm package's "trusted publisher" is configured
  on npmjs.com to point at this repo + `publish.yml`. The workflow upgrades npm to
  the latest because OIDC trusted publishing needs npm ≥ 11.5.1.
- Don't add a top-level `registry-url` to `setup-node` in `publish.yml` — it writes
  an `.npmrc` with an empty `NODE_AUTH_TOKEN` that shadows the OIDC token exchange.
