// Runs the real update check on a built Aeros.exe against the live GitHub Releases, then quits.
// Popups are recorded rather than shown, and nothing installs. Downloads and settings stay in .update-test/.
// Run: node tools/test-updates.js [path to Aeros.exe] [extra args, e.g. --proxy-server=http://127.0.0.1:9]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const exe = process.argv[2] || path.join(ROOT, 'dist', 'win-unpacked', 'Aeros.exe');
const OUT = path.join(ROOT, '.update-test', 'run');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const child = spawn(exe, process.argv.slice(3), {
  env: {
    ...process.env,
    WEATHER_SMOKE_DIR: OUT,
    WEATHER_UPDATE_TEST: '1',
    LOCALAPPDATA: OUT, // the updater downloads into LOCALAPPDATA; keep that inside this folder
  },
  stdio: 'inherit',
});
const killer = setTimeout(() => { console.log('[update test] timed out'); child.kill(); }, 420000);
child.on('exit', (code) => {
  clearTimeout(killer);
  const pending = path.join(OUT, 'aeros-updater', 'pending');
  const files = fs.existsSync(pending) ? fs.readdirSync(pending) : [];
  console.log(`[update test] exit ${code}; downloaded: ${files.join(', ') || 'nothing'}`);
  process.exit(code === 0 ? 0 : 1);
});
