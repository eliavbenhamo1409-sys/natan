const fs = require('fs-extra');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const STATIC = path.join(ROOT, '.next', 'static');
const PUBLIC = path.join(ROOT, 'public');
const ROOT_MODULES = path.join(ROOT, 'node_modules');
const DEST_MODULES = path.join(STANDALONE, 'node_modules');

function safeCopy(src, dest, label) {
  if (fs.existsSync(src)) {
    fs.copySync(src, dest, { overwrite: true, dereference: true });
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ⚠ ${label} — source not found: ${src}`);
  }
}

async function build() {
  console.log('=== Copying static assets ===');
  safeCopy(STATIC, path.join(STANDALONE, '.next', 'static'), '.next/static');
  safeCopy(PUBLIC, path.join(STANDALONE, 'public'), 'public');
  const uploadsDir = path.join(ROOT, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    safeCopy(uploadsDir, path.join(STANDALONE, 'uploads'), 'uploads');
  }

  console.log('=== Copying Next.js runtime ===');
  safeCopy(path.join(ROOT_MODULES, 'next'), path.join(DEST_MODULES, 'next'), 'next');
  safeCopy(path.join(ROOT_MODULES, 'react'), path.join(DEST_MODULES, 'react'), 'react');
  safeCopy(path.join(ROOT_MODULES, 'react-dom'), path.join(DEST_MODULES, 'react-dom'), 'react-dom');
  safeCopy(path.join(ROOT_MODULES, 'styled-jsx'), path.join(DEST_MODULES, 'styled-jsx'), 'styled-jsx');
  safeCopy(path.join(ROOT_MODULES, 'busboy'), path.join(DEST_MODULES, 'busboy'), 'busboy');
  safeCopy(path.join(ROOT_MODULES, 'caniuse-lite'), path.join(DEST_MODULES, 'caniuse-lite'), 'caniuse-lite');
  safeCopy(path.join(ROOT_MODULES, 'postcss'), path.join(DEST_MODULES, 'postcss'), 'postcss');
  safeCopy(path.join(ROOT_MODULES, 'nanoid'), path.join(DEST_MODULES, 'nanoid'), 'nanoid');
  safeCopy(path.join(ROOT_MODULES, 'picocolors'), path.join(DEST_MODULES, 'picocolors'), 'picocolors');
  safeCopy(path.join(ROOT_MODULES, 'source-map-js'), path.join(DEST_MODULES, 'source-map-js'), 'source-map-js');

  console.log('=== Copying app dependencies ===');
  const appDeps = [
    '@google/genai', '@google/generative-ai',
    'jsonwebtoken', 'bcryptjs', 'uuid', 'pdf-lib', 'pdf-parse',
    'pg', 'xlsx', 'dotenv',
    'streamsearch',
  ];
  for (const dep of appDeps) {
    safeCopy(path.join(ROOT_MODULES, dep), path.join(DEST_MODULES, dep), dep);
  }

  console.log('=== Copying Prisma ===');
  safeCopy(path.join(ROOT_MODULES, '.prisma', 'client'), path.join(DEST_MODULES, '.prisma', 'client'), '.prisma/client');
  safeCopy(path.join(ROOT_MODULES, '@prisma', 'client'), path.join(DEST_MODULES, '@prisma', 'client'), '@prisma/client');
  safeCopy(path.join(ROOT_MODULES, '@prisma', 'engines'), path.join(DEST_MODULES, '@prisma', 'engines'), '@prisma/engines');

  console.log('=== Copying Sharp ===');
  safeCopy(path.join(ROOT_MODULES, 'sharp'), path.join(DEST_MODULES, 'sharp'), 'sharp');
  safeCopy(path.join(ROOT_MODULES, '@img'), path.join(DEST_MODULES, '@img'), '@img');

  console.log('\n=== Verifying critical modules ===');
  const critical = ['next', 'react', 'react-dom', '.prisma/client'];
  for (const mod of critical) {
    const p = path.join(DEST_MODULES, mod);
    const ok = fs.existsSync(p);
    console.log(`  ${ok ? '✓' : '✗'} ${mod} → ${p}`);
    if (!ok) {
      console.error(`FATAL: Missing critical module: ${mod}`);
      process.exit(1);
    }
  }

  console.log('\n=== Standalone ready ===');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
