#!/usr/bin/env python3
"""Regenerate versions.json (and sync package/package.json) for a Prince release.

Downloads each platform artifact for the given Prince version, records its
SHA-256, converts the Prince version to an npm semver version, and rewrites
the version and optionalDependencies of the main package.

Usage:
  python scripts/update_versions.py 16.2                     # stable release
  python scripts/update_versions.py 17b1                     # beta
  python scripts/update_versions.py 20260630 --dev-of 17     # dated dev build
  python scripts/update_versions.py 16.2 --rev 1             # wrapper-only refresh

Version scheme (documented in RELEASING.md):
  stable  16.2      -> 16.2.REV   (npm patch = wrapper revision; Prince
                                   stable releases use two components)
  beta    17b1      -> 17.0.0-beta.1
  dev     20260630  -> 17.0.0-dev.20260630.REV  (with --dev-of 17)

Dev builds and betas are published under the npm dist-tag `next`, so plain
`npm install prince-pdf` keeps resolving the stable release.
"""

import argparse
import json
import re
import sys

from _common import ROOT, download, load_manifest, sha256

# Prince artifact name suffix for each npm platform key.
#
# TODO: add "linux-x64-musl" when a self-contained
# linux-generic-x86_64-musl artifact exists (the Alpine builds dynamically
# link too many system libraries to run from inside a package).
ARTIFACTS = {
    "linux-x64": "linux-generic-x86_64.tar.gz",
    "linux-arm64": "linux-generic-aarch64.tar.gz",
    "linux-arm64-musl": "linux-generic-aarch64-musl.tar.gz",
    "darwin": "macos.zip",
    "win32-x64": "win64.zip",
    "win32-arm64": "win-arm64.zip",
}

DOWNLOAD_BASE = "https://www.princexml.com/download"


def pad(version):
    """Pad a Prince version to three semver components: 16.2 -> 16.2.0."""
    parts = version.split(".")
    if not all(re.fullmatch(r"\d+", p) for p in parts) or len(parts) > 3:
        sys.exit(f"unrecognized Prince version: {version}")
    while len(parts) < 3:
        parts.append("0")
    return ".".join(parts)


def semver(prince_version, dev_of=None, rev=0):
    """Map a Prince version to the npm package version."""
    if dev_of:
        if not re.fullmatch(r"\d{8}", prince_version):
            sys.exit(
                f"dated dev builds must be YYYYMMDD, got: {prince_version}"
            )
        return f"{pad(dev_of)}-dev.{prince_version}.{rev}"
    beta = re.fullmatch(r"(\d+)b(\d+)", prince_version)
    if beta:
        if rev:
            sys.exit("--rev is not supported for betas; use the next beta")
        return f"{pad(beta.group(1))}-beta.{beta.group(2)}"
    base = pad(prince_version)
    if rev:
        major, minor, patch = base.split(".")
        if patch != "0":
            sys.exit(
                f"Prince {prince_version} already has a patch component; "
                f"pick the wrapper revision manually (see RELEASING.md)"
            )
        return f"{major}.{minor}.{rev}"
    return base


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prince_version", help="e.g. 16.2, 17b1, or 20260630")
    parser.add_argument(
        "--dev-of",
        help="the future release a dated build leads to, e.g. 17",
    )
    parser.add_argument(
        "--rev",
        type=int,
        default=0,
        help="wrapper-only revision on the same engine (default 0)",
    )
    args = parser.parse_args()

    package_version = semver(args.prince_version, args.dev_of, args.rev)
    artifacts = {}
    for key, suffix in ARTIFACTS.items():
        url = f"{DOWNLOAD_BASE}/prince-{args.prince_version}-{suffix}"
        path = download(url)
        artifacts[key] = {"url": url, "sha256": sha256(path)}
        print(f"{key}: {artifacts[key]['sha256']}")

    manifest = {
        "prince_version": args.prince_version,
        "package_version": package_version,
        "artifacts": artifacts,
    }
    (ROOT / "versions.json").write_text(json.dumps(manifest, indent=2) + "\n")

    package_json_path = ROOT / "package" / "package.json"
    package_json = json.loads(package_json_path.read_text())
    package_json["version"] = package_version
    package_json["optionalDependencies"] = {
        f"@prince-pdf/{key}": package_version for key in ARTIFACTS
    }
    package_json_path.write_text(json.dumps(package_json, indent=2) + "\n")

    print(f"\nprince {args.prince_version} -> prince-pdf {package_version}")
    print("updated versions.json and package/package.json")


if __name__ == "__main__":
    main()
