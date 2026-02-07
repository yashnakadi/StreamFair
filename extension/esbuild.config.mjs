import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [
    'src/background/service-worker.ts',
    'src/content/main.ts',
    'src/onboarding/onboarding.ts',
    'src/popup/popup.ts',
  ],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: false,
};

// Copy static files to dist
function copyStatic() {
  const staticDir = path.resolve('../static/extension');
  const distDir = path.resolve('dist');

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // Copy manifest.json
  if (fs.existsSync(path.join(staticDir, 'manifest.json'))) {
    fs.copyFileSync(path.join(staticDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
  }

  // Copy onboarding.html
  if (fs.existsSync(path.join(staticDir, 'onboarding.html'))) {
    fs.copyFileSync(path.join(staticDir, 'onboarding.html'), path.join(distDir, 'onboarding.html'));
  }

  // Copy popup.html
  if (fs.existsSync(path.join(staticDir, 'popup.html'))) {
    fs.copyFileSync(path.join(staticDir, 'popup.html'), path.join(distDir, 'popup.html'));
  }

  // Copy icons directory
  const iconsDir = path.join(staticDir, 'icons');
  const distIconsDir = path.join(distDir, 'icons');
  if (fs.existsSync(iconsDir)) {
    if (!fs.existsSync(distIconsDir)) fs.mkdirSync(distIconsDir, { recursive: true });
    for (const file of fs.readdirSync(iconsDir)) {
      fs.copyFileSync(path.join(iconsDir, file), path.join(distIconsDir, file));
    }
  }
}

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    copyStatic();
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    await esbuild.build(buildOptions);
    copyStatic();
    console.log('[esbuild] build complete');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
