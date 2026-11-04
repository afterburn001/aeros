// Phase 1 checks: syntax of every JS file, placeholder coverage for every slot chain, live API calls.
// Run: npm run check
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const G = require('../src/renderer/graphics-slots');
const SkinMatch = require('../src/renderer/skin-match');
const weatherApi = require('../src/main/weather-api');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const pass = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

function checkSyntax() {
  console.log('Syntax');
  for (const file of [...jsFiles(path.join(ROOT, 'src')), ...jsFiles(path.join(ROOT, 'tools'))]) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status === 0) pass(path.relative(ROOT, file));
    else fail(`${path.relative(ROOT, file)}\n${r.stderr}`);
  }
}

function checkSlots() {
  console.log('Graphics slots');
  const dir = path.join(ROOT, 'Graphics', '_placeholders');
  const have = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.parse(f).name) : []);
  const missing = G.placeholderSlots().filter((s) => !have.has(s.slot)).map((s) => s.slot);
  if (missing.length) fail(`missing placeholders: ${missing.join(', ')} (run npm run placeholders)`);
  else pass(`${have.size} placeholders present`);

  // Every weather code, season, and day/night must resolve to some placeholder.
  let unresolved = 0;
  for (const code of Object.keys(G.WMO).map(Number)) {
    for (const isDay of [true, false]) {
      if (!G.iconChain(code, isDay).some((n) => have.has(n))) unresolved++;
      for (const season of G.SEASONS) {
        if (!G.backdropChain(season, isDay, G.skyFor(code)).some((n) => have.has(n))) unresolved++;
      }
    }
  }
  if (unresolved) fail(`${unresolved} weather combinations have no graphic`);
  else pass('every weather code × season × day/night resolves to a graphic');
}

function checkSkins() {
  console.log('Skins');
  const skinsMap = require('../src/skins-map');
  const files = fs.readdirSync(path.join(ROOT, 'Graphics'));
  const ids = [...new Set(files.map((f) => (f.match(/^(skin_.+)\.(png|jpe?g)$/i) || [])[1]).filter(Boolean)
    .map((s) => s.toLowerCase()))].sort();
  pass(`${ids.length} skins found: ${ids.join(', ')}`);

  // [condition text, night?, expected skin with the files in Graphics/ right now]
  const cases = [
    ['Sunny', false, 'skin_sunny_day'], ['Clear', false, 'skin_sunny_day'], ['Fair', false, 'skin_sunny_day'],
    ['Mostly Sunny', false, 'skin_partly_cloudy_day'], ['Partly Cloudy', false, 'skin_partly_cloudy_day'],
    ['Mostly Cloudy', false, 'skin_cloudy_day'], ['Overcast', false, 'skin_cloudy_day'], ['Fog/Mist', false, 'skin_cloudy_day'],
    ['Light Rain', false, 'skin_rain'], ['Rain Showers', false, 'skin_rain'], ['Drizzle', false, 'skin_rain'],
    ['Thunderstorms and Rain', false, 'skin_storm'], ['Severe Thunderstorm', true, 'skin_storm'],
    ['Clear', true, 'skin_night_clear'], ['Mostly Clear', true, 'skin_night_clear'], ['Fair', true, 'skin_night_clear'],
    ['Partly Cloudy', true, 'skin_night_partly_cloudy'], ['Mostly Cloudy', true, 'skin_night_partly_cloudy'],
    ['Light Rain and Fog', true, 'skin_rain'],
    ['Smoke', false, 'skin_sunny_day'], ['Smoke', true, 'skin_night_clear'], ['', true, 'skin_night_clear'],
  ];

  // Every condition the panel can show, as [day skin, night skin]. A new label fails until it's listed here.
  const clear = ['skin_sunny_day', 'skin_night_clear'];
  const partly = ['skin_partly_cloudy_day', 'skin_night_partly_cloudy'];
  const cloudy = ['skin_cloudy_day', 'skin_night_partly_cloudy'];
  const rain = ['skin_rain', 'skin_rain'];
  const storm = ['skin_storm', 'skin_storm'];
  const panel = {
    Clear: clear, 'Mostly Clear': clear, 'Partly Cloudy': partly, Overcast: cloudy,
    Fog: cloudy, 'Freezing Fog': cloudy,
    'Light Drizzle': rain, Drizzle: rain, 'Heavy Drizzle': rain, 'Freezing Drizzle': rain,
    'Light Rain': rain, Rain: rain, 'Heavy Rain': rain, 'Freezing Rain': rain,
    'Light Showers': rain, Showers: rain, 'Heavy Showers': rain,
    'Light Snow': cloudy, Snow: cloudy, 'Heavy Snow': cloudy, 'Snow Grains': cloudy,
    'Snow Showers': cloudy, 'Heavy Snow Showers': cloudy,
    Thunderstorm: storm, 'Thunderstorm, Hail': storm,
  };
  const labels0 = [...new Set(Object.keys(G.WMO).map((code) => G.describe(Number(code))))];
  const unlisted = labels0.filter((l) => !panel[l]);
  if (unlisted.length) fail(`panel conditions missing from this test: ${unlisted.join(', ')}`);
  else {
    for (const l of labels0) cases.push([l, false, panel[l][0]], [l, true, panel[l][1]]);
    pass(`all ${labels0.length} conditions the panel can show are covered, day and night`);
  }
  const wrong = cases.filter(([text, night, want]) => ids.includes(want) && SkinMatch.pick(skinsMap, ids, text, night).skin !== want)
    .map(([text, night, want]) => `"${text}" ${night ? 'night' : 'day'} -> ${SkinMatch.pick(skinsMap, ids, text, night).skin} (want ${want})`);
  if (wrong.length) fail(`skin matching:\n        ${wrong.join('\n        ')}`);
  else pass(`${cases.length} condition phrases match the expected skin (day + night)`);

  // Missing skins must still give something: one lone skin, and none at all.
  const lone = SkinMatch.pick(skinsMap, ['skin_storm'], 'Clear', true).skin;
  const none = SkinMatch.pick(skinsMap, [], 'Clear', true).skin;
  if (lone === 'skin_storm' && none === null) pass('fallbacks: one skin left -> that skin; no skins -> normal backdrop');
  else fail(`fallbacks: lone=${lone}, none=${none}`);

  const labels = { skin_night_partly_cloudy: 'Partly cloudy night', skin_sunny_day: 'Sunny day', skin_rain: 'Rain' };
  const badLabels = Object.entries(labels).filter(([id, want]) => SkinMatch.label(id) !== want);
  if (badLabels.length) fail(`labels: ${badLabels.map(([id]) => `${id} -> ${SkinMatch.label(id)}`).join(', ')}`);
  else pass('readable names (skin_night_partly_cloudy -> "Partly cloudy night")');
}

