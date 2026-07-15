# prince-pdf

Node.js packaging of [Prince](https://www.princexml.com/), the HTML-with-CSS
to PDF engine. The package installs the Prince engine for the current
platform: no separate installation, and neither installing the package nor
launching the engine downloads anything beyond the npm packages themselves.
(Prince will access the network only if a document being converted
references remote resources such as images or stylesheets.)

```
# stable Prince release
npm install prince-pdf

# Prince 17 pre-release, including Markdown input
npm install prince-pdf@next
```

```js
const prince = require('prince-pdf');

await prince.convert('document.html', 'document.pdf');

const htmlPdf = await prince.htmlToPdf('<h1>Hello</h1>');     // in-memory

// requires the Prince 17 pre-release: npm install prince-pdf@next
const markdownPdf = await prince.markdownToPdf('# Hello');
```

The package also provides the full
[command-line interface](https://www.princexml.com/doc/command-line/) as a
`prince` bin script:

```
npx prince document.html -o document.pdf
```

## Names

Install it as **`prince-pdf`**, require it as **`prince-pdf`**, run it as
**`prince`** (via `npx` or `node_modules/.bin`). Note that `npm install
prince` installs an unrelated third-party wrapper that expects a separately
installed Prince, not this package. The engine itself ships in
platform-specific packages (`@prince-pdf/linux-x64` and friends) installed
automatically as `optionalDependencies` — installing with
`--omit=optional` will break this package.

## Files vs. strings

`convert()` always interprets strings as filesystem paths, never as
document content. To convert an HTML string, use `htmlToPdf()`.

The `*ToPdf` functions pipe the document through the engine's standard
input, so the engine never sees a filename: relative URLs in the document
are resolved against the current working directory, not against wherever
the content originally came from. If a string derived from
`/tmp/report/index.html` references `images/chart.svg`, pass the original
location as a base URL:

```js
await prince.htmlToPdf(html, null, { args: ['--baseurl', '/tmp/report/'] });
```

## API

All conversion functions return Promises; the package ships TypeScript
definitions.

- `prince.convert(inputs, output = null, options = {})` — convert one or
  more files (HTML, XML, SVG; Markdown with Prince 17+; an array is merged
  into one PDF), with the format detected from each file. Extra
  command-line options go in `options.args` as a sequence of individual
  argument tokens — `{ args: ['--baseurl', 'https://x.example/'] }`, never
  a shell string like `'--baseurl https://x.example/'`. Resolves with the
  output path, or the PDF as a `Buffer` when `output` is null.
- `prince.htmlToPdf(html, output = null, options = {})`,
  `prince.markdownToPdf(markdown, ...)`, `prince.xmlToPdf(xml, ...)` —
  convert a document given as a string or Buffer, without temporary files.
  Markdown input requires a bundled Prince 17 or later
  (`npm install prince-pdf@next` while 17 is in pre-release); on older
  engines `markdownToPdf` rejects with an error saying exactly that.
- Failures reject with `PrinceError` carrying `.returncode`, raw
  `.stderr`, and `.messages` — the engine's diagnostics parsed into
  `{ severity, location, text }` objects. During successful conversions,
  engine warnings are printed with `console.warn`; pass
  `options.onMessage` to receive every diagnostic yourself instead.
- `prince.run(args = [], options = {})` — a thin `child_process.spawn()`
  wrapper for raw engine access, returning the `ChildProcess`. It does
  **not** apply the error handling or diagnostic parsing that `convert()`
  provides.
- `prince.command(...args)` — the argv array that would be run, for use
  with external process tooling (same caveats as `run()`).
- `prince.executable()` — path of the bundled engine binary.
- `prince.version()` — resolves with the engine's version string.
- `prince.license()` — the default license-file location inside the
  bundle (prefer `PRINCE_LICENSE_FILE`, which survives reinstalls).

## Licensing

Prince may be used without a purchased license under the conditions in the
included Prince License Agreement (`LICENSE-Prince.txt` in the platform
package); unlicensed output carries a watermark on the first page.
Commercial use requires an appropriate
[license from YesLogic](https://www.princexml.com/purchase/). Point the
engine at your license file with the `PRINCE_LICENSE_FILE` environment
variable (preferred — it survives reinstalls), or install it at the path
returned by `prince.license()`. The JavaScript wrapper code itself is
MIT-licensed (`LICENSE`).

## Troubleshooting

- **`No matching version found` / `notarget` errors during install**:
  these mean npm couldn't reach or match, not necessarily that the package
  doesn't exist. In sandboxed environments, check proxy settings
  (`npm config get proxy`, `HTTP_PROXY`/`NO_PROXY`) — the registry may
  only be reachable through the sandbox's egress proxy.
- **Missing or wrong fonts in minimal containers**: the package bundles
  the engine but uses the system's fonts. Install some, e.g.
  `apt-get install fonts-dejavu fontconfig` (Debian/Ubuntu) or
  `apk add fontconfig ttf-dejavu` (Alpine).
- **`libfontconfig.so.1: cannot open shared object file` (Linux x86-64)**:
  install the system fontconfig library, e.g.
  `apt-get install libfontconfig1` — installing fonts as above also
  provides it.
- **Watermark on the first page**: expected without a license — see
  Licensing above.
- **Engine package not installed**: installing with `--omit=optional`
  (or `--no-optional`) skips the platform-specific engine packages;
  reinstall without it.
- **Documents referencing remote resources**: fetching `http(s)` images
  or stylesheets requires network access at conversion time;
  self-contained local files need none.
- **Diagnosing failures**: `PrinceError.stderr` carries the engine's
  warnings and errors; add `--verbose` to `args` for more detail.

## Supported platforms

Linux x86-64 and ARM64 (glibc), musl/Alpine ARM64, macOS 10.13+
(universal), Windows x64 and ARM64. On Linux x86-64 the engine
additionally needs the system fontconfig library — in minimal containers,
`apt-get install libfontconfig1` (it usually arrives with fonts anyway).

Node.js 14 or later.

---

Maintainer documentation — how the packages are built, verified, and
released — is in [RELEASING.md](RELEASING.md). A Python equivalent of this
package is [available on PyPI](https://pypi.org/project/prince-pdf/) under
the same name.
