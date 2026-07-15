/**
 * Node.js packaging of the Prince PDF engine (https://www.princexml.com/).
 *
 * The Prince engine is installed alongside this package; no separate
 * installation is required, and neither installing nor launching the engine
 * downloads anything. (Converting a document that references remote images
 * or stylesheets does fetch those resources.)
 *
 * Prince may be used without a purchased license under the conditions in
 * the included Prince License Agreement; unlicensed output carries a
 * watermark on the first page. Commercial use requires an appropriate
 * license from YesLogic: https://www.princexml.com/purchase/
 *
 * Basic usage:
 *
 *     const prince = require('prince-pdf');
 *     await prince.convert('document.html', 'document.pdf');
 *     const htmlPdf = await prince.htmlToPdf('<h1>Hello</h1>');
 *     const markdownPdf = await prince.markdownToPdf('# Hello');  // 17+
 *
 * or from the command line:
 *
 *     npx prince document.html -o document.pdf
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { bundle } = require('./platform');

class PrinceError extends Error {
  constructor(returncode, stderr, messages = []) {
    const errors = messages.filter((m) => m.severity === 'err');
    let detail;
    if (errors.length) {
      detail = errors
        .map((m) => (m.location ? `${m.location}: ${m.text}` : m.text))
        .join('\n');
    } else {
      detail = (stderr || '').trim();
    }
    let message = returncode
      ? `prince exited with status ${returncode}`
      : 'prince reported failure';
    if (detail) {
      message += '\n' + detail;
    }
    super(message);
    this.name = 'PrinceError';
    this.returncode = returncode;
    this.stderr = stderr || '';
    this.messages = messages;
  }
}

/** Path to the bundled Prince engine binary. */
function executable() {
  const { dir, meta } = bundle();
  return path.join(dir, ...meta.engine.split('/'));
}

/**
 * The full argv used to invoke the bundled engine with the given arguments.
 *
 * If the PRINCE_LICENSE_FILE environment variable is set, the engine is
 * pointed at that license file; this avoids writing into node_modules,
 * which is replaced on every reinstall.
 */
function command(...args) {
  const { dir } = bundle();
  const argv = [executable(), `--prefix=${dir}`];
  if (process.env.PRINCE_LICENSE_FILE) {
    argv.push(`--license-file=${process.env.PRINCE_LICENSE_FILE}`);
  }
  argv.push(...args);
  return argv;
}

/**
 * Invoke Prince with the given argument tokens; returns the ChildProcess.
 *
 * This is a thin child_process.spawn() wrapper for callers who need raw
 * engine access; options pass through to spawn(), with stdio defaulting
 * to 'inherit'. It does NOT apply the error handling or diagnostic
 * parsing that convert() provides.
 */
function run(args = [], options = {}) {
  const argv = command(...args);
  // Default to inherited stdio like Python's subprocess.run: spawn's
  // default of piping would deadlock callers who never read the pipes.
  return spawn(argv[0], argv.slice(1), { stdio: 'inherit', ...options });
}

/** Parse --structured-log=normal output into { messages, final }. */
function parseStructuredLog(stderr) {
  const messages = [];
  let final = null;
  for (const line of stderr.split(/\r?\n/)) {
    if (line.startsWith('msg|')) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        messages.push({
          severity: parts[1],
          location: parts[2],
          text: parts.slice(3).join('|'),
        });
      }
    } else if (line.startsWith('fin|')) {
      final = line.slice('fin|'.length);
    }
  }
  return { messages, final };
}

