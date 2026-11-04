'use strict';
// Weather App UI. Talks to the main process only through window.weatherApi (preload.js).

const api = window.weatherApi;
const G = window.GraphicsSlots;
const S = window.SkinMatch;
const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  config: { refreshMinutes: 15, maxRecents: 3 },
  graphics: { root: {}, placeholders: {}, skins: [] },
  location: null,
  forecast: null,
  alerts: [],
  alertsNote: null,
  lastLoaded: 0,
  homeWeather: null, // current conditions at the home city, for the tray icon
  showTenDay: false,
  dropdownItems: [],
  firstRenderSent: false,
};

// ---------- Helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const errText = (err) => String(err && err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const sameLoc = (a, b) => !!(a && b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01);
const placeLabel = (loc) => (loc ? (loc.region ? `${loc.name}, ${loc.region}` : loc.name) : '');

const toUnit = (f) => Math.round(state.settings.unit === 'C' ? (f - 32) * 5 / 9 : f);
const deg = (f) => `${toUnit(f)}°`;
const windText = (mph) => (state.settings.unit === 'C' ? `${Math.round(mph * 1.609)} km/h` : `${Math.round(mph)} mph`);
const cardinal = (d) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];

// Open-Meteo times are already local to the city ("2026-10-29T14:00"), so read the digits directly.
function clock(iso) {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}:${iso.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
}
function hourLabel(iso) {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}
function dayName(date, index, style = 'long') {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: style });
}

function setStatus(text) {
  $('status').hidden = !text;
  $('status').textContent = text || '';
}

async function saveSettings(patch) {
  state.settings = await api.saveSettings(patch);
}

// ---------- Graphics ----------

// Real art in Graphics/ wins over anything in Graphics/_placeholders/, at any level of the chain.
function resolveGraphic(chain) {
  for (const name of chain) if (state.graphics.root[name]) return state.graphics.root[name];
  for (const name of chain) if (state.graphics.placeholders[name]) return state.graphics.placeholders[name];
  return '';
}
// The icon for a condition and time of day (src/icons-map.js). size: 'big' | 'medium' | 'small'.
// Reads the same text the panel shows. With no icon files at all, the labeled placeholders stay.
function iconSrc(code, night, size = 'small') {
  const icons = state.graphics.icons || {};
  const { skin: id } = S.pick(state.config.iconsMap || {}, Object.keys(icons), G.describe(code), night);
  return id ? icons[id][size] : resolveGraphic(G.iconChain(code, !night));
}

function applyUiIcons() {
  document.querySelectorAll('img[data-ui]').forEach((img) => {
    img.src = resolveGraphic(G.uiChain(img.dataset.ui));
  });
}

// The condition shown on the panel. The live skin reads this same text, so the two can't disagree.
const conditionText = (f) => G.describe(f.current.code);

// The skin to show: the one picked in Settings, else the live-weather match (src/skins-map.js).
// -> { skin, footer, detail } or null when there are no skin files.
function chooseSkin() {
  const skins = state.graphics.skins || [];
  if (!skins.length) return null;
  const ids = skins.map((s) => s.id);
  const picked = state.settings && state.settings.skin;
  if (picked && picked !== 'live' && ids.includes(picked)) {
    return { skin: picked, footer: `${picked} · picked`, detail: 'Picked in Settings (live matching off)' };
  }
  const f = state.forecast;
  const night = f
    ? S.isNightAt(f, f.current.time)
    : new Date().getHours() < 6 || new Date().getHours() >= 18; // weather not loaded yet: rough guess
  const text = f ? conditionText(f) : '';
  const { skin, bucket } = S.pick(state.config.skinsMap || {}, ids, text, night);
  return {
    skin,
    footer: `${skin} · live: ${text || '…'}`,
    detail: `Live weather: "${text}", ${night ? 'night' : 'day'}, matched ${bucket}`,
  };
}

function applyBackdrop() {
  const choice = chooseSkin();
  document.body.classList.toggle('skin', !!choice);
  if (choice) {
    $('backdrop').src = state.graphics.skins.find((s) => s.id === choice.skin).url;
    $('slot-debug').textContent = choice.footer;
    $('slot-debug').title = choice.detail;
    return;
  }
  $('slot-debug').title = 'Backdrop slot in use';
  const f = state.forecast;
  const chain = f
    ? G.backdropChain(G.seasonFor(f.current.time), f.current.isDay, G.skyFor(f.current.code))
    : ['backdrop_default'];
  $('backdrop').src = resolveGraphic(chain);
  $('slot-debug').textContent = chain[0];
}

