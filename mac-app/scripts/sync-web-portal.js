const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const macAppDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(macAppDir, '..');
const portalDir = path.join(projectRoot, 'message-backup-web-dashboard');
const portalNodeModulesDir = path.join(portalDir, 'node_modules');
const portalDistDir = path.join(portalDir, 'dist');
const targetDir = path.join(macAppDir, 'web-portal-dist');

function copyDirectory(sourceDir, destinationDir) {
  fs.rmSync(destinationDir, { recursive: true, force: true });
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.cpSync(sourceDir, destinationDir, { recursive: true });
}

if (!fs.existsSync(portalDir)) {
  throw new Error(`Embedded web portal source not found: ${portalDir}`);
}

if (!fs.existsSync(path.join(portalNodeModulesDir, '.package-lock.json')) && !fs.existsSync(portalNodeModulesDir)) {
  execSync('npm install', {
    cwd: portalDir,
    stdio: 'inherit'
  });
}

execSync('npm run build', {
  cwd: portalDir,
  stdio: 'inherit'
});

if (!fs.existsSync(portalDistDir)) {
  throw new Error(`Embedded web portal build output not found: ${portalDistDir}`);
}

copyDirectory(portalDistDir, targetDir);
console.log(`Embedded web portal synced to ${targetDir}`);
