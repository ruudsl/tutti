#!/usr/bin/env node
/**
 * PWA Icon Generator
 *
 * This script generates PNG icons from the base SVG icon.
 * Run with: node scripts/generate-icons.js
 *
 * Requires: npm install -D sharp
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const svgPath = join(__dirname, '../public/icons/icon.svg');
const outputDir = join(__dirname, '../public/icons');

async function generateIcons() {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const svgBuffer = readFileSync(svgPath);

  for (const size of sizes) {
    const outputPath = join(outputDir, `icon-${size}x${size}.png`);

    await sharp(svgBuffer).resize(size, size).png().toFile(outputPath);

    console.log(`Generated: icon-${size}x${size}.png`);
  }

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
