const { App } = require('@capacitor/app');
const { Capacitor } = require('@capacitor/core');
const { Directory, Encoding, Filesystem } = require('@capacitor/filesystem');

const native = Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
const memory = new Map();
const pendingWrites = new Map();

function fileNameFor(key) {
  const match = /^zm_cql_save_([0-3])$/.exec(key);
  return match ? `save_${match[1]}.json` : null;
}

function enqueueWrite(key, value) {
  const name = fileNameFor(key);
  if (!name) return Promise.resolve();
  const prior = pendingWrites.get(name) || Promise.resolve();
  const next = prior.catch(() => {}).then(() => Filesystem.writeFile({
    path: name,
    data: value,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true
  }));
  pendingWrites.set(name, next);
  next.catch(error => console.warn(`Could not persist ${name}:`, error));
  return next;
}

const ready = (async () => {
  if (!native) return;
  for (let slot = 0; slot <= 3; slot++) {
    const key = `zm_cql_save_${slot}`;
    const file = fileNameFor(key);
    try {
      const result = await Filesystem.readFile({ path: file, directory: Directory.Data, encoding: Encoding.UTF8 });
      memory.set(key, result.data);
      try { localStorage.setItem(key, result.data); } catch (_) {}
    } catch (_) {
      let oldValue = null;
      try { oldValue = localStorage.getItem(key); } catch (_) {}
      if (oldValue !== null) {
        memory.set(key, oldValue);
        await enqueueWrite(key, oldValue);
      }
    }
  }

  await App.addListener('appStateChange', state => {
    window.dispatchEvent(new CustomEvent('zongmen-native-app-state', { detail: state }));
  });
  await App.addListener('backButton', state => {
    window.dispatchEvent(new CustomEvent('zongmen-native-back', { detail: state }));
  });
})();

window.AndroidAppBridge = {
  isAndroid: native,
  ready,
  getItem(key) {
    if (memory.has(key)) return memory.get(key);
    try { return localStorage.getItem(key); } catch (_) { return null; }
  },
  setItem(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch (_) {}
    if (native) enqueueWrite(key, value);
    return true;
  },
  async flush() {
    const results = await Promise.allSettled([...pendingWrites.values()]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  },
  async exit() {
    if (native) {
      await this.flush();
      await App.exitApp();
    }
  }
};
