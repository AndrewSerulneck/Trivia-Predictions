#!/usr/bin/env node
// Direct execution uses the same coordinated admission and global budgets.
const {main,reportFailure}=require('./generate-trivia-nightly.cjs');
if(require.main===module)main(process.argv.slice(2)).catch(reportFailure);
