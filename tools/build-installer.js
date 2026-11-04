// Builds the Windows installer: dist\Aeros Setup <version>.exe
// Run: npm run dist
// Build tool downloads are cached in .build-cache, so nothing lands outside this folder.
const path = require('path');

process.env.ELECTRON_BUILDER_CACHE = path.join(__dirname, '..', '.build-cache');

const builder = require('electron-builder');

builder.build({ win: ['nsis'] }).then((files) => {
  console.log(`Built:\n  ${files.join('\n  ')}`);
}, (err) => {
  console.error(err);
  process.exit(1);
});
