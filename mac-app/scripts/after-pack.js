const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MAC_ICON_SIZES = [
  { size: 16, scale: '1x', filename: 'icon_16x16.png' },
  { size: 16, scale: '2x', filename: 'icon_16x16@2x.png' },
  { size: 32, scale: '1x', filename: 'icon_32x32.png' },
  { size: 32, scale: '2x', filename: 'icon_32x32@2x.png' },
  { size: 128, scale: '1x', filename: 'icon_128x128.png' },
  { size: 128, scale: '2x', filename: 'icon_128x128@2x.png' },
  { size: 256, scale: '1x', filename: 'icon_256x256.png' },
  { size: 256, scale: '2x', filename: 'icon_256x256@2x.png' },
  { size: 512, scale: '1x', filename: 'icon_512x512.png' },
  { size: 512, scale: '2x', filename: 'icon_512x512@2x.png' }
];

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' && context.electronPlatformName !== 'mas') {
    return;
  }

  const appBundlePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const resourcesPath = path.join(appBundlePath, 'Contents', 'Resources');
  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist');
  const buildDir = path.join(context.packager.projectDir, 'build');
  const sourceIcon = path.join(buildDir, 'icon-1024.png');

  if (!fs.existsSync(sourceIcon)) {
    throw new Error(`Missing icon source at ${sourceIcon}`);
  }

  const assetRoot = path.join(buildDir, 'Assets.xcassets');
  const appIconSet = path.join(assetRoot, 'AppIcon.appiconset');
  fs.rmSync(assetRoot, { recursive: true, force: true });
  fs.mkdirSync(appIconSet, { recursive: true });

  const contents = {
    images: MAC_ICON_SIZES.map(item => ({
      filename: item.filename,
      idiom: 'mac',
      scale: item.scale,
      size: `${item.size}x${item.size}`
    })),
    info: {
      author: 'xcode',
      version: 1
    }
  };

  fs.writeFileSync(
    path.join(appIconSet, 'Contents.json'),
    JSON.stringify(contents, null, 2)
  );

  for (const item of MAC_ICON_SIZES) {
    const pixels = item.scale === '2x' ? item.size * 2 : item.size;
    run('sips', ['-z', String(pixels), String(pixels), sourceIcon, '--out', path.join(appIconSet, item.filename)]);
  }

  const partialPlist = path.join(buildDir, 'AppIcon-partial.plist');
  fs.rmSync(path.join(resourcesPath, 'Assets.car'), { force: true });
  fs.rmSync(partialPlist, { force: true });

  run('xcrun', [
    'actool',
    assetRoot,
    '--compile', resourcesPath,
    '--platform', 'macosx',
    '--target-device', 'mac',
    '--app-icon', 'AppIcon',
    '--minimum-deployment-target', '12.0',
    '--output-partial-info-plist', partialPlist
  ]);

  run('plutil', ['-replace', 'CFBundleIconName', '-string', 'AppIcon', infoPlistPath]);
};
