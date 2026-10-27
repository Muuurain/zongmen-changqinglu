const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'www');
const sourceDirs = ['css', 'js', 'assets'];

async function main() {
  if (webDir === root || !webDir.startsWith(root + path.sep)) {
    throw new Error('Refusing to clean a web output directory outside the project.');
  }

  fs.rmSync(webDir, { recursive: true, force: true });
  fs.mkdirSync(webDir, { recursive: true });

  for (const dir of sourceDirs) {
    await fs.promises.cp(path.join(root, dir), path.join(webDir, dir), { recursive: true });
  }

  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = '<script src="js/data.js"></script>';
  if (!html.includes(scripts)) throw new Error('Could not locate the game script insertion point in index.html.');
  html = html.replace(scripts, '<script src="js/android-native.js"></script>\n' + scripts);
  fs.writeFileSync(path.join(webDir, 'index.html'), html, 'utf8');

  await esbuild.build({
    entryPoints: [path.join(root, 'scripts/android-native.js')],
    outfile: path.join(webDir, 'js/android-native.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2022'],
    minify: true,
    legalComments: 'none'
  });

  console.log(`Android web assets prepared in ${path.relative(root, webDir)}.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
