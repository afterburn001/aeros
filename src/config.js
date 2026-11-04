// App-wide settings that are likely to change later. Main process only.
module.exports = {
  // App icon (.ico in the project folder): tray and window.
  // The installer's icons are set in package.json under "build"; change both together, and add the
  // new file to "extraResources" there. tools\make-shortcut.ps1 updates the dev shortcut's icon.
  APP_ICON: 'icon_glassy.ico',

  // 'icon' = tray shows APP_ICON (temp in the hover tooltip); 'temp' = tray shows the live temperature.
  TRAY_MODE: 'icon',

  // Footer "Graphics generated in Afterburn AI" link. Opens in the system web browser.
  FOOTER_URL: 'https://afterburnaistudio.com/',

  // api.weather.gov asks every client to identify itself, with a website or email to reach you.
  NWS_USER_AGENT: 'Aeros/1.0 (desktop; https://afterburnaistudio.com/)',

  // Full-window skins: every Graphics/skin_*.png (or .jpg). By default the skin follows the live
  // weather (see src/skins-map.js); Settings > Skin can pin one instead.
  // false, or no skin files = the normal per-weather backdrop.
  USE_SKIN: true,

  // EXPERIMENT: header strip above the search bar holding Graphics/<WORDMARK_FILE>.png.
  // Transparent margins in the PNG are trimmed automatically. false = no strip.
  SHOW_WORDMARK: true,
  WORDMARK_FILE: 'aeros_wordmark',
  // Wordmark size: 1 = the original strip height (76px), 1.3 = 30% bigger. Restart the app to apply.
  WORDMARK_SCALE: 1.3,

  // Darkness of the backing behind panels while a skin is showing: 0 = clear, 1 = solid black.
  // Was 0.62. Lower shows more skin. Restart the app to apply.
  PANEL_SCRIM_OPACITY: 0.5,

  // How often the renderer refreshes weather (and the tray temp).
  REFRESH_MINUTES: 15,

  // Recent cities kept besides the home city.
  MAX_RECENTS: 3,
};
