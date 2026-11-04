// Which skin shows for which weather, in "Live weather" mode. Edit freely; restart the app to apply.
//
// The condition text shown on the panel (e.g. "Overcast", "Light Rain") is checked against each
// bucket TOP TO BOTTOM; the first bucket with a word the text CONTAINS wins (case doesn't matter).
// So keep the more specific buckets first: storm before rain, "partly cloudy" before "cloudy",
// snow before rain ("Snow Showers", and "Snow Grains" contains "rain").
//
// A bucket's `skins` are tried in order: the first one that exists in Graphics/ is used.
// List the skin you want first and fallbacks after it (names without .png/.jpg).
// If none exist, the time-of-day `fallback` list is tried, then any skin at all.
module.exports = {
  day: [
    { words: ['thunderstorm', 't-storm', 'storm', 'severe'], skins: ['skin_storm'] },
    { words: ['snow'], skins: ['skin_snow', 'skin_cloudy_day'] },
    { words: ['rain', 'showers', 'drizzle'], skins: ['skin_rain'] },
    { words: ['partly cloudy', 'partly sunny', 'mostly sunny', 'scattered clouds', 'few clouds'],
      skins: ['skin_partly_cloudy_day', 'skin_sunny_day'] },
    { words: ['mostly cloudy', 'cloudy', 'overcast', 'fog', 'haze', 'mist'], skins: ['skin_cloudy_day'] },
    { words: ['sunny', 'clear', 'fair'], skins: ['skin_sunny_day'] },
  ],
  night: [
    { words: ['thunderstorm', 't-storm', 'storm', 'severe'], skins: ['skin_storm'] },
    { words: ['snow'], skins: ['skin_night_snow', 'skin_night_partly_cloudy'] },
    { words: ['rain', 'showers', 'drizzle'], skins: ['skin_night_rain', 'skin_rain'] },
    { words: ['partly cloudy', 'partly', 'scattered clouds', 'few clouds'], skins: ['skin_night_partly_cloudy'] },
    { words: ['mostly cloudy', 'cloudy', 'overcast', 'fog', 'haze', 'mist'],
      skins: ['skin_night_cloudy', 'skin_night_partly_cloudy'] },
    { words: ['clear', 'fair'], skins: ['skin_night_clear'] },
  ],
  // No bucket matched or its skins are missing: a general skin for the time of day.
  fallback: {
    day: ['skin_sunny_day', 'skin_partly_cloudy_day', 'skin_cloudy_day'],
    night: ['skin_night_clear', 'skin_night_partly_cloudy'],
  },
};
