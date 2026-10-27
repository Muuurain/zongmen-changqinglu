const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const variant = process.argv[2] || 'debug';
const isWindows = process.platform === 'win32';
const gradle = path.join(root, 'android', isWindows ? 'gradlew.bat' : 'gradlew');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const apkType = variant === 'install' ? 'debug' : variant;

if (!['debug', 'release', 'install'].includes(variant)) {
  console.error('Usage: node scripts/build-android-apk.js [debug|release|install]');
  process.exit(2);
}
if (!fs.existsSync(path.join(root, 'android'))) {
  console.error('Android platform is missing. Run: npx cap add android');
  process.exit(2);
}
if (!sdk) {
  console.error('Android SDK not found. Set ANDROID_SDK_ROOT (or ANDROID_HOME) to the SDK path.');
  process.exit(2);
}
fs.writeFileSync(path.join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`, 'utf8');
if (apkType === 'release' && !fs.existsSync(path.join(root, 'android', 'keystore.properties'))) {
  console.error('Release signing is not configured. Create android/keystore.properties using docs/Android_APK_打包发布指南.md.');
  process.exit(2);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: isWindows, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, [path.join(root, 'scripts', 'build-android-web.js')]);
run(process.execPath, [path.join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android']);
const task = apkType === 'release' ? 'assembleRelease' : 'assembleDebug';
const gradleArgs = ['--no-daemon', '--max-workers=2'];
if (process.env.ANDROID_GRADLE_INIT_SCRIPT) {
  gradleArgs.push('--init-script', path.resolve(process.env.ANDROID_GRADLE_INIT_SCRIPT));
}
gradleArgs.push(`:app:${task}`);
run(gradle, gradleArgs, { cwd: path.join(root, 'android') });

const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', apkType, `app-${apkType}.apk`);
if (!fs.existsSync(apk)) throw new Error(`Gradle completed without producing ${apk}`);
const artifactDir = path.join(root, 'release-android');
fs.mkdirSync(artifactDir, { recursive: true });
const output = path.join(artifactDir, `宗门长青录-v${appVersion}-android-${apkType}.apk`);
fs.copyFileSync(apk, output);
console.log(`APK created: ${path.relative(root, output)} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MiB)`);

if (variant === 'install') {
  const adb = path.join(sdk, 'platform-tools', isWindows ? 'adb.exe' : 'adb');
  run(adb, ['install', '-r', output]);
}