function checkIcons() {
  console.log('Icons');
  const iconsMap = require('../src/icons-map');
  const ids = fs.readdirSync(path.join(ROOT, 'Graphics', 'icons'))
    .map((f) => (f.match(/^(icon_.+)\.png$/i) || [])[1]).filter(Boolean).map((s) => s.toLowerCase()).sort();
  pass(`${ids.length} icons found: ${ids.join(', ')}`);

  // Every condition the panel can show, as [day icon, night icon]. A new label fails until it's listed here.
  const sun = ['icon_sunny', 'icon_clear_night'];
  const partly = ['icon_partly_cloudy', 'icon_partly_cloudy_night'];
  const cloud = ['icon_cloudy', 'icon_cloudy'];
  const rain = ['icon_rain', 'icon_rain'];
  const storm = ['icon_storm', 'icon_storm'];
  const snow = ['icon_snow', 'icon_snow'];
  const panel = {
    Clear: sun, 'Mostly Clear': sun, 'Partly Cloudy': partly, Overcast: cloud, Fog: cloud, 'Freezing Fog': cloud,
    'Light Drizzle': rain, Drizzle: rain, 'Heavy Drizzle': rain, 'Freezing Drizzle': rain,
    'Light Rain': rain, Rain: rain, 'Heavy Rain': rain, 'Freezing Rain': rain,
    'Light Showers': rain, Showers: rain, 'Heavy Showers': rain,
    'Light Snow': snow, Snow: snow, 'Heavy Snow': snow, 'Snow Grains': snow,
    'Snow Showers': snow, 'Heavy Snow Showers': snow,
    Thunderstorm: storm, 'Thunderstorm, Hail': storm,
  };
  const pickIcon = (text, night, have = ids) => SkinMatch.pick(iconsMap, have, text, night).skin;
  const labels = [...new Set(Object.keys(G.WMO).map((code) => G.describe(Number(code))))];
  const unlisted = labels.filter((l) => !panel[l]);
  if (unlisted.length) fail(`panel conditions missing from this test: ${unlisted.join(', ')}`);
  const wrong = labels.filter((l) => panel[l]).flatMap((l) => [false, true]
    .filter((night) => ids.includes(panel[l][night ? 1 : 0]) && pickIcon(l, night) !== panel[l][night ? 1 : 0])
    .map((night) => `"${l}" ${night ? 'night' : 'day'} -> ${pickIcon(l, night)} (want ${panel[l][night ? 1 : 0]})`));
  if (wrong.length) fail(`icon matching:\n        ${wrong.join('\n        ')}`);
  else pass(`all ${labels.length} panel conditions match the expected icon, day and night`);

  // The other words in the map, which the panel's labels don't use today.
  const extras = [['Sunny', false, 'icon_sunny'], ['Fair', false, 'icon_sunny'], ['Fair', true, 'icon_clear_night'],
    ['Partly Sunny', false, 'icon_partly_cloudy'], ['Mostly Sunny', false, 'icon_partly_cloudy'],
    ['Scattered Clouds', true, 'icon_partly_cloudy_night'], ['Mostly Cloudy', false, 'icon_cloudy'],
    ['Mostly Cloudy', true, 'icon_cloudy'], ['Severe Storm', true, 'icon_storm'],
    ['Flurries', false, 'icon_snow'], ['Sleet', true, 'icon_snow'], ['Rain and Snow', false, 'icon_snow']];
  const wrongExtras = extras.filter(([t, n, want]) => ids.includes(want) && pickIcon(t, n) !== want)
    .map(([t, n, want]) => `"${t}" -> ${pickIcon(t, n)} (want ${want})`);
  if (wrongExtras.length) fail(`icon words: ${wrongExtras.join(', ')}`);
  else pass(`${extras.length} more map phrases match the expected icon`);

  // Never blank: unknown conditions and missing files still give an icon, and a night icon at night if any exists.
  const unknownDay = pickIcon('Unknown', false);
  const unknownNight = pickIcon('Volcanic Ash', true);
  const nightOnly = pickIcon('Clear', true, ['icon_sunny', 'icon_partly_cloudy_night']);
  const lone = pickIcon('Rain', false, ['icon_sunny']);
  if (unknownDay && unknownNight && nightOnly === 'icon_partly_cloudy_night' && lone === 'icon_sunny' && pickIcon('Rain', false, []) === null) {
    pass(`fallbacks: unknown -> ${unknownDay} / ${unknownNight}; missing files -> closest; no files -> placeholders`);
  } else fail(`icon fallbacks: ${unknownDay}, ${unknownNight}, ${nightOnly}, ${lone}`);

  // Day/night is per time slot, from that date's own sunrise and sunset.
  const f = { daily: [{ date: '2026-11-03', sunrise: '2026-11-03T06:17', sunset: '2026-11-03T16:57' },
    { date: '2026-11-04', sunrise: '2026-11-04T06:18', sunset: '2026-11-04T16:56' }] };
  const slots = [['2026-11-03T12:00', false], ['2026-11-03T20:00', true], ['2026-11-04T05:00', true], ['2026-11-04T16:56', true], ['2026-11-04T16:55', false]];
  const badSlots = slots.filter(([t, want]) => SkinMatch.isNightAt(f, t) !== want).map(([t]) => t);
  if (badSlots.length) fail(`day/night per slot: ${badSlots.join(', ')}`);
  else pass('day/night follows each time slot, including hours in tomorrow');
}

