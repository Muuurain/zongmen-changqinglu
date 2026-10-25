// 便携版一键打包脚本（无需管理员权限 / 开发者模式）
// 用法：node scripts/build-portable.js  或  npm run build:portable
// 产物：dist-portable/宗门长青录-win32-x64/ （含 宗门长青录.exe）
//       dist-portable/宗门长青录-win32-x64.zip （分发压缩包）
const fse = require('fs-extra');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT_DIR = path.join(ROOT, 'dist-portable', '宗门长青录-win32-x64');
const APP_DIR = path.join(OUT_DIR, 'resources', 'app');
const ZIP_PATH = path.join(ROOT, 'dist-portable', '宗门长青录-win32-x64.zip');
const EXE_NAME = '宗门长青录.exe';

// 7za 路径（7zip-bin 已在 electron-builder 依赖中）
let sevenZip;
try { sevenZip = require('7zip-bin').path7za; } catch (e) {
  sevenZip = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
}

if (!fse.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
  console.error('未找到 Electron 运行时，请先执行 npm install（已包含 electron）。');
  process.exit(1);
}

console.log('1/4 清理旧产物...');
fse.removeSync(OUT_DIR);
fse.removeSync(ZIP_PATH);

console.log('2/4 复制 Electron 运行时...');
fse.copySync(ELECTRON_DIST, OUT_DIR, { dereference: true });
const oldExe = path.join(OUT_DIR, 'electron.exe');
const newExe = path.join(OUT_DIR, EXE_NAME);
fse.moveSync(oldExe, newExe, { overwrite: true });

console.log('3/4 写入游戏文件...');
fse.ensureDirSync(APP_DIR);
for (const f of ['main.js', 'package.json', 'index.html']) {
  fse.copySync(path.join(ROOT, f), path.join(APP_DIR, f));
}
for (const d of ['css', 'js', 'assets', 'build']) {
  fse.copySync(path.join(ROOT, d), path.join(APP_DIR, d));
}

console.log('4/4 压缩为 zip 分发包...');
execFileSync(sevenZip, ['a', '-tzip', '-mx=5', '-y', ZIP_PATH, OUT_DIR], { stdio: 'ignore' });

const sizeZip = fse.statSync(ZIP_PATH).size;
console.log(`\n打包完成！`);
console.log(`  目录：${OUT_DIR}`);
console.log(`  可执行文件：${newExe}`);
console.log(`  分发包：${ZIP_PATH}（${(sizeZip / 1024 / 1024).toFixed(1)} MB）`);
