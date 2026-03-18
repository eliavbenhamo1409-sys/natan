const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const STATIC = path.join(ROOT, '.next', 'static');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist-electron', 'win-unpacked');

async function build() {
  console.log('=== Step 1: Building Next.js ===');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n=== Step 2: Copying static assets into standalone ===');
  const destStatic = path.join(STANDALONE, '.next', 'static');
  if (fs.existsSync(STATIC)) {
    fs.copySync(STATIC, destStatic);
    console.log('Copied .next/static');
  }
  if (fs.existsSync(PUBLIC)) {
    fs.copySync(PUBLIC, path.join(STANDALONE, 'public'));
    console.log('Copied public/');
  }
  const uploadsDir = path.join(ROOT, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    fs.copySync(uploadsDir, path.join(STANDALONE, 'uploads'));
    console.log('Copied uploads/');
  }

  console.log('\n=== Step 3: Copying Prisma engines (all platforms) ===');
  const prismaClientDir = path.join(ROOT, 'node_modules', '.prisma', 'client');
  const destPrisma = path.join(STANDALONE, 'node_modules', '.prisma', 'client');
  fs.copySync(prismaClientDir, destPrisma);
  console.log('Copied .prisma/client (all engines)');

  const prismaClientPkg = path.join(ROOT, 'node_modules', '@prisma', 'client');
  const destPrismaClient = path.join(STANDALONE, 'node_modules', '@prisma', 'client');
  fs.copySync(prismaClientPkg, destPrismaClient);
  console.log('Copied @prisma/client');

  console.log('\n=== Step 4: Copying sharp (all platforms) ===');
  const sharpDir = path.join(ROOT, 'node_modules', 'sharp');
  const destSharp = path.join(STANDALONE, 'node_modules', 'sharp');
  fs.copySync(sharpDir, destSharp);
  console.log('Copied sharp');

  const imgDir = path.join(ROOT, 'node_modules', '@img');
  const destImg = path.join(STANDALONE, 'node_modules', '@img');
  if (fs.existsSync(imgDir)) {
    fs.copySync(imgDir, destImg);
    console.log('Copied @img/* (sharp platform binaries)');
  }

  console.log('\n=== Step 5: Building Electron shell ===');
  fs.removeSync(path.join(ROOT, 'dist-electron'));
  try {
    execSync('npx electron-builder --win --config electron-builder.yml', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch {
    const pkg = require('../package.json');
    const portableExe = path.join(ROOT, 'dist-electron', `Natan Factory Records ${pkg.version}.exe`);
    const dirExe = path.join(DIST, 'Natan Factory Records.exe');
    if (!fs.existsSync(portableExe) && !fs.existsSync(dirExe)) {
      throw new Error('Electron build failed - exe not found');
    }
    console.log('(Wine metadata warnings ignored - exe was created successfully)');
  }

  if (fs.existsSync(DIST)) {
    console.log('\n=== Step 6: Copying standalone server (dir build) ===');
    const serverDest = path.join(DIST, 'resources', 'server');
    fs.copySync(STANDALONE, serverDest);
    console.log('Copied to', serverDest);
  }

  const outPath = fs.existsSync(DIST) ? DIST : path.join(ROOT, 'dist-electron');
  const totalSize = execSync(`du -sh "${outPath}"`, { encoding: 'utf8' }).trim();
  console.log('\n=== Build complete! ===');
  console.log('Output at:', outPath);
  console.log('Total size:', totalSize.split('\t')[0]);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