async function checkApis() {
  console.log('Live APIs');
  let city;
  try {
    const results = await weatherApi.searchCities('Austin, TX');
    city = results[0];
    if (city && city.region === 'Texas') pass(`geocoding: "Austin, TX" -> ${city.name}, ${city.region}`);
    else fail(`geocoding: unexpected result ${JSON.stringify(results[0])}`);
  } catch (err) { fail(`geocoding: ${err.message}`); }
  if (!city) return;

  try {
    const w = await weatherApi.getWeather(city);
    const f = w.forecast;
    if (f.daily.length === 10 && f.hourly.length === 24 && Number.isFinite(f.current.temp)) {
      pass(`forecast: ${Math.round(f.current.temp)}°F, ${G.describe(f.current.code)}, ${f.daily.length} days, ${f.hourly.length} hours`);
    } else fail(`forecast: unexpected shape (days=${f.daily.length}, hours=${f.hourly.length})`);
    if (w.alertsNote) fail(`NWS alerts: ${w.alertsNote}`);
    else pass(`NWS alerts: ${w.alerts.length} active`);
  } catch (err) { fail(`forecast: ${err.message}`); }

  try {
    const loc = await weatherApi.detectLocation();
    pass(`IP location: ${loc.name}, ${loc.region}`);
  } catch (err) { fail(`IP location: ${err.message}`); }
}

(async () => {
  checkSyntax();
  checkSlots();
  checkSkins();
  checkIcons();
  await checkApis();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