// EXPERIMENT: wordmark strip. The strip shows even without the file, as empty padding.
async function applyWordmark() {
  const { showWordmark, wordmarkFile } = state.config;
  // The strip is also the window's drag handle, so with the wordmark off it stays as a slim grab bar.
  $('wordmark-strip').classList.toggle('slim', !showWordmark);
  const img = $('wordmark');
  const url = showWordmark && state.graphics.root[wordmarkFile];
  if (!url) {
    img.hidden = true;
    img.removeAttribute('src');
    return;
  }
  const box = await api.trimGraphic(wordmarkFile);
  img.style.setProperty('object-view-box', box ? `inset(${box.top}% ${box.right}% ${box.bottom}% ${box.left}%)` : 'none');
  img.src = url;
  img.hidden = false;
}

// Settings > Skin: "Live weather" plus one entry per skin file found.
function fillSkinSelect() {
  const skins = state.graphics.skins || [];
  $('skin-setting').hidden = !skins.length;
  const select = $('skin-select');
  select.innerHTML = '<option value="live">Live weather</option>'
    + skins.map((s) => `<option value="${esc(s.id)}">${esc(S.label(s.id))}</option>`).join('');
  const picked = state.settings && state.settings.skin;
  select.value = skins.some((s) => s.id === picked) ? picked : 'live';
}

async function reloadGraphics() {
  state.graphics = await api.listGraphics();
  fillSkinSelect();
  applyUiIcons();
  applyBackdrop();
  await applyWordmark();
  if (state.forecast) render();
}

// ---------- Tray ----------

function trayIconDataUrl(text) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  let font = 26;
  do {
    g.font = `bold ${font}px "Segoe UI", sans-serif`;
    font -= 1;
  } while (g.measureText(text).width > size - 2 && font > 10);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  g.strokeText(text, size / 2, size / 2 + 1);
  g.fillStyle = '#ffffff';
  g.fillText(text, size / 2, size / 2 + 1);
  return canvas.toDataURL('image/png');
}

function updateTray() {
  const home = state.settings.home;
  const w = state.homeWeather;
  if (!home || !w) {
    api.updateTray({ dataUrl: trayIconDataUrl('--'), tooltip: 'Aeros' });
    return;
  }
  api.updateTray({
    dataUrl: trayIconDataUrl(String(toUnit(w.temp))),
    tooltip: `${placeLabel(home)}: ${deg(w.temp)}${state.settings.unit}, ${G.describe(w.code)}`,
  });
}

async function refreshHomeWeather() {
  const home = state.settings.home;
  if (!home) return;
  if (sameLoc(home, state.location) && state.forecast) {
    state.homeWeather = state.forecast.current;
  } else {
    try {
      state.homeWeather = (await api.getWeather(home)).forecast.current;
    } catch { /* keep the last known temp */ }
  }
  updateTray();
}

// ---------- Loading ----------

async function loadLocation(loc, { remember = true, quiet = false } = {}) {
  if (!quiet) setStatus(`Loading ${placeLabel(loc)}…`);
  try {
    const res = await api.getWeather(loc);
    state.location = loc;
    state.forecast = res.forecast;
    state.alerts = res.alerts;
    state.alertsNote = res.alertsNote;
    state.lastLoaded = Date.now();

    const patch = { lastViewed: loc };
    if (remember && !sameLoc(loc, state.settings.home)) {
      patch.recents = [loc, ...state.settings.recents.filter((r) => !sameLoc(r, loc))].slice(0, state.config.maxRecents);
    }
    await saveSettings(patch);

    setStatus(null);
    render();
    if (sameLoc(loc, state.settings.home)) {
      state.homeWeather = res.forecast.current;
      updateTray();
    }
  } catch (err) {
    setStatus(`Couldn't load weather for ${placeLabel(loc)}: ${errText(err)}`);
  }
}

async function detectHome() {
  setStatus('Detecting your location…');
  try {
    const loc = await api.detectLocation();
    await saveSettings({ home: loc });
    await loadLocation(loc, { remember: false });
    await refreshHomeWeather();
  } catch (err) {
    setStatus(`Couldn't detect your location (${errText(err)}). Search for a city above.`);
  }
}

async function refreshAll() {
  if (state.location) await loadLocation(state.location, { remember: false, quiet: true });
  await refreshHomeWeather();
}

// ---------- Rendering ----------

