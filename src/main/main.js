// Electron main process: tray icon, popup window, start-with-Windows, IPC.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const config = require('../config');
const skinsMap = require('../skins-map');
const iconsMap = require('../icons-map');
const store = require('./store');
const weatherApi = require('./weather-api');
const icons = require('./icons');

// Smoke-test mode (tools/smoke.js): render, save screenshots to this folder, quit.
const SMOKE_DIR = process.env.WEATHER_SMOKE_DIR || null;
// Launched by Windows at login -> stay in the tray.
const START_HIDDEN = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;

const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg']; // preferred first

let win = null;
let tray = null;
let lastBlurHide = 0;
let placedAt = { x: null, y: null }; // where showWindow last put the window
let quitting = false;

if (SMOKE_DIR) app.setPath('userData', path.join(SMOKE_DIR, 'userdata'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(init);
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', (e) => e.preventDefault()); // tray app: keep running

function init() {
  app.setAppUserModelId('com.afterburn.aeros');
  store.init(app.getPath('userData'));

  // Start with Windows (registers the real .exe once packaged; dev runs don't touch login items).
  // Smoke tests skip it, so testing a built copy never registers that copy to start with Windows.
  // The name must match the entry build/installer.nsh removes on uninstall.
  if (app.isPackaged && !SMOKE_DIR) app.setLoginItemSettings({ openAtLogin: true, name: 'Aeros', args: ['--hidden'] });

  registerIpc();
  createTray();
  createWindow();
  watchGraphics();
}

// ---------- Graphics ----------

function appIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, config.APP_ICON)
    : path.join(app.getAppPath(), config.APP_ICON);
}

function graphicsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'Graphics')
    : path.join(app.getAppPath(), 'Graphics');
}

// { slotName: fileUrl } for one folder. If a slot exists in several formats, IMAGE_EXTS order wins.
function scanImages(dir) {
  const found = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return found; }
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const rank = IMAGE_EXTS.indexOf(ext);
    if (rank < 0) continue;
    const slot = path.basename(file, path.extname(file)).toLowerCase();
    if (found[slot] && found[slot].rank <= rank) continue;
    const full = path.join(dir, file);
    const mtime = fs.statSync(full).mtimeMs | 0;
    found[slot] = { rank, url: `${pathToFileURL(full).href}?v=${mtime}` };
  }
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.url]));
}

// Every Graphics/skin_*.png (or .jpg) -> [{ id, url }], found fresh on each scan (nothing hardcoded).
// PNG masters are left untouched; the UI renders a quality-85 JPG copy cached in Graphics/_cache/,
// rebuilt whenever the PNG is newer than its copy. A skin_*.jpg dropped in directly is used as-is.
const SKIN_FILE = /^(skin_.+)\.(png|jpe?g)$/i;
const SKIN_JPG_QUALITY = 85;

function skinCacheDir() {
  return path.join(graphicsDir(), '_cache');
}

function cachedSkinJpg(pngPath, id) {
  const jpgPath = path.join(skinCacheDir(), `${id}.jpg`);
  try {
    const srcTime = fs.statSync(pngPath).mtimeMs;
    if (!fs.existsSync(jpgPath) || fs.statSync(jpgPath).mtimeMs < srcTime) {
      const img = nativeImage.createFromPath(pngPath);
      if (img.isEmpty()) return null;
      fs.mkdirSync(skinCacheDir(), { recursive: true });
      fs.writeFileSync(jpgPath, img.toJPEG(SKIN_JPG_QUALITY));
    }
    return jpgPath;
  } catch {
    return null; // can't convert or write the cache: render the PNG instead
  }
}

function listSkins() {
  const dir = graphicsDir();
  const sources = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  for (const file of files) {
    const m = file.match(SKIN_FILE);
    if (!m) continue;
    const id = m[1].toLowerCase();
    const isPng = m[2].toLowerCase() === 'png';
    if (!sources[id] || isPng) sources[id] = { file: path.join(dir, file), isPng }; // PNG master wins
  }
  return Object.keys(sources).sort().map((id) => {
    const { file, isPng } = sources[id];
    const render = (isPng && cachedSkinJpg(file, id)) || file;
    const mtime = fs.statSync(render).mtimeMs | 0;
    return { id, url: `${pathToFileURL(render).href}?v=${mtime}` };
  });
}

