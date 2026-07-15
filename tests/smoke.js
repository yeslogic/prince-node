#!/usr/bin/env node
/**
 * Smoke test for an installed prince-pdf npm package.
 *
 * Checks that the bundled engine runs and (unless --version-only) converts
 * an HTML document to a well-formed PDF. --version-only exists for
 * environments without fonts or network, where a conversion is not
 * meaningful.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Resolve prince-pdf from the directory the test is run in, so the test
// file can live outside the project that has the package installed.
const resolved = require.resolve('prince-pdf', {
  paths: [process.cwd()],
});
const prince = require(resolved);

const HTML = `<html>
  <head><title>prince-pdf smoke test</title></head>
  <body>
    <h1>prince-pdf smoke test</h1>
    <p>If this document converts to a well-formed PDF, the bundled engine,
    its prefix resolution, and its resource tree are all working.</p>
  </body>
</html>
`;

function isPdf(data) {
  return Buffer.isBuffer(data) && data.slice(0, 5).toString() === '%PDF-';
}

async function main() {
  const versionOnly = process.argv.includes('--version-only');

  console.log(`engine: ${prince.executable()}`);
  const version = await prince.version();
  assert(version.startsWith('Prince '), `unexpected version: ${version}`);
  console.log(`version: ${version}`);

  // The `prince` bin shim, as installed into node_modules/.bin.
  const binDir = path.join(
    path.dirname(
      require.resolve('prince-pdf/package.json', { paths: [process.cwd()] })
    ),
    '..',
    '.bin'
  );
  const shim = path.join(
    binDir,
    process.platform === 'win32' ? 'prince.cmd' : 'prince'
  );
  const cliOut = execFileSync(shim, ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert(cliOut.startsWith('Prince '), `unexpected CLI output: ${cliOut}`);
  console.log(`cli: ${shim}`);

  if (!versionOnly) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prince-smoke-'));
    try {
      const src = path.join(tmp, 'in.html');
      fs.writeFileSync(src, HTML);
      const out = await prince.convert(src, path.join(tmp, 'out.pdf'));
      const data = fs.readFileSync(out);
      assert(isPdf(data), `output does not look like a PDF`);
      assert(data.length > 1000, `suspiciously small PDF (${data.length})`);
      console.log(`converted test document: ${data.length} byte PDF`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    const buf = await prince.htmlToPdf(HTML);
    assert(isPdf(buf), 'htmlToPdf output does not look like a PDF');
    console.log(`htmlToPdf (in-memory): ${buf.length} byte PDF`);

    try {
      const md = await prince.markdownToPdf('# Smoke test\n\nMarkdown *works*.\n');
      assert(isPdf(md), 'markdownToPdf output does not look like a PDF');
      console.log(`markdownToPdf: ${md.length} byte PDF`);
    } catch (err) {
      // Engines before Prince 17 have no Markdown support; the wrapper
      // must say so instead of surfacing a misleading XML parse error.
      assert(
        err.message.includes('Prince 17'),
        `unhelpful markdown error: ${err.message}`
      );
      console.log('markdownToPdf: no engine support, guarded correctly');
    }

    await assert.rejects(
      prince.convert([]),
      (err) =>
        err instanceof TypeError && err.message.includes('at least one path'),
      'convert([]) did not reject with TypeError'
    );
    console.log('empty inputs rejected with TypeError');

    await assert.rejects(
      prince.convert('/nonexistent/input.html'),
      (err) => {
        assert(err instanceof prince.PrinceError, `not a PrinceError: ${err}`);
        assert(err.messages.length, 'expected parsed engine messages');
        assert.strictEqual(err.messages[0].severity, 'err');
        console.log(`error reporting: ${JSON.stringify(err.messages[0].text)}`);
        return true;
      },
      'conversion of a missing file did not fail'
    );
  }

  console.log('smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
