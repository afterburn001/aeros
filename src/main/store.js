// Tiny JSON settings store in the app's userData folder.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  unit: 'F',        // 'F' | 'C'
  home: null,       // { name, region, country, lat, lon }
  recents: [],      // up to MAX_RECENTS locations, newest first, never the home city
  lastViewed: null, // location shown when the app opens
  skin: 'live',     // 'live' = match the weather, or a skin id like 'skin_rain' picked in Settings
};

let file = null;
let data = { ...DEFAULTS };

function init(dir) {
  file = path.join(dir, 'settings.json');
  try {
    data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    data = { ...DEFAULTS };
  }
}

function get() {
  return data;
}

function set(patch) {
  data = { ...data, ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}

module.exports = { init, get, set };