function listGraphics() {
  const dir = graphicsDir();
  return {
    root: scanImages(dir),
    placeholders: scanImages(path.join(dir, '_placeholders')),
    skins: config.USE_SKIN ? listSkins() : [],
    icons: icons.list(dir),
  };
}

// Transparent margins of Graphics/<slot>, as percentages from each edge (for CSS object-view-box).
function trimBox(slot) {
  const file = fs.readdirSync(graphicsDir()).find((f) => path.parse(f).name.toLowerCase() === slot);
  if (!file) return null;
  const img = nativeImage.createFromPath(path.join(graphicsDir(), file));
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const px = img.toBitmap(); // BGRA
  let top = height, left = width, bottom = -1, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 16) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return null;
  const pct = (n, total) => +((n / total) * 100).toFixed(2);
  return { top: pct(top, height), right: pct(width - 1 - right, width), bottom: pct(height - 1 - bottom, height), left: pct(left, width) };
}

// Drop a file into Graphics/ and the open window picks it up without a restart.
function watchGraphics() {
  let timer = null;
  try {
    fs.watch(graphicsDir(), (_event, file) => {
      if (file === '_cache') return; // our own JPG skin copies being written
      clearTimeout(timer);
      timer = setTimeout(() => win && win.webContents.send('graphics:changed'), 300);
    });
  } catch { /* folder missing: nothing to watch */ }
}

// ---------- Window ----------

function windowBounds() {
  // Where the user last dragged it, if that spot is still on a connected screen.
  const saved = store.get().windowPos;
  const anchor = tray && tray.getBounds();
  const display = saved
    ? screen.getDisplayNearestPoint(saved)
    : anchor && anchor.width
      ? screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y })
      : screen.getPrimaryDisplay();
  const wa = display.workArea;
  // About a quarter of the screen, portrait; by default tucked into the bottom-right corner by the tray.
  const width = Math.round(Math.min(640, Math.max(420, wa.width * 0.3)));
  const height = Math.round(Math.min(wa.height - 24, Math.max(600, wa.height * 0.85)));
  if (saved) {
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    return {
      width,
      height,
      x: clamp(saved.x, wa.x, wa.x + wa.width - width),
      y: clamp(saved.y, wa.y, wa.y + wa.height - height),
    };
  }
  return { width, height, x: wa.x + wa.width - width - 12, y: wa.y + wa.height - height - 12 };
}

function createWindow() {
  win = new BrowserWindow({
    ...windowBounds(),
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#0f1622',
    title: 'Aeros',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep refreshing the tray temp while hidden
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.once('ready-to-show', () => {
    if (!START_HIDDEN || SMOKE_DIR) showWindow();
  });

  // Popup behavior: clicking anywhere else tucks it back into the tray.
  win.on('blur', () => {
    if (SMOKE_DIR || win.webContents.isDevToolsOpened()) return;
    win.hide();
    lastBlurHide = Date.now();
  });

  // Dragged by the top strip: remember the spot for next time (saved once the window settles).
  let moveTimer = null;
  win.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      const [x, y] = win.getPosition();
      if (x === placedAt.x && y === placedAt.y) return; // still where the app put it: not a user drag
      store.set({ windowPos: { x, y } });
    }, 400);
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (SMOKE_DIR) {
    win.webContents.on('console-message', (e) => console.log(`[renderer] ${e.message}`));
    setTimeout(() => takeSmokeShots('timeout'), 30000);
  }
}

function showWindow() {
  if (!win) return;
  const bounds = windowBounds();
  placedAt = { x: bounds.x, y: bounds.y };
  win.setBounds(bounds);
  win.show();
  win.focus();
  win.webContents.send('window:shown');
}

function toggleWindow() {
  if (win.isVisible()) {
    win.hide();
  } else if (Date.now() - lastBlurHide > 300) {
    // (A tray click first blurs the window; don't instantly re-open what that click just closed.)
    showWindow();
  }
}

// ---------- Tray ----------

