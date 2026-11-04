// Ships an update: bump "version" in package.json, then run: npm run release
// Runs the checks, commits and pushes, builds the installer, and publishes it to GitHub Releases.
// Installed copies of Aeros pick it up on their next launch.
//
// Uses the GitHub login Git already has stored, passed only to this build's own process. It isn't
// saved anywhere and never goes into the app: the shipped app reads the public feed without it.
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);
const pkg = require('../package.json');
const { owner, repo } = pkg.build.publish;
const tag = `v${pkg.version}`;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const stop = (message) => { console.error(`\nRelease stopped: ${message}`); process.exit(1); };
const step = (message) => console.log(`\n== ${message}`);

function storedToken() {
  const filled = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const token = (filled.match(/^password=(.*)$/m) || [])[1];
  if (!token) stop('no stored GitHub login. Push once from this machine, then try again.');
  return token;
}

async function releaseAssets(token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'aeros-release' },
  });
  if (res.status === 404) return null;
  if (!res.ok) stop(`GitHub answered HTTP ${res.status}.`);
  return (await res.json()).assets.map((a) => a.name);
}

(async () => {
  const token = storedToken();

  step(`Releasing ${pkg.version}`);
  const existing = await releaseAssets(token);
  if (existing && existing.includes('latest.yml')) {
    stop(`${tag} is already published. Bump "version" in package.json first.`);
  }

  step('Syncing the lockfile version');
  if (require('../package-lock.json').version !== pkg.version) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const synced = spawnSync(npm, ['install', '--package-lock-only', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: true });
    if (synced.status !== 0) stop('could not update package-lock.json.');
  }

  step('Running checks');
  if (spawnSync(process.execPath, ['tools/check.js'], { stdio: 'inherit' }).status !== 0) stop('checks failed.');

  step('Committing and pushing the source');
  if (git('status', '--porcelain')) {
    git('add', '-A');
    git('commit', '-m', `Release ${tag}`);
  }
  try {
    git('push', 'origin', 'main');
  } catch (err) {
    stop(`could not push to GitHub.\n${err.stderr || err.message}`);
  }

  step('Building and publishing');
  process.env.ELECTRON_BUILDER_CACHE = path.join(ROOT, '.build-cache');
  process.env.GH_TOKEN = token;
  await require('electron-builder').build({ win: ['nsis'], publish: 'always' });

  step('Confirming the release');
  const assets = (await releaseAssets(token)) || [];
  if (!assets.includes('latest.yml') || !assets.some((a) => a.endsWith('.exe'))) {
    stop(`the upload looks incomplete (${assets.join(', ') || 'no files'}). Run npm run release again.`);
  }
  console.log(`\nPublished: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
  console.log(`Files: ${assets.join(', ')}`);
  console.log('Installed copies will offer this update on their next launch.');
})().catch((err) => stop(err.message));
