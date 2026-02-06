const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Check if watch mode is enabled
const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Common build options
const buildOptions = {
  bundle: true,
  minify: false, // Set to true for production
  sourcemap: false,
  target: 'es2020',
  format: 'iife', // Immediately Invoked Function Expression for Chrome extensions
  logLevel: 'info',
};

// Build configurations for each script
const builds = [
  {
    ...buildOptions,
    entryPoints: ['src/background.ts'],
    outfile: 'dist/background.js',
  },
  {
    ...buildOptions,
    entryPoints: ['src/contentScript.ts'],
    outfile: 'dist/contentScript.js',
  },
  {
    ...buildOptions,
    entryPoints: ['src/config.ts'],
    outfile: 'dist/config.js',
  },
];

async function build() {
  try {
    if (isWatch) {
      console.log('👀 Watching for changes...\n');
      const contexts = await Promise.all(
        builds.map(async (buildConfig) => {
          const ctx = await esbuild.context(buildConfig);
          await ctx.watch();
          return ctx;
        })
      );
      
      // Keep the process running
      process.on('SIGINT', async () => {
        console.log('\n🛑 Stopping watch mode...');
        await Promise.all(contexts.map(ctx => ctx.dispose()));
        process.exit(0);
      });
    } else {
      console.log('🔨 Building extension...\n');
      await Promise.all(builds.map(config => esbuild.build(config)));
      console.log('\n✅ Build complete!');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();






