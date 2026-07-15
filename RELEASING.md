# Releasing prince-pdf (npm)

Maintainer documentation for building, verifying, and publishing the npm
packages. The user-facing documentation is in [README.md](README.md).

## How the packages fit together

- **`prince-pdf`** (in `package/`) is the JavaScript wrapper: the API, the
  `prince` bin shim, and TypeScript definitions. It contains no engine.
- **`@prince-pdf/<platform>`** packages each contain one platform's engine
  tree (the Prince installation prefix plus `_meta.json`). They are listed
  as exact-version `optionalDependencies` of the main package; npm installs
  only the ones whose `os`/`cpu`/`libc` fields match, and
  `package/lib/platform.js` picks the right one at runtime.

Platform keys: `linux-x64`, `linux-arm64`, `linux-arm64-musl`, `darwin`
(universal), `win32-x64`, `win32-arm64`. There is no `linux-x64-musl`
because no self-contained musl x86-64 engine build exists yet.

## Version scheme

npm versions are semver; Prince versions map as:

| Prince release | npm version |
|---|---|
| 16.2 (stable) | `16.2.0` |
| wrapper-only refresh of 16.2 | `16.2.1`, `16.2.2`, … (patch = wrapper revision) |
| 17b1 (beta) | `17.0.0-beta.1` |
| 20260630 (dated dev build) | `17.0.0-dev.20260630.0` (with `--dev-of 17`) |
| wrapper refresh of a dev build | `17.0.0-dev.20260630.1` |

The patch component is available as a wrapper revision counter because
Prince stable releases use two components. If Prince ever ships a
three-component release (e.g. 16.2.1), map it to the next free patch number
above the wrapper revisions already used and note the mapping here.

Pre-releases (`-dev.*`, `-beta.*`) sort before the final release in semver
and are published under the npm **dist-tag `next`**, so plain
`npm install prince-pdf` keeps resolving the latest stable release and
`npm install prince-pdf@next` opts into pre-releases. This mirrors
`pip install --pre` for the PyPI package.

## Release routine

1. `python scripts/update_versions.py <prince-version> [--dev-of N] [--rev N]`
   — downloads the artifacts, records checksums in `versions.json`, and
   syncs `version` + `optionalDependencies` in `package/package.json`.
2. Review the diff, commit, push, and check CI is green.
3. Tag `v<package-version>` (e.g. `v16.2.0` or `v17.0.0-dev.20260630.0`)
   and push the tag. CI rebuilds, verifies, and publishes all seven
   packages — the six platform packages first, then the main package, with
   the dist-tag chosen from the version (`next` for pre-releases, `latest`
   otherwise).

## Local build

```
python scripts/build_packages.py            # stage + npm pack everything
python scripts/build_packages.py --platform darwin --skip-main
```

Artifacts are cached in `downloads/` (override with the
`PRINCE_ARTIFACT_CACHE` environment variable). Packed tarballs land in
`dist/`. To test an unpublished build end to end:

```
mkdir /tmp/try && cd /tmp/try && npm init -y
npm install <repo>/dist/prince-pdf-<version>.tgz \
            <repo>/dist/prince-pdf-<platform>-<version>.tgz
node <repo>/tests/smoke.js
```

(Installing the platform tarball explicitly stands in for the registry
lookup that resolves the optionalDependency after publication.)

## npm setup

- Packages are published by the `yeslogic` npm organization; the
  `prince-pdf` org owns the `@prince-pdf` scope for platform packages.
- Publishing uses npm trusted publishing (OIDC) from GitHub Actions on the
  `yeslogic/prince-node` repository — no long-lived tokens. Unlike PyPI,
  npm has no "pending publisher": each package's FIRST publish must be
  done with a (short-lived, granular) token — e.g. all seven packages
  published once locally — after which the trusted-publisher
  configuration is added in each package's settings on npmjs.com and the
  token revoked. Trusted publishing needs npm CLI >= 11.5.1, and configs
  must explicitly allow the "publish" action.
- Platform packages must be published before the main package so the
  optionalDependencies resolve immediately.
