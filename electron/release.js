#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

console.log(`\n📦 Releasing version ${version} (tag: ${tag})\n`);
console.log('Steps:');
console.log('  1. git add .');
console.log('  2. git commit -m "Release v' + version + '"');
console.log('  3. git tag ' + tag);
console.log('  4. git push origin main');
console.log('  5. git push origin ' + tag);
console.log('\nAfter pushing the tag, GitHub Actions will build and publish.\n');

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Run these commands now? (y/n): ', (ans) => {
  rl.close();
  if (ans.toLowerCase() === 'y' || ans === '') {
    try {
      execSync('git add .', { stdio: 'inherit' });
      execSync(`git commit -m "Release ${tag}"`, { stdio: 'inherit' });
      execSync(`git tag ${tag}`, { stdio: 'inherit' });
      console.log('\nNow run: git push origin main && git push origin ' + tag);
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
});
