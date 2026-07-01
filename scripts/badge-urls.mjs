// Print the canonical badge URLs with the taintlint logo (Lucide eye-off, ISC)
// embedded as a base64 data-URI. Usage: node scripts/badge-urls.mjs [version]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2] ?? '12.0.7';
const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logo.svg'), 'utf8');
const svg = raw
  .replace(/<!--[\s\S]*?-->\s*/g, '')
  .replace('stroke="currentColor"', 'stroke="white"')
  .replace(/\s+/g, ' ')
  .replace(/> </g, '><')
  .trim();
const logo = encodeURIComponent('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
const v = version.replaceAll('-', '--');

console.log('DEV (GitHub README):');
console.log(`https://img.shields.io/badge/taintlint-secret--safe_${v}-2ea44f?logo=${logo}`);
console.log('\nPLAYER (CurseForge, for-the-badge):');
console.log(`https://img.shields.io/badge/Secret--Safe-${v}-2ea44f?style=for-the-badge&logo=${logo}`);
console.log('\nCOUNTER:');
console.log(`https://img.shields.io/badge/taintlint-0_issues-2ea44f?logo=${logo}`);
