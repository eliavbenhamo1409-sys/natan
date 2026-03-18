const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const STATIC = path.join(ROOT, '.next', 'static');
const PUBLIC = path.join(ROOT, 'public');

async function build() {
  console.log('=== Copying static assets ===');
  const destStatic = path.join(STANDALONE, '.next', 'static');
  fs.copySync(STATIC, destStatic);
  fs.copySync(PUBLIC, path.join(STANDALONE, 'public'));
  const uploadsDir = path.join(ROOT, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    fs.copySync(uploadsDir, path.join(STANDALONE, 'uploads'));
  }

  console.log('=== Copying Prisma engines ===');
  fs.copySync(path.join(ROOT, 'node_modules', '.prisma', 'client'), path.join(STANDALONE, 'node_modules', '.prisma', 'client'));
  fs.copySync(path.join(ROOT, 'node_modules', '@prisma', 'client'), path.join(STANDALONE, 'node_modules', '@prisma', 'client'));
  if (fs.existsSync(path.join(ROOT, 'node_modules', '@prisma', 'engines'))) {
    fs.copySync(path.join(ROOT, 'node_modules', '@prisma', 'engines'), path.join(STANDALONE, 'node_modules', '@prisma', 'engines'));
  }

  console.log('=== Copying Sharp ===');
  fs.copySync(path.join(ROOT, 'node_modules', 'sharp'), path.join(STANDALONE, 'node_modules', 'sharp'));
  if (fs.existsSync(path.join(ROOT, 'node_modules', '@img'))) {
    fs.copySync(path.join(ROOT, 'node_modules', '@img'), path.join(STANDALONE, 'node_modules', '@img'));
  }

  console.log('=== Standalone ready ===');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
