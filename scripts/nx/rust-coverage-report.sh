#!/usr/bin/env bash

set -e

# `rust-test` writes cargo-llvm-cov's report (c8 only sees JavaScript), held to 100% like `coverage-report`
node --input-type=module <<'SCRIPT'
import { readFileSync } from 'node:fs';

const [{ files, totals }] = JSON.parse(readFileSync('coverage/llvm-cov.json', 'utf8')).data;
const metrics = ['functions', 'lines', 'regions'];
if (metrics.some(metric => totals[metric].covered !== totals[metric].count)) {
    console.error('Rust coverage is not 100%:');
    for (const { filename, summary } of files) {
        const counts = metrics.map(metric => `${metric} ${summary[metric].covered}/${summary[metric].count}`);
        console.error(`${filename}: ${counts.join(', ')}`);
    }
    process.exitCode = 1;
} else {
    console.log('Rust coverage is 100%');
}
SCRIPT
