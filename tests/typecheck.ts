/**
 * Compile-time fixture for the handwritten declarations in
 * package/lib/index.d.ts. Never executed: `tsc -p tests` checks that the
 * overloads resolve to the intended types and that representative misuse
 * is rejected (each @ts-expect-error line fails the build if the
 * "erroneous" call ever starts type-checking).
 */

import * as prince from '../package/lib/index';

async function returnTypes(): Promise<void> {
  // With an output path: resolves with the path (string).
  const a: string = await prince.convert('in.html', 'out.pdf');
  const b: string = await prince.htmlToPdf('<h1>x</h1>', 'out.pdf');
  const c: string = await prince.markdownToPdf('# x', 'out.pdf');
  const d: string = await prince.xmlToPdf('<r/>', 'out.pdf');

  // Without an output path (omitted or null): resolves with a Buffer.
  const e: Buffer = await prince.convert('in.html');
  const f: Buffer = await prince.convert(['a.html', 'b.html'], null);
  const g: Buffer = await prince.htmlToPdf('<h1>x</h1>');
  const h: Buffer = await prince.markdownToPdf(Buffer.from('# x'), null);
  const i: Buffer = await prince.xmlToPdf('<r/>');

  // @ts-expect-error a Buffer result is not a string
  const j: string = await prince.convert('in.html');
  // @ts-expect-error a path result is not a Buffer
  const k: Buffer = await prince.htmlToPdf('<h1>x</h1>', 'out.pdf');

  void [a, b, c, d, e, f, g, h, i, j, k];
}

async function options(): Promise<void> {
  // args accepts readonly arrays of argument tokens.
  const args = ['--baseurl', 'https://x.example/'] as const;
  await prince.convert('in.html', 'out.pdf', { args });

  // onMessage receives typed diagnostics.
  await prince.htmlToPdf('<h1>x</h1>', null, {
    onMessage: (m: prince.Message) => {
      const s: prince.Severity = m.severity;
      const loc: string = m.location;
      const text: string = m.text;
      void [s, loc, text];
    },
  });

  // @ts-expect-error args is a token array, never a shell string
  await prince.convert('in.html', 'out.pdf', { args: '--verbose' });
  // @ts-expect-error onMessage receives a Message, not a string
  await prince.htmlToPdf('x', null, { onMessage: (m: string) => m });
  // @ts-expect-error document content must be a string or Buffer
  await prince.htmlToPdf(42);
}

function miscellaneous(): void {
  const version: Promise<string> = prince.version();
  const exe: string = prince.executable();
  const licensePath: string = prince.license();
  const argv: string[] = prince.command('--version');
  const child = prince.run(['--version'], { stdio: 'ignore' });
  child.on('close', (code: number | null) => void code);

  const err = new Error('placeholder') as unknown;
  if (err instanceof prince.PrinceError) {
    const rc: number = err.returncode;
    const stderr: string = err.stderr;
    const messages: prince.Message[] = err.messages;
    void [rc, stderr, messages];
  }

  void [version, exe, licensePath, argv];
}

void [returnTypes, options, miscellaneous];
