#!/usr/bin/env node
// A blanket restore discards duplicate memory and is deliberately retired.
console.error('Blanket Speed Trivia restore is disabled. Use manage-speed-trivia-retirement.cjs --undo with the original applied manifest; every restored row must pass current admission.');
process.exitCode=1;
