#!/usr/bin/env python3
"""Build the prince-pdf npm packages.

For each platform key in versions.json: download the Prince release
artifact (reusing the downloads/ cache when present), verify its SHA-256
against the manifest, stage the engine's installation prefix into
staging/<key>/ with a generated package.json, and `npm pack` it into
dist/. Then pack the main package from package/.

Usage:
  python scripts/build_packages.py                       # all packages
  python scripts/build_packages.py --platform linux-x64  # one platform
  python scripts/build_packages.py --stage-only          # skip npm pack
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from _common import ROOT, discover_prefix, download, extract, load_manifest

# package.json os/cpu/libc constraints for each platform key. npm installs
# an optionalDependency only when these match (libc needs a package manager
# recent enough to know the field; lib/platform.js re-checks at runtime).
PLATFORMS = {
    "linux-x64": {"os": ["linux"], "cpu": ["x64"], "libc": ["glibc"]},
    "linux-arm64": {"os": ["linux"], "cpu": ["arm64"], "libc": ["glibc"]},
    "linux-arm64-musl": {"os": ["linux"], "cpu": ["arm64"], "libc": ["musl"]},
    "darwin": {"os": ["darwin"], "cpu": ["x64", "arm64"]},
    "win32-x64": {"os": ["win32"], "cpu": ["x64"]},
    "win32-arm64": {"os": ["win32"], "cpu": ["arm64"]},
}


def check_version_sync(manifest):
    package_json = json.loads((ROOT / "package" / "package.json").read_text())
    if package_json["version"] != manifest["package_version"]:
        sys.exit(
            f"version mismatch: package/package.json has "
            f"{package_json['version']} but versions.json has "
            f"{manifest['package_version']} (run scripts/update_versions.py)"
        )
    for key in manifest["artifacts"]:
        dep = package_json["optionalDependencies"].get(f"@prince-pdf/{key}")
        if dep != manifest["package_version"]:
            sys.exit(
                f"optionalDependencies out of sync for @prince-pdf/{key} "
                f"(run scripts/update_versions.py)"
            )


def platform_package_json(key, manifest):
    return {
        "name": f"@prince-pdf/{key}",
        "version": manifest["package_version"],
        "description": (
            f"The Prince PDF engine for {key}. Installed automatically as "
            f"a platform-specific dependency of the prince-pdf package."
        ),
        "license": "SEE LICENSE IN LICENSE-Prince.txt",
        "author": "YesLogic Pty Ltd",
        "preferUnplugged": True,
        **PLATFORMS[key],
        "homepage": "https://www.princexml.com/",
        "repository": {
            "type": "git",
            "url": "git+https://github.com/yeslogic/prince-node.git",
        },
    }


def stage(key, entry, manifest):
    archive = download(entry["url"], entry["sha256"])
    staging = ROOT / "staging" / key
    if staging.exists():
        shutil.rmtree(staging)
    with tempfile.TemporaryDirectory() as tmp:
        extract(archive, tmp)
        prefix, engine = discover_prefix(tmp)
        shutil.copytree(prefix, staging)
        # The EULA and third-party notices sit outside the prefix in the
        # Linux and macOS artifacts (the Windows prefix is the artifact
        # root, where they are already included).
        artifact_root = Path(tmp) / prefix.relative_to(tmp).parts[0]
        for name in ("LICENSE", "LICENSE.txt", "CREDITS", "CREDITS.txt", "contrib"):
            src = artifact_root / name
            if src.exists() and not (staging / name).exists():
                if src.is_dir():
                    shutil.copytree(src, staging / name)
                else:
                    shutil.copy2(src, staging / name)
    meta = {
        "engine": f"bin/{engine}",
        "prince_version": manifest["prince_version"],
        "platform": key,
    }
    (staging / "_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    shutil.copy2(ROOT / "LICENSE-Prince.txt", staging / "LICENSE-Prince.txt")
    (staging / "package.json").write_text(
        json.dumps(platform_package_json(key, manifest), indent=2) + "\n"
    )
    print(f"staged {key} (engine: {meta['engine']})")


def npm_pack(directory, dist):
    subprocess.run(
        ["npm", "pack", "--pack-destination", str(dist), str(directory)],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", action="append", help="platform key(s) to build")
    parser.add_argument("--stage-only", action="store_true", help="stage but do not pack")
    parser.add_argument("--skip-main", action="store_true", help="platform packages only")
    args = parser.parse_args()

    manifest = load_manifest()
    check_version_sync(manifest)
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)

    keys = args.platform or list(manifest["artifacts"])
    for key in keys:
        if key not in manifest["artifacts"]:
            sys.exit(
                f"unknown platform key {key}; known: "
                f"{', '.join(manifest['artifacts'])}"
            )
        if key not in PLATFORMS:
            sys.exit(f"no package.json constraints defined for {key}")
        stage(key, manifest["artifacts"][key], manifest)
        if not args.stage_only:
            npm_pack(ROOT / "staging" / key, dist)

    if not args.skip_main and not args.stage_only:
        # npm includes the README that sits in the package directory.
        shutil.copy2(ROOT / "README.md", ROOT / "package" / "README.md")
        shutil.copy2(ROOT / "LICENSE", ROOT / "package" / "LICENSE")
        npm_pack(ROOT / "package", dist)

    if not args.stage_only:
        print("\nbuilt packages:")
        for tarball in sorted(dist.glob("*.tgz")):
            print(f"  {tarball.name}")


if __name__ == "__main__":
    main()