function placeholderTrayImage() {
  // 16x16 gray dot (BGRA) until the UI draws the real temperature icon.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 49;
      const i = (y * size + x) * 4;
      buf[i] = buf[i + 1] = buf[i + 2] = 200;
      buf[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  const icon = nativeImage.createFromPath(appIconPath());
  tray = new Tray(icon.isEmpty() ? placeholderTrayImage() : icon);
  tray.setToolTip('Aeros — loading…');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Aeros', click: () => showWindow() },
    { label: 'Refresh', click: () => win && win.webContents.send('app:refresh') },
    { label: 'Reset window position', click: () => { store.set({ windowPos: null }); showWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => toggleWindow());
}

// ---------- Smoke test ----------

let smokeDone = false;
async function takeSmokeShots(reason) {
  if (!SMOKE_DIR || smokeDone) return;
  smokeDone = true;
  console.log(`[smoke] capturing (${reason})`);
  console.log(`[smoke] packaged=${app.isPackaged} version=${app.getVersion()} name=${app.getName()} graphics=${graphicsDir()} icon=${fs.existsSync(appIconPath())}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SMOKE_DIR, name), img.toPNG());
    console.log(`[smoke] saved ${name}`);
  };
  try {
    await wait(1200);
    await shot('1-main.png');
    await win.webContents.executeJavaScript(
      "document.getElementById('ten-day-toggle').click(); document.getElementById('ten-day').scrollIntoView(); true");
    await wait(500);
    await shot('2-ten-day.png');
    await win.webContents.executeJavaScript(
      "document.getElementById('recents-btn').click(); document.getElementById('content').scrollTop = 0; true");
    await wait(400);
    await shot('3-recents.png');
    await win.webContents.executeJavaScript(
      "document.body.click(); document.getElementById('settings-btn').click(); true");
    await wait(400);
    await shot('4-settings.png');
    // Settings must close three ways: the X, a click outside the panel, and Esc.
    const settingsCheck = (how) => win.webContents.executeJavaScript(`(() => {
      const panel = document.getElementById('settings-panel');
      const open = () => document.getElementById('settings-btn').click();
      ${how}
      return panel.hidden;
    })()`);
    const xBtn = "const x = document.getElementById('settings-close');";
    console.log(`[smoke] settings X region ${await win.webContents.executeJavaScript(
      `${xBtn} getComputedStyle(x).appRegion || getComputedStyle(x).webkitAppRegion`)} (should be no-drag)`);
    console.log(`[smoke] settings closed by X: ${await settingsCheck(`${xBtn} x.click();`)}`);
    console.log(`[smoke] settings closed by outside click: ${await settingsCheck(
      "open(); document.elementFromPoint(10, window.innerHeight / 2).click();")}`);
    await settingsCheck('open();');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await wait(200);
    console.log(`[smoke] settings closed by Esc: ${await win.webContents.executeJavaScript(
      "document.getElementById('settings-panel').hidden")}`);
    // Skins: live pick, then a Settings override that swaps without a restart and is remembered.
    const footer = () => win.webContents.executeJavaScript(
      "[document.getElementById('slot-debug').textContent, document.getElementById('backdrop').src.split('/').slice(-2).join('/')]");
    console.log(`[smoke] skins: ${listSkins().map((s) => s.id).join(', ')}`);
    console.log(`[smoke] live skin: ${JSON.stringify(await footer())}`);
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('settings-btn').click();
      const sel = document.getElementById('skin-select');
      sel.value = 'skin_storm';
      sel.dispatchEvent(new Event('change'));
      return true;
    })()`);
    await wait(600);
    await shot('5-skin-override.png');
    console.log(`[smoke] after picking skin_storm: ${JSON.stringify(await footer())}; saved skin=${store.get().skin}`);
    await win.webContents.executeJavaScript(`(() => {
      const sel = document.getElementById('skin-select');
      sel.value = 'live';
      sel.dispatchEvent(new Event('change'));
      document.getElementById('settings-close').click();
      return true;
    })()`);
    await wait(400);
    console.log(`[smoke] back to live: ${JSON.stringify(await footer())}; saved skin=${store.get().skin}`);
    // Live skin follows the panel: for every condition, day and night, in the real UI, the footer must
    // read the panel's text and the backdrop must be the skin the footer names. Other forecast fields
    // are planted with "Clear" so a matcher reading the wrong one shows up here (the Overcast bug).
    const panelCheck = await win.webContents.executeJavaScript(`(() => {
      const f = state.forecast;
      const saved = JSON.stringify(f);
      const out = { checked: 0, bad: [], overcastDay: '', overcastNight: '' };
      for (const code of Object.keys(G.WMO).map(Number)) {
        for (const hour of ['12:00', '23:30']) {
          f.current.code = code;
          f.current.time = f.daily[0].date + 'T' + hour;
          f.hourly[0].code = 0;
          f.daily[0].code = 0;
          render();
          const panel = $('today-cond').textContent;
          const foot = $('slot-debug').textContent;
          const skin = foot.split(' · ')[0];
          out.checked++;
          if (foot !== skin + ' · live: ' + panel || !$('backdrop').src.includes('/' + skin + '.')) out.bad.push(panel + ' -> ' + foot);
          if (code === 3) out[hour === '12:00' ? 'overcastDay' : 'overcastNight'] = 'panel "' + panel + '", footer "' + foot + '"';
        }
      }
      state.forecast = JSON.parse(saved);
      render();
      return out;
    })()`);
    console.log(`[smoke] skin follows panel: ${panelCheck.bad.length ? `FAIL ${panelCheck.bad.join('; ')}` : `ok, ${panelCheck.checked} combinations`}`);
    console.log(`[smoke] overcast day: ${panelCheck.overcastDay}`);
    console.log(`[smoke] overcast night: ${panelCheck.overcastNight}`);
    console.log(`[smoke] real panel now: ${await win.webContents.executeJavaScript("$('today-cond').textContent")}; footer: ${(await footer())[0]}`);
    // Icons: in the real UI, each slot must show the icon its own condition and time of day call for.
    // Hours are planted either side of today's sunset; daily cards are whole days, so always the day icon.
    const iconCheck = await win.webContents.executeJavaScript(`(() => {
      const f = state.forecast;
      const saved = JSON.stringify(f);
      const name = (img) => img.src.split('/').pop().replace(/_\\d+\\.png.*$/, '');
      const date = f.daily[0].date;
      const out = { found: Object.keys(state.graphics.icons), bad: [], checked: 0 };
      const expect = (where, got, want) => { out.checked++; if (got !== want) out.bad.push(where + ': ' + got + ' (want ' + want + ')'); };
      const nowCases = [[0, '12:00', 'icon_sunny'], [0, '23:30', 'icon_clear_night'], [2, '12:00', 'icon_partly_cloudy'],
        [2, '23:30', 'icon_partly_cloudy_night'], [3, '12:00', 'icon_cloudy'], [3, '23:30', 'icon_cloudy'],
        [63, '12:00', 'icon_rain'], [63, '23:30', 'icon_rain'], [95, '12:00', 'icon_storm'], [95, '23:30', 'icon_storm'],
        [73, '12:00', 'icon_snow'], [73, '23:30', 'icon_snow']];
      for (const [code, hour, want] of nowCases) {
        f.current.code = code;
        f.current.time = date + 'T' + hour;
        render();
        expect('now ' + G.describe(code) + ' ' + hour, name($('today-icon')), want);
      }
      f.hourly[0].code = 0; f.hourly[0].time = date + 'T12:00'; f.hourly[0].isDay = false;
      f.hourly[1].code = 0; f.hourly[1].time = date + 'T23:30'; f.hourly[1].isDay = true;
      f.hourly[2].code = 2; f.hourly[2].time = date + 'T23:30';
      f.daily[1].code = 0;
      f.current.time = date + 'T23:30';
      render();
      const hours = document.querySelectorAll('#hourly img');
      expect('hourly clear at noon, while now is night', name(hours[0]), 'icon_sunny');
      expect('hourly clear at night', name(hours[1]), 'icon_clear_night');
      expect('hourly partly cloudy at night', name(hours[2]), 'icon_partly_cloudy_night');
      expect('day card clear, while now is night', name(document.querySelector('#next-days img')), 'icon_sunny');
      expect('10-day clear, while now is night', name(document.querySelectorAll('#ten-day img')[1]), 'icon_sunny');
      // Every image slot should have loaded (no blanks).
      for (const img of document.querySelectorAll('.wx-icon')) if (!img.getAttribute('src')) out.bad.push('blank icon slot');
      state.forecast = JSON.parse(saved);
      render();
      return out;
    })()`);
    console.log(`[smoke] icons found: ${iconCheck.found.join(', ')}`);
    console.log(`[smoke] icons in every slot: ${iconCheck.bad.length ? `FAIL ${iconCheck.bad.join('; ')}` : `ok, ${iconCheck.checked} slots`}`);
    // Knockout: each cached copy must be clear at its corners and solid somewhere in the middle.
    const cacheDir = path.join(graphicsDir(), '_cache', 'icons');
    const badCopies = fs.readdirSync(cacheDir).filter((file) => {
      const img = nativeImage.createFromPath(path.join(cacheDir, file));
      const { width, height } = img.getSize();
      const px = img.toBitmap();
      let peak = 0;
      for (let i = 3; i < px.length; i += 4) peak = Math.max(peak, px[i]);
      const corners = [0, width - 1, width * (height - 1), width * height - 1].map((p) => px[p * 4 + 3]);
      return peak < 255 || corners.some((a) => a > 0);
    });
    console.log(`[smoke] icon knockout: ${badCopies.length ? `FAIL ${badCopies.join(', ')}` : `ok, ${fs.readdirSync(cacheDir).length} cached copies`}`);
    // One look at all the icons on the real UI: each pair of hours shows the day and the night of a condition.
    await win.webContents.executeJavaScript(`(async () => {
      await saveSettings({ skin: 'skin_night_clear' });
      const f = state.forecast;
      const saved = JSON.stringify(f);
      const date = f.daily[0].date;
      f.current.code = 0;
      f.current.time = date + 'T23:30';
      [f.daily[1].code, f.daily[2].code] = [2, 73];
      [[0, '12:00'], [0, '23:30'], [2, '12:00'], [2, '23:30'], [3, '12:00'], [63, '12:00'], [95, '12:00'], [73, '12:00']]
        .forEach(([code, hour], i) => { f.hourly[i].code = code; f.hourly[i].time = date + 'T' + hour; });
      state.showTenDay = false;
      render();
      $('content').scrollTop = 0;
      window.__savedForecast = saved;
      return true;
    })()`);
    await wait(500);
    await shot('6-icons.png');
    await win.webContents.executeJavaScript(`(async () => {
      state.forecast = JSON.parse(window.__savedForecast);
      await saveSettings({ skin: 'live' });
      render();
      return true;
    })()`);
    // Window position memory: move it, then check it was saved and would reopen there.
    console.log(`[smoke] windowPos before drag ${JSON.stringify(store.get().windowPos)} (should be undefined)`);
    win.setPosition(200, 150);
    await wait(500);
    console.log(`[smoke] saved windowPos ${JSON.stringify(store.get().windowPos)}; reopen at ${JSON.stringify(windowBounds())}`);
  } catch (err) {
    console.log(`[smoke] error: ${err.message}`);
  }
  quitting = true;
  app.quit();
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (_e, patch) => store.set(patch));
  ipcMain.handle('config:get', () => ({
    refreshMinutes: config.REFRESH_MINUTES,
    maxRecents: config.MAX_RECENTS,
    useSkin: config.USE_SKIN,
    skinsMap,
    iconsMap,
    showWordmark: config.SHOW_WORDMARK,
    wordmarkFile: config.WORDMARK_FILE.toLowerCase(),
    wordmarkScale: config.WORDMARK_SCALE,
    panelScrimOpacity: config.PANEL_SCRIM_OPACITY,
  }));
  ipcMain.handle('graphics:trim', (_e, slot) => trimBox(slot));
  ipcMain.handle('location:detect', () => weatherApi.detectLocation());
  ipcMain.handle('cities:search', (_e, query) => weatherApi.searchCities(query));
  ipcMain.handle('weather:get', (_e, loc) => weatherApi.getWeather(loc));
  ipcMain.handle('graphics:list', () => listGraphics());

  ipcMain.on('tray:update', (_e, { dataUrl, tooltip }) => {
    if (!tray) return;
    if (dataUrl && config.TRAY_MODE === 'temp') tray.setImage(nativeImage.createFromDataURL(dataUrl));
    if (tooltip) tray.setToolTip(tooltip);
  });
  ipcMain.on('app:open-footer-link', () => shell.openExternal(config.FOOTER_URL));
  ipcMain.on('window:hide', () => win && win.hide());
  ipcMain.on('app:rendered', () => takeSmokeShots('rendered'));
}
