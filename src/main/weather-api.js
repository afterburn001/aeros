// All network calls live here (main process), so the UI never talks to the internet directly.
// Open-Meteo (forecast + geocoding) and api.weather.gov need no API key.
const config = require('../config');

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const NWS_ALERTS_URL = 'https://api.weather.gov/alerts/active';

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.json();
}

// "Austin" or "Austin, TX" / "Austin, Texas". US only.
async function searchCities(query) {
  const [namePart, regionPart = ''] = String(query).split(',').map((s) => s.trim());
  if (!namePart || namePart.length < 2) return [];

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('name', namePart);
  url.searchParams.set('count', regionPart ? '50' : '10');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('countryCode', 'US');

  const data = await getJson(url.toString());
  let results = (data.results || []).map((r) => ({
    name: r.name,
    region: r.admin1 || '',
    country: r.country_code || 'US',
    lat: r.latitude,
    lon: r.longitude,
  }));

  if (regionPart) {
    const want = regionPart.toLowerCase();
    const full = (STATES[regionPart.toUpperCase()] || '').toLowerCase();
    results = results.filter((r) => {
      const region = r.region.toLowerCase();
      return region === full || region.startsWith(want);
    });
  }
  return results.slice(0, 8);
}

async function getForecast(lat, lon) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,is_day,precipitation_probability');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '10');
  // Always fetch imperial; the UI converts for °C.
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');

  const d = await getJson(url.toString());
  const c = d.current;
  const h = d.hourly;
  const dl = d.daily;

  // Times are local to the city (timezone=auto) and carry no offset, e.g. "2026-10-29T14:00".
  const hourPrefix = c.time.slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) === hourPrefix);
  if (start < 0) start = 0;

  const hourly = [];
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
    hourly.push({
      time: h.time[i],
      temp: h.temperature_2m[i],
      code: h.weather_code[i],
      isDay: h.is_day[i] === 1,
      pop: h.precipitation_probability[i],
    });
  }

  return {
    timezone: d.timezone,
    current: {
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      code: c.weather_code,
      isDay: c.is_day === 1,
    },
    hourly,
    daily: dl.time.map((date, i) => ({
      date,
      code: dl.weather_code[i],
      hi: dl.temperature_2m_max[i],
      lo: dl.temperature_2m_min[i],
      sunrise: dl.sunrise[i],
      sunset: dl.sunset[i],
      pop: dl.precipitation_probability_max[i],
    })),
  };
}

async function getAlerts(lat, lon) {
  const url = `${NWS_ALERTS_URL}?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const data = await getJson(url, {
    'User-Agent': config.NWS_USER_AGENT,
    Accept: 'application/geo+json',
  });
  return (data.features || []).map((f) => {
    const p = f.properties;
    return {
      id: p.id,
      event: p.event,
      headline: p.headline,
      severity: p.severity,
      description: p.description,
      instruction: p.instruction,
      ends: p.ends || p.expires,
    };
  });
}

async function getWeather(loc) {
  const alertsPromise = loc.country && loc.country !== 'US'
    ? Promise.resolve({ alerts: [], note: 'Weather alerts are only available for US locations.' })
    : getAlerts(loc.lat, loc.lon).then(
      (alerts) => ({ alerts, note: null }),
      () => ({ alerts: [], note: 'Weather alerts are unavailable right now.' }),
    );
  const [forecast, alertsResult] = await Promise.all([getForecast(loc.lat, loc.lon), alertsPromise]);
  return { forecast, alerts: alertsResult.alerts, alertsNote: alertsResult.note };
}

// Approximate location from the public IP (no key). Tries two free services.
async function detectLocation() {
  const providers = [
    async () => {
      const d = await getJson('https://ipwho.is/');
      if (!d.success) throw new Error('ipwho.is failed');
      return { name: d.city, region: d.region, country: d.country_code, lat: d.latitude, lon: d.longitude };
    },
    async () => {
      const d = await getJson('https://ipapi.co/json/');
      if (d.error) throw new Error('ipapi.co failed');
      return { name: d.city, region: d.region, country: d.country_code, lat: d.latitude, lon: d.longitude };
    },
  ];
  let lastErr;
  for (const provider of providers) {
    try {
      const loc = await provider();
      if (loc.name && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) return loc;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not detect location');
}

module.exports = { searchCities, getForecast, getAlerts, getWeather, detectLocation };
