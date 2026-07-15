'use strict';

const fs = require('fs');
const path = require('path');

// The engine ships in per-platform packages listed as optionalDependencies
// of the main package: npm installs only those whose os/cpu (and, where
// supported, libc) match. This module picks the right one at runtime.
const PACKAGES = {
  'linux-x64': '@prince-pdf/linux-x64',
  'linux-arm64': '@prince-pdf/linux-arm64',
  'linux-arm64-musl': '@prince-pdf/linux-arm64-musl',
  'darwin-x64': '@prince-pdf/darwin',
  'darwin-arm64': '@prince-pdf/darwin',
  'win32-x64': '@prince-pdf/win32-x64',
  'win32-arm64': '@prince-pdf/win32-arm64',
};

function isMusl() {
  // glibc reports its version in the process report; musl does not.
  try {
    return !process.report.getReport().header.glibcVersionRuntime;
  } catch (e) {
    return fs.existsSync('/etc/alpine-release');
  }
}

function platformKey() {
  if (process.platform === 'linux') {
    return `linux-${process.arch}${isMusl() ? '-musl' : ''}`;
  }
  return `${process.platform}-${process.arch}`;
}

let cached = null;

function bundle() {
  if (cached) {
    return cached;
  }
  const key = platformKey();
  const name = PACKAGES[key];
  if (!name) {
    throw new Error(
      `prince-pdf has no Prince engine build for this platform (${key}). ` +
      'Supported platforms: Linux x64 (glibc), Linux arm64 (glibc and ' +
      'musl), macOS, Windows x64 and arm64.'
    );
  }
  let dir;
  try {
    dir = path.dirname(require.resolve(`${name}/package.json`));
  } catch (e) {
    throw new Error(
      `The Prince engine package ${name} is not installed. It is an ` +
      'optionalDependency of prince-pdf, so it is skipped when npm runs ' +
      'with --omit=optional (or --no-optional); reinstall prince-pdf ' +
      'with optional dependencies enabled.'
    );
  }
  const meta = JSON.parse(
    fs.readFileSync(path.join(dir, '_meta.json'), 'utf8')
  );
  cached = { dir, meta };
  return cached;
}

module.exports = { PACKAGES, bundle, platformKey };