function _convert(cliArgs, output, stdin, opts) {
  return new Promise((resolve, reject) => {
    const argv = command(
      '--structured-log=normal',
      ...cliArgs,
      '-o',
      output == null ? '-' : String(output)
    );
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.stdin.on('error', () => {}); // engine may exit before reading stdin
    child.on('close', (code) => {
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const { messages, final } = parseStructuredLog(stderr);
      for (const m of messages) {
        if (opts.onMessage) {
          opts.onMessage(m);
        } else if (m.severity === 'wrn') {
          const where = m.location ? `${m.location}: ` : '';
          console.warn(`prince: warning: ${where}${m.text}`);
        }
      }
      // fin|failure with exit status 0 is not expected, but is treated as
      // failure defensively.
      if (code !== 0 || final === 'failure') {
        reject(new PrinceError(code == null ? -1 : code, stderr, messages));
      } else {
        resolve(output == null ? Buffer.concat(stdout) : String(output));
      }
    });
    if (stdin != null) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Convert one or more input files to a PDF.
 *
 * Strings are always interpreted as filesystem paths, never as document
 * content - to convert an HTML string, use htmlToPdf(). Formats are
 * detected per file: HTML, XML, SVG, and (with a bundled Prince 17 or
 * later) Markdown.
 *
 * inputs:  a path, or an array of paths merged into one PDF.
 * output:  the PDF path to write, or null to resolve with the PDF as a
 *          Buffer.
 * options: { args, onMessage } - args is a sequence of individual
 *          command-line argument tokens, e.g. ['--baseurl', 'https://x/'];
 *          not a shell string. onMessage receives each parsed engine
 *          diagnostic; without it, warnings go to console.warn.
 *
 * Resolves with the output path (or the PDF Buffer when output is null).
 * Rejects with PrinceError on failure.
 */
async function convert(inputs, output = null, options = {}) {
  const list = typeof inputs === 'string' ? [inputs] : Array.from(inputs);
  const paths = list.map(String);
  if (!paths.length) {
    throw new TypeError('inputs must contain at least one path');
  }
  return _convert([...(options.args || []), ...paths], output, null, options);
}

/** Pipe a document string through the engine with an explicit format. */
function stringToPdf(inputFormat, content, output, options) {
  const data =
    typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return _convert(
    [`--input=${inputFormat}`, ...(options.args || []), '-'],
    output,
    data,
    options
  );
}

/**
 * Convert an HTML document given as a string (or Buffer) to a PDF.
 *
 * No temporary files are used: the document is piped to the engine's
 * stdin. Because the engine never sees a filename, relative URLs in the
 * document (images, stylesheets) are resolved against the current working
 * directory - pass a base URL to resolve them against the document's
 * original location, e.g. { args: ['--baseurl', '/path/to/assets/'] }.
 *
 * Resolves with the output path (or the PDF Buffer when output is null).
 * Rejects with PrinceError on failure.
 */
async function htmlToPdf(html, output = null, options = {}) {
  return stringToPdf('html', html, output, options);
}

/**
 * Convert a Markdown document given as a string (or Buffer) to a PDF.
 *
 * Requires a bundled engine with Markdown support (Prince 17 or later,
 * including 17 pre-release builds). Otherwise identical to htmlToPdf().
 */
async function markdownToPdf(markdown, output = null, options = {}) {
  const engine = bundle().meta.prince_version;
  // Dated pre-release builds (e.g. 20260630) trivially satisfy >= 17.
  // An unrecognized version scheme skips the guard: the engine decides.
  const m = /^\d+/.exec(engine);
  if (m && parseInt(m[0], 10) < 17) {
    throw new Error(
      'Markdown input requires Prince 17 or later; this package bundles ' +
      `Prince ${engine}. Install a 17 build with ` +
      '`npm install prince-pdf@next`, or convert the Markdown to HTML ' +
      'and use htmlToPdf().'
    );
  }
  return stringToPdf('markdown', markdown, output, options);
}

/**
 * Convert an XML document given as a string (or Buffer) to a PDF.
 *
 * Otherwise identical to htmlToPdf().
 */
async function xmlToPdf(xml, output = null, options = {}) {
  return stringToPdf('xml', xml, output, options);
}

/**
 * The bundled Prince engine's version string.
 *
 * Rejects with PrinceError if the engine cannot run at all (for example a
 * missing system library), with the loader's message attached.
 */
function version() {
  return new Promise((resolve, reject) => {
    const child = run(['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8');
      if (code !== 0 || !out.trim()) {
        reject(
          new PrinceError(
            code == null ? -1 : code,
            Buffer.concat(stderrChunks).toString('utf8')
          )
        );
      } else {
        resolve(out.split('\n')[0].trim());
      }
    });
  });
}

/**
 * Where the bundled engine looks for its license file by default.
 *
 * Prefer setting the PRINCE_LICENSE_FILE environment variable to the
 * license file's path instead of writing here: node_modules is replaced
 * whenever the package is reinstalled.
 */
function license() {
  return path.join(bundle().dir, 'license', 'license.dat');
}

module.exports = {
  PrinceError,
  command,
  convert,
  executable,
  htmlToPdf,
  license,
  markdownToPdf,
  run,
  version,
  xmlToPdf,
};