function render() {
  const f = state.forecast;
  if (!f) return;
  const c = f.current;
  const today = f.daily[0];

  $('content').hidden = false;
  $('place-name').textContent = placeLabel(state.location);
  $('home-badge').hidden = !sameLoc(state.location, state.settings.home);
  $('updated').textContent = `Updated ${new Date(state.lastLoaded).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  document.querySelectorAll('#unit-toggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.unit === state.settings.unit);
  });

  // Today
  $('today-icon').src = iconSrc(c.code, S.isNightAt(f, c.time), 'big');
  $('today-temp').textContent = deg(c.temp);
  $('today-cond').textContent = conditionText(f);
  $('today-hilo').textContent = `H ${deg(today.hi)}  L ${deg(today.lo)}  ·  Feels like ${deg(c.feels)}`;
  $('stat-wind').textContent = `${windText(c.wind)} ${cardinal(c.windDir)}`;
  $('stat-humidity').textContent = `${Math.round(c.humidity)}%`;
  $('stat-sunrise').textContent = clock(today.sunrise);
  $('stat-sunset').textContent = clock(today.sunset);

  // Next 2 days
  $('next-days').innerHTML = f.daily.slice(1, 3).map((d, i) => `
    <div class="card day-card">
      <img class="wx-icon" src="${esc(iconSrc(d.code, false, 'medium'))}" alt="">
      <div>
        <div class="name">${esc(dayName(d.date, i + 1))}</div>
        <div class="muted">${esc(G.describe(d.code))}</div>
        <div class="temps">${deg(d.hi)} / <span class="muted">${deg(d.lo)}</span></div>
      </div>
    </div>`).join('');

  // 10-day
  const lows = f.daily.map((d) => d.lo);
  const highs = f.daily.map((d) => d.hi);
  const min = Math.min(...lows);
  const span = Math.max(1, Math.max(...highs) - min);
  $('ten-day').innerHTML = f.daily.map((d, i) => `
    <div class="row">
      <span>${esc(dayName(d.date, i, 'short'))}</span>
      <img class="wx-icon small" src="${esc(iconSrc(d.code, false))}" alt="" title="${esc(G.describe(d.code))}">
      <span class="pop">${d.pop ? `${d.pop}%` : ''}</span>
      <div class="range">
        <span class="lo">${deg(d.lo)}</span>
        <div class="bar"><span style="left:${((d.lo - min) / span) * 100}%;right:${100 - ((d.hi - min) / span) * 100}%"></span></div>
        <span class="hi">${deg(d.hi)}</span>
      </div>
    </div>`).join('');
  $('ten-day').hidden = !state.showTenDay;
  $('ten-day-toggle').innerHTML = state.showTenDay ? 'Hide 10-day forecast &#9652;' : 'Show 10-day forecast &#9662;';

  // Hourly (next 24 hours, starting now)
  $('hourly').innerHTML = f.hourly.map((h, i) => `
    <div class="hour${i === 0 ? ' now' : ''}">
      <span class="t">${i === 0 ? 'Now' : hourLabel(h.time)}</span>
      <img class="wx-icon small" src="${esc(iconSrc(h.code, S.isNightAt(f, h.time)))}" alt="" title="${esc(G.describe(h.code))}">
      <span>${deg(h.temp)}</span>
      <span class="pop">${h.pop ? `${h.pop}%` : ''}</span>
    </div>`).join('');

  renderAlerts();
  applyBackdrop();

  if (!state.firstRenderSent) {
    state.firstRenderSent = true;
    api.rendered();
  }
}

function renderAlerts() {
  const box = $('alerts');
  if (!state.alerts.length) {
    box.innerHTML = `<div class="alerts-none muted">${esc(state.alertsNote || 'No active weather alerts.')}</div>`;
    return;
  }
  box.innerHTML = state.alerts.map((a) => {
    const until = a.ends ? new Date(a.ends).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    const body = [a.headline, a.description, a.instruction].filter(Boolean).join('\n\n');
    return `
      <details class="alert sev-${esc(a.severity)}">
        <summary>&#9888; ${esc(a.event)} ${until ? `<span class="until">until ${esc(until)}</span>` : ''}</summary>
        <div class="body">${esc(body)}</div>
      </details>`;
  }).join('');
}

// ---------- Search & recents dropdown ----------

function showDropdown(items) {
  state.dropdownItems = items;
  const dd = $('dropdown');
  dd.innerHTML = items.map((it, i) => {
    if (it.type === 'msg') return `<div class="msg">${esc(it.text)}</div>`;
    if (it.type === 'heading') return `<div class="heading">${esc(it.text)}</div>`;
    if (it.type === 'divider') return '<hr>';
    const icon = it.ui ? `<img class="ui-icon" src="${esc(resolveGraphic(G.uiChain(it.ui)))}" alt="">` : '';
    return `<button class="item" data-index="${i}">${icon}<span>${esc(it.text)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</button>`;
  }).join('');
  dd.hidden = false;
}

function hideDropdown() {
  $('dropdown').hidden = true;
  state.dropdownItems = [];
}

function showRecents() {
  const { home, recents } = state.settings;
  const items = [];
  if (home) items.push({ type: 'pick', ui: 'home', text: placeLabel(home), sub: 'Home', loc: home, remember: false });
  if (recents.length) {
    items.push({ type: 'heading', text: 'Recent' });
    for (const r of recents) items.push({ type: 'pick', text: placeLabel(r), loc: r, remember: true });
  } else {
    items.push({ type: 'msg', text: 'Cities you search for will show up here.' });
  }
  items.push({ type: 'divider' });
  items.push({ type: 'action', ui: 'location', text: 'Detect my location (set as home)', run: detectHome });
  showDropdown(items);
}

let searchTimer = null;
let searchSeq = 0;

async function runSearch(query) {
  const seq = ++searchSeq;
  showDropdown([{ type: 'msg', text: 'Searching…' }]);
  try {
    const results = await api.searchCities(query);
    if (seq !== searchSeq) return;
    if (!results.length) {
      showDropdown([{ type: 'msg', text: 'No US cities found. Try "City" or "City, ST".' }]);
      return;
    }
    showDropdown(results.map((r) => ({ type: 'pick', text: r.name, sub: r.region, loc: r, remember: true })));
  } catch (err) {
    if (seq === searchSeq) showDropdown([{ type: 'msg', text: `Search failed: ${errText(err)}` }]);
  }
}

function pickItem(item) {
  hideDropdown();
  $('search-input').value = '';
  $('search-input').blur();
  if (item.type === 'action') item.run();
  else if (item.type === 'pick') loadLocation(item.loc, { remember: item.remember });
}

// ---------- Events ----------

function setSettingsOpen(open) {
  $('settings-panel').hidden = !open;
  $('settings-scrim').hidden = !open;
}

function wireEvents() {
  const input = $('search-input');

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      searchSeq++;
      hideDropdown();
      return;
    }
    searchTimer = setTimeout(() => runSearch(q), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = state.dropdownItems.find((it) => it.type === 'pick');
      if (first) pickItem(first);
      else if (input.value.trim().length >= 2) runSearch(input.value.trim());
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      input.value = '';
      hideDropdown();
    }
  });

  $('recents-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!$('dropdown').hidden) hideDropdown();
    else showRecents();
  });

  $('dropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('.item');
    if (btn) pickItem(state.dropdownItems[Number(btn.dataset.index)]);
  });

  document.addEventListener('click', (e) => {
    if (!$('search').contains(e.target)) hideDropdown();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('settings-panel').hidden) setSettingsOpen(false);
    else if (!$('dropdown').hidden) hideDropdown();
    else api.hideWindow();
  });

  $('unit-toggle').addEventListener('click', async (e) => {
    const unit = e.target.dataset && e.target.dataset.unit;
    if (!unit || unit === state.settings.unit) return;
    await saveSettings({ unit });
    render();
    updateTray();
  });

  $('ten-day-toggle').addEventListener('click', () => {
    state.showTenDay = !state.showTenDay;
    render();
  });

  // Mouse wheel scrolls the hourly row sideways.
  $('hourly').addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      $('hourly').scrollLeft += e.deltaY;
    }
  }, { passive: false });

  $('settings-btn').addEventListener('click', () => setSettingsOpen(true));
  $('settings-close').addEventListener('click', () => setSettingsOpen(false));
  $('settings-scrim').addEventListener('click', () => setSettingsOpen(false));
  $('skin-select').addEventListener('change', async (e) => {
    await saveSettings({ skin: e.target.value });
    applyBackdrop(); // swaps live, no restart
  });
  $('close-btn').addEventListener('click', () => api.hideWindow());
  $('update-check').addEventListener('click', () => api.checkForUpdates());
  api.on('updates:status', (text) => { $('update-status').textContent = text; });

  $('footer-link').addEventListener('click', (e) => {
    e.preventDefault();
    api.openFooterLink();
  });

  api.on('graphics:changed', reloadGraphics);
  api.on('app:refresh', refreshAll);
  api.on('window:shown', () => {
    if (state.location && Date.now() - state.lastLoaded > 10 * 60 * 1000) refreshAll();
  });
}

// ---------- Boot ----------

async function boot() {
  wireEvents();
  [state.settings, state.config] = await Promise.all([api.getSettings(), api.getConfig()]);
  $('update-status').textContent = state.config.versionLine;
  document.documentElement.style.setProperty('--wordmark-scale', state.config.wordmarkScale);
  document.documentElement.style.setProperty('--scrim', state.config.panelScrimOpacity);
  await reloadGraphics();
  updateTray();

  if (!state.settings.home) {
    await detectHome(); // first run
  } else {
    await loadLocation(state.settings.lastViewed || state.settings.home, { remember: false });
    await refreshHomeWeather();
  }

  setInterval(refreshAll, state.config.refreshMinutes * 60 * 1000);
}

boot().catch((err) => setStatus(`Startup error: ${errText(err)}`));
