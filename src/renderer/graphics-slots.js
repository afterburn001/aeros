// Graphics slot naming: which file in Graphics/ is used for which weather.
// Loaded by the UI (window.GraphicsSlots) and by tools/make-placeholders.js (require).
//
// Every lookup is a "chain" of slot names, most specific first. The UI uses the first
// name that exists in Graphics/ (your real art), then falls back to Graphics/_placeholders/.
// So you can draw just "backdrop_day_rain.png" and it covers all four seasons.
(function (root) {
  const SEASONS = ['spring', 'summer', 'fall', 'winter'];
  const TIMES = ['day', 'night'];
  const SKIES = ['clear', 'partly_cloudy', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

  // Icon conditions. The first two get separate day/night placeholders.
  const CONDITIONS = ['clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'freezing_rain', 'snow', 'thunderstorm'];
  const DAY_NIGHT_CONDITIONS = ['clear', 'partly_cloudy'];

  const UI_ICONS = ['search', 'settings', 'close', 'wind', 'humidity', 'sunrise', 'sunset', 'home', 'location'];

  // WMO weather codes (Open-Meteo) -> [icon condition, label]
  const WMO = {
    0: ['clear', 'Clear'],
    1: ['partly_cloudy', 'Mostly Clear'],
    2: ['partly_cloudy', 'Partly Cloudy'],
    3: ['cloudy', 'Overcast'],
    45: ['fog', 'Fog'],
    48: ['fog', 'Freezing Fog'],
    51: ['drizzle', 'Light Drizzle'],
    53: ['drizzle', 'Drizzle'],
    55: ['drizzle', 'Heavy Drizzle'],
    56: ['freezing_rain', 'Freezing Drizzle'],
    57: ['freezing_rain', 'Freezing Drizzle'],
    61: ['rain', 'Light Rain'],
    63: ['rain', 'Rain'],
    65: ['rain', 'Heavy Rain'],
    66: ['freezing_rain', 'Freezing Rain'],
    67: ['freezing_rain', 'Freezing Rain'],
    71: ['snow', 'Light Snow'],
    73: ['snow', 'Snow'],
    75: ['snow', 'Heavy Snow'],
    77: ['snow', 'Snow Grains'],
    80: ['rain', 'Light Showers'],
    81: ['rain', 'Showers'],
    82: ['rain', 'Heavy Showers'],
    85: ['snow', 'Snow Showers'],
    86: ['snow', 'Heavy Snow Showers'],
    95: ['thunderstorm', 'Thunderstorm'],
    96: ['thunderstorm', 'Thunderstorm, Hail'],
    99: ['thunderstorm', 'Thunderstorm, Hail'],
  };

  // Icon condition -> backdrop sky
  const CONDITION_SKY = {
    clear: 'clear', partly_cloudy: 'partly_cloudy', cloudy: 'cloudy', fog: 'fog',
    drizzle: 'rain', rain: 'rain', freezing_rain: 'rain', snow: 'snow', thunderstorm: 'storm',
  };

  function conditionFor(code) { return (WMO[code] || ['cloudy'])[0]; }
  function describe(code) { return (WMO[code] || [null, 'Unknown'])[1]; }
  function skyFor(code) { return CONDITION_SKY[conditionFor(code)]; }

  // US (northern hemisphere) meteorological seasons, from a "YYYY-MM-DD..." local date.
  function seasonFor(isoDate) {
    const month = Number(String(isoDate).slice(5, 7));
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }

  function iconChain(code, isDay) {
    const c = conditionFor(code);
    return [`icon_${c}_${isDay ? 'day' : 'night'}`, `icon_${c}`, 'icon_unknown'];
  }

  function backdropChain(season, isDay, sky) {
    const t = isDay ? 'day' : 'night';
    return [`backdrop_${season}_${t}_${sky}`, `backdrop_${t}_${sky}`, `backdrop_${sky}`, 'backdrop_default'];
  }

  function uiChain(name) { return [`ui_${name}`]; }

  // Every placeholder the generator makes: [{ slot, kind, ...parts }]
  function placeholderSlots() {
    const out = [];
    for (const season of SEASONS) {
      for (const time of TIMES) {
        for (const sky of SKIES) out.push({ slot: `backdrop_${season}_${time}_${sky}`, kind: 'backdrop', season, time, sky });
      }
    }
    out.push({ slot: 'backdrop_default', kind: 'backdrop', season: null, time: 'day', sky: 'cloudy' });
    for (const c of CONDITIONS) {
      if (DAY_NIGHT_CONDITIONS.includes(c)) {
        out.push({ slot: `icon_${c}_day`, kind: 'icon', condition: c, time: 'day' });
        out.push({ slot: `icon_${c}_night`, kind: 'icon', condition: c, time: 'night' });
      } else {
        out.push({ slot: `icon_${c}`, kind: 'icon', condition: c, time: null });
      }
    }
    out.push({ slot: 'icon_unknown', kind: 'icon', condition: 'unknown', time: null });
    for (const u of UI_ICONS) out.push({ slot: `ui_${u}`, kind: 'ui', name: u });
    return out;
  }

  const api = {
    SEASONS, TIMES, SKIES, CONDITIONS, UI_ICONS, WMO,
    conditionFor, describe, skyFor, seasonFor, iconChain, backdropChain, uiChain, placeholderSlots,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphicsSlots = api;
})(this);
