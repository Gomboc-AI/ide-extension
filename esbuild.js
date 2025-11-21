const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copy hook files from src/orl/hooks to dist/orl/hooks
 */
function copyHooks() {
  const srcHooksDir = path.join(__dirname, 'src', 'orl', 'hooks');
  const distHooksDir = path.join(__dirname, 'dist', 'orl', 'hooks');

  // Create dist/orl/hooks directory
  if (!fs.existsSync(distHooksDir)) {
    fs.mkdirSync(distHooksDir, { recursive: true });
  }

  // Copy all .sh files from src to dist (including common.sh)
  if (fs.existsSync(srcHooksDir)) {
    const files = fs.readdirSync(srcHooksDir);
    let copiedCount = 0;
    for (const file of files) {
      if (file.endsWith('.sh')) {
        const srcFile = path.join(srcHooksDir, file);
        const distFile = path.join(distHooksDir, file);
        fs.copyFileSync(srcFile, distFile);
        // Make executable
        fs.chmodSync(distFile, 0o755);
        copiedCount++;
      }
    }
    console.log(
      `[build] Copied ${copiedCount} hook files (including common.sh) to dist/orl/hooks/`,
    );
  }
}

async function main() {
  // Copy hooks before building
  copyHooks();

  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
    // In watch mode, copy hooks on each rebuild
    ctx.onRebuild(() => {
      copyHooks();
    });
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) {
          return;
        }
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log('[watch] build finished');
    });
  },
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
