#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const config = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  DIRECT_URL: process.env.DIRECT_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
};

const outPath = path.join(__dirname, '..', 'config.production.json');
fs.writeFileSync(outPath, JSON.stringify(config, null, 0));
console.log('Created config.production.json');
