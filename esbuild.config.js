import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Entry points
const entryPoints = [
  'src/background.ts',
  'src/content.ts',
  'src/popup/popup.ts',
  'src/options/options.ts',
];

// Build options
const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: isWatch,
  minify: !isWatch,
};

// Copy static files
function copyStatic() {
  mkdirSync('dist/popup', { recursive: true });
  mkdirSync('dist/options', { recursive: true });
  mkdirSync('dist/icons', { recursive: true });

  copyFileSync('manifest.json', 'dist/manifest.json');

  if (existsSync('src/popup/popup.html')) {
    copyFileSync('src/popup/popup.html', 'dist/popup/popup.html');
  }
  if (existsSync('src/popup/popup.css')) {
    copyFileSync('src/popup/popup.css', 'dist/popup/popup.css');
  }
  if (existsSync('src/options/options.html')) {
    copyFileSync('src/options/options.html', 'dist/options/options.html');
  }
  if (existsSync('src/options/options.css')) {
    copyFileSync('src/options/options.css', 'dist/options/options.css');
  }
  if (existsSync('icons')) {
    cpSync('icons', 'dist/icons', { recursive: true });
  }
}

// Build
async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    copyStatic();
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    copyStatic();
    console.log('Build complete!');
  }
}

build().catch(() => process.exit(1));
