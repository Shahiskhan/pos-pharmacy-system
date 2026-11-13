/**
 * Cross-platform native rebuild helper for better-sqlite3.
 *
 * 1. If a C++ toolchain (MSVC / clang / gcc) is available -> normal electron-rebuild.
 * 2. Otherwise (clean Windows machines, CI without VS Build Tools) -> download the
 *    official better-sqlite3 prebuilt binary matching the installed Electron ABI
 *    and drop it into node_modules/better-sqlite3/build/Release/.
 *
 * Either path produces a .node binary compiled against Electron's ABI, NOT Node's.
 * Using a Node-ABI binary inside Electron throws NODE_MODULE_VERSION mismatch.
 */
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const root = path.resolve(__dirname, '..');

const sqlitePkg = require(path.join(root, 'node_modules', 'better-sqlite3', 'package.json'));
const electronPkg = require(path.join(root, 'node_modules', 'electron', 'package.json'));

const ELECTRON_VERSION = electronPkg.version; // e.g. 33.4.11 -> ABI v133
const SQLITE_VERSION = sqlitePkg.version;

function hasToolchain() {
  if (process.platform === 'win32') {
    const vswhere = path.join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe'
    );
    if (!fs.existsSync(vswhere)) return false;
    try {
      const out = execFileSync(vswhere, ['-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
      return out.length > 0;
    } catch {
      return false;
    }
  }
  if (process.platform === 'darwin') {
    try {
      execFileSync('xcode-select', ['-p'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
  try {
    execFileSync('which', ['g++'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'pos-rebuild-helper' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// Electron's module ABI is NOT the electron major version (33 -> 130).
// Read it from Electron's own bundled metadata so this never drifts.
function electronAbi() {
  const versionFile = path.join(root, 'node_modules', 'electron', 'dist', 'version');
  const distVersion = fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '')
    : ELECTRON_VERSION;
  const major = Number(distVersion.split('.')[0]);
  const ABI_MAP = { 28: 119, 29: 121, 30: 123, 31: 125, 32: 128, 33: 130, 34: 132, 35: 133, 36: 135, 37: 136 };
  if (!ABI_MAP[major]) throw new Error(`Unknown Electron ABI for Electron ${distVersion}. Add it to ABI_MAP.`);
  return ABI_MAP[major];
}

async function usePrebuilt() {
  const target = `electron-v${electronAbi()}`;
  const asset = `better-sqlite3-v${SQLITE_VERSION}-${target}-${process.platform}-${process.arch}.tar.gz`;
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${SQLITE_VERSION}/${asset}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs3-'));
  const archive = path.join(tmpDir, asset);

  console.log(`[rebuild] No C++ toolchain detected. Fetching prebuilt: ${asset}`);
  await download(url, archive);

  const moduleDir = path.join(root, 'node_modules', 'better-sqlite3');
  const releaseDir = path.join(moduleDir, 'build', 'Release');
  fs.mkdirSync(releaseDir, { recursive: true });

  // The official tarball stores the binary at build/Release/, so extract at the
  // module root. `tar` ships with Windows 10+ (bsdtar) and all POSIX systems.
  execFileSync('tar', ['-xzf', archive, '-C', moduleDir], { stdio: 'inherit' });
  const binary = path.join(releaseDir, 'better_sqlite3.node');
  if (!fs.existsSync(binary)) {
    throw new Error('Prebuilt archive did not contain build/Release/better_sqlite3.node');
  }
  console.log(`[rebuild] Installed Electron ${ELECTRON_VERSION} (${target}) prebuilt into ${releaseDir}`);
}

(async () => {
  try {
    if (hasToolchain()) {
      console.log('[rebuild] C++ toolchain found -> running electron-rebuild');
      execSync('electron-rebuild -f -w better-sqlite3', { cwd: root, stdio: 'inherit' });
    } else {
      await usePrebuilt();
    }
  } catch (err) {
    console.error('[rebuild] FAILED:', err.message);
    console.error('[rebuild] Install Visual Studio Build Tools (Desktop development with C++) or check the network.');
    process.exit(1);
  }
})();
