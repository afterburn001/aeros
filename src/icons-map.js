// Which weather icon shows for which condition. Edit freely; restart the app to apply.
// Works exactly like src/skins-map.js. Each time slot (now, each hour) uses its own day/night;
// the forecast cards cover a whole day, so they use the day list.
//
// The condition text shown on the panel (e.g. "Overcast", "Light Rain") is checked against each
// bucket TOP TO BOTTOM; the first bucket with a word the text CONTAINS wins (case doesn't matter).
// So keep the more specific buckets first: storm before rain, snow before rain ("Snow Showers",
// and "Snow Grains" contains "rain"), "partly cloudy" before "cloudy".
//
// A bucket's `icons` are tried in order: the first one that exists in Graphics/icons/ is used.
// List the icon you want first and the closest stand-ins after it (names without .png).
// If none exist, the time-of-day `fallback` list is tried, then any icon at all.
module.exports = {
  day: [
    { words: ['thunderstorm', 't-storm', 'storm', 'severe'], icons: ['icon_storm', 'icon_rain', 'icon_cloudy'] },
    { words: ['snow', 'flurries', 'sleet'], icons: ['icon_snow', 'icon_cloudy'] },
    { words: ['rain', 'showers', 'drizzle'], icons: ['icon_rain', 'icon_cloudy'] },
    { words: ['partly cloudy', 'partly sunny', 'mostly sunny', 'scattered clouds', 'few clouds'],
      icons: ['icon_partly_cloudy', 'icon_sunny', 'icon_cloudy'] },
    { words: ['mostly cloudy', 'cloudy', 'overcast', 'fog', 'haze', 'mist'], icons: ['icon_cloudy', 'icon_partly_cloudy'] },
    { words: ['sunny', 'clear', 'fair'], icons: ['icon_sunny', 'icon_partly_cloudy'] },
  ],
  night: [
    { words: ['thunderstorm', 't-storm', 'storm', 'severe'], icons: ['icon_storm', 'icon_rain', 'icon_cloudy'] },
    { words: ['snow', 'flurries', 'sleet'], icons: ['icon_snow', 'icon_cloudy'] },
    { words: ['rain', 'showers', 'drizzle'], icons: ['icon_rain', 'icon_cloudy'] },
    { words: ['partly cloudy', 'partly', 'scattered clouds', 'few clouds'],
      icons: ['icon_partly_cloudy_night', 'icon_clear_night', 'icon_cloudy'] },
    { words: ['mostly cloudy', 'cloudy', 'overcast', 'fog', 'haze', 'mist'], icons: ['icon_cloudy', 'icon_partly_cloudy_night'] },
    { words: ['clear', 'fair'], icons: ['icon_clear_night', 'icon_partly_cloudy_night'] },
  ],
  // No bucket matched or its icons are missing: the closest general icon for the time of day.
  fallback: {
    day: ['icon_cloudy', 'icon_partly_cloudy', 'icon_sunny'],
    night: ['icon_cloudy', 'icon_partly_cloudy_night', 'icon_clear_night'],
  },
};
