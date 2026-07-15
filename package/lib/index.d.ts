/// <reference types="node" />

import { ChildProcess, SpawnOptions } from 'child_process';

/** Diagnostic severities emitted by the engine's structured log. */
export type Severity = 'err' | 'wrn' | 'inf' | 'dbg';

/** One engine diagnostic, parsed from structured log output. */
export interface Message {
  severity: Severity;
  /** The resource (file or URL) the message refers to; may be empty. */
  location: string;
  text: string;
}

/**
 * Rejection value when a conversion fails.
 *
 * messages holds the engine's parsed diagnostics; stderr holds its raw
 * log output.
 */
export class PrinceError extends Error {
  returncode: number;
  stderr: string;
  messages: Message[];
}

export interface ConvertOptions {
  /**
   * Individual command-line argument tokens, e.g.
   * ['--baseurl', 'https://x.example/']. Not a shell string: each option
   * and each value is its own element, and no shell quoting or splitting
   * is applied.
   */
  args?: readonly string[];
  /**
   * Called with every parsed engine diagnostic. When omitted, warnings
   * are printed with console.warn.
   */
  onMessage?: (message: Message) => void;
}

/**
 * Convert one or more input files to a PDF. Strings are always paths,
 * never document content - use htmlToPdf() for strings. Resolves with the
 * output path, or the PDF as a Buffer when output is null or omitted.
 */
export function convert(
  inputs: string | readonly string[],
  output: string,
  options?: ConvertOptions
): Promise<string>;
export function convert(
  inputs: string | readonly string[],
  output?: null,
  options?: ConvertOptions
): Promise<Buffer>;

/** Convert an HTML document given as a string (or Buffer) to a PDF. */
export function htmlToPdf(
  html: string | Buffer,
  output: string,
  options?: ConvertOptions
): Promise<string>;
export function htmlToPdf(
  html: string | Buffer,
  output?: null,
  options?: ConvertOptions
): Promise<Buffer>;

/**
 * Convert a Markdown document given as a string (or Buffer) to a PDF.
 * Requires a bundled Prince 17 or later (`npm install prince-pdf@next`
 * while 17 is in pre-release).
 */
export function markdownToPdf(
  markdown: string | Buffer,
  output: string,
  options?: ConvertOptions
): Promise<string>;
export function markdownToPdf(
  markdown: string | Buffer,
  output?: null,
  options?: ConvertOptions
): Promise<Buffer>;

/** Convert an XML document given as a string (or Buffer) to a PDF. */
export function xmlToPdf(
  xml: string | Buffer,
  output: string,
  options?: ConvertOptions
): Promise<string>;
export function xmlToPdf(
  xml: string | Buffer,
  output?: null,
  options?: ConvertOptions
): Promise<Buffer>;

/** The bundled Prince engine's version string. */
export function version(): Promise<string>;

/** Path to the bundled Prince engine binary. */
export function executable(): string;

/** The full argv used to invoke the bundled engine with these arguments. */
export function command(...args: string[]): string[];

/**
 * Invoke Prince with the given argument tokens; returns the ChildProcess.
 * A thin child_process.spawn() wrapper without convert()'s error handling
 * or diagnostic parsing.
 */
export function run(
  args?: readonly string[],
  options?: SpawnOptions
): ChildProcess;

/**
 * Where the bundled engine looks for its license file by default. Prefer
 * the PRINCE_LICENSE_FILE environment variable, which survives reinstalls.
 */
export function license(): string;
