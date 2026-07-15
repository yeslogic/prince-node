#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { command } = require('../lib/index.js');

let argv;
try {
  argv = command(...process.argv.slice(2));
} catch (err) {
  console.error(`prince-pdf: ${err.message}`);
  process.exit(1);
}

const child = spawn(argv[0], argv.slice(1), { stdio: 'inherit' });

child.on('error', (err) => {
  console.error(`prince-pdf: ${err.message}`);
  process.exit(1);
});

// Forward termination to the engine and mirror its exit status.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('close', (code, signal) => {
  if (signal) {
    // Die by the same signal the engine did, with default disposition.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else {
    process.exit(code);
  }
});
