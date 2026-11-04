// Self-updating from this repo's public GitHub Releases (the feed in package.json > build > publish).
// Public repo, so no token: nothing secret is needed or shipped here.
//
// The check runs once per launch, quietly. A newer version downloads in the background, then the popup
// asks. "Later" asks again next launch. Only the Settings button shows "checking" or "up to date".
const { app, dialog, nativeImage } = require('electron');

let options = null;
let updater = null;
let phase = 'idle'; // idle | checking | downloading | ready
let manual = false; // the Settings button is waiting on this check, so report back
let readyVersion = null;
let asking = false;

const status = (text) => options.onStatus(text);
const versionLine = () => `Version ${app.getVersion()}`;

function checkFinished(text) {
  phase = 'idle';
  if (manual) status(text);
  manual = false;
}

async function ask() {
  if (asking) return;
  asking = true;
  try {
    const install = await (options.askOverride || askWithPopup)(readyVersion);
    if (install) {
      updater.quitAndInstall(true, true); // no installer screens, then start the new version
    } else if (manual) {
      status(`Update ${readyVersion} is ready. Click to install it.`);
    }
  } finally {
    asking = false;
    manual = false;
  }
}

async function askWithPopup(version) {
  const box = {
    type: 'question',
    title: 'Aeros',
    message: 'An update is available — would you like to update?',
    detail: `Version ${version} is ready to install. You have ${app.getVersion()}.`,
    buttons: ['Update now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    icon: nativeImage.createFromPath(options.iconPath()),
  };
  const win = options.getWindow();
  // On top of the window if it's open; on its own if Aeros is only in the tray.
  const { response } = win && win.isVisible()
    ? await dialog.showMessageBox(win, box)
    : await dialog.showMessageBox(box);
  return response === 0;
}

function setUp() {
  if (updater) return;
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.logger = null;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false; // "Later" means later: never install behind the user's back on quit
  updater.on('update-available', (info) => {
    phase = 'downloading';
    if (manual) status(`Downloading update ${info.version}…`);
  });
  updater.on('update-not-available', () => {
    checkFinished(`You're on the latest version (${app.getVersion()}).`);
  });
  updater.on('update-downloaded', (info) => {
    phase = 'ready';
    readyVersion = info.version;
    ask();
  });
  updater.on('error', () => {
    checkFinished("Couldn't check for updates. Check your internet connection and try again.");
  });
}

function runCheck() {
  setUp();
  phase = 'checking';
  return updater.checkForUpdates().catch(() => {
    checkFinished("Couldn't check for updates. Check your internet connection and try again.");
  });
}

// options: { getWindow, iconPath, onStatus, askOverride? (tests only) }
function init(opts) {
  options = opts;
}

// Launch check: no feedback unless there's an update to offer.
function checkSilently() {
  if (!app.isPackaged || phase !== 'idle') return;
  runCheck();
}

// Settings button.
function checkManually() {
  if (!app.isPackaged) {
    status('Updates only work in the installed app.');
    return;
  }
  manual = true;
  if (phase === 'ready') {
    ask(); // already downloaded, and they said "Later" earlier
  } else if (phase === 'downloading') {
    status('Downloading update…');
  } else if (phase === 'idle') {
    status('Checking…');
    runCheck();
  }
}

module.exports = {
  init,
  checkSilently,
  checkManually,
  versionLine,
  popupOpen: () => asking,
  phase: () => phase,
};
