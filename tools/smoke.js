// Launches the real app with a throwaway settings folder, saves screenshots to .smoke/, then quits.
// Run: npm run smoke
//      npm run smoke:packaged   (the same test on the built app in dist\win-unpacked, after npm run dist)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electron = require('electron');

const ROOT = path.join(__dirname, '..');
const PACKAGED = process.argv.includes('--packaged');
const OUT = path.join(ROOT, PACKAGED ? '.smoke-packaged' : '.smoke');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const command = PACKAGED ? path.join(ROOT, 'dist', 'win-unpacked', 'Aeros.exe') : electron;
const child = spawn(command, PACKAGED ? [] : [ROOT], {
  env: { ...process.env, WEATHER_SMOKE_DIR: OUT },
  stdio: 'inherit',
});
const killer = setTimeout(() => { console.log('[smoke] timed out'); child.kill(); }, 60000);
child.on('exit', (code) => {
  clearTimeout(killer);
  const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
  console.log(`[smoke] exit ${code}; screenshots: ${shots.join(', ') || 'none'} in ${OUT}`);
  process.exit(code === 0 && shots.length >= 4 ? 0 : 1);
});
