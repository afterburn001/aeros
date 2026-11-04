// Picks a skin or weather icon for a condition, using the bucket maps in src/skins-map.js and src/icons-map.js.
// Loaded by the UI (window.SkinMatch) and by tools/check.js (require).
(function (root) {
  // Is the city's local time (Open-Meteo "2026-10-30T14:05", no offset) between today's sunrise and sunset?
  // Same-format local strings, so plain string comparison orders them correctly.
  function isNight(now, sunrise, sunset) {
    return now < sunrise || now >= sunset;
  }

  // Day/night for one time slot, using that date's own sunrise and sunset.
  function isNightAt(forecast, time) {
    const day = forecast.daily.find((d) => d.date === time.slice(0, 10)) || forecast.daily[0];
    return isNight(time, day.sunrise, day.sunset);
  }

  // -> { skin, bucket } where skin is an id from `available` (or null when there is nothing available)
  // and bucket says how it was chosen: the matching words, "fallback", or "any".
  function pick(map, available, text, night) {
    const have = new Set(available);
    const firstHave = (list) => (list || []).find((s) => have.has(s));
    const lower = String(text || '').toLowerCase();
    const buckets = map[night ? 'night' : 'day'] || [];

    const bucket = buckets.find((b) => b.words.some((w) => lower.includes(w.toLowerCase())));
    const exact = bucket && firstHave(bucket.skins || bucket.icons);
    if (exact) return { skin: exact, bucket: bucket.words[0] };

    const general = firstHave(map.fallback && map.fallback[night ? 'night' : 'day'])
      || available.find((s) => s.includes('night') === night);
    if (general) return { skin: general, bucket: 'fallback' };

    return { skin: available[0] || null, bucket: 'any' };
  }

  // skin_night_partly_cloudy -> "Partly cloudy night"
  function label(id) {
    const words = id.replace(/^skin_/, '').split('_').filter(Boolean);
    const time = words.filter((w) => w === 'day' || w === 'night');
    const text = [...words.filter((w) => w !== 'day' && w !== 'night'), ...time].join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const api = { isNight, isNightAt, pick, label };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SkinMatch = api;
})(this);
