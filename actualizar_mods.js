const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoOwner = 'SrAjolote';
const repoName = 'ResuLauncher';
const branch = 'main';

const baseUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/MODS/`;
const modsDir = path.join(__dirname, 'MODS');

const files = [];

const entries = fs.readdirSync(modsDir);
for (const name of entries) {
  if (name.startsWith('.') || name.endsWith('.zip')) continue;
  const full = path.join(modsDir, name);
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    const buf = fs.readFileSync(full);
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
    files.push({
      path: 'mods/' + name,
      sha1: sha1,
      size: stat.size,
      url: baseUrl + encodeURIComponent(name)
    });
  }
}

// Agregar textura oficial
const texFile = path.join(__dirname, 'DbrTexture v6.zip');
if (fs.existsSync(texFile)) {
  const stat = fs.statSync(texFile);
  const buf = fs.readFileSync(texFile);
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
  files.push({
    path: 'resourcepacks/DbrTexture v6.zip',
    sha1: sha1,
    size: stat.size,
    url: `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/` + encodeURIComponent('DbrTexture v6.zip')
  });
}

// Ordenar alfabéticamente
files.sort((a, b) => a.path.localeCompare(b.path));

// Leer versión previa si existe
let version = '1.0.0';
const manifestPath = path.join(__dirname, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (prev.version) {
      const parts = prev.version.split('.').map(Number);
      if (parts.length === 3 && !isNaN(parts[2])) {
        parts[2]++;
        version = parts.join('.');
      }
    }
  } catch(e) {}
}

const manifest = {
  version: version,
  minecraft: '1.7.10',
  forge: '10.13.4.1614',
  files: files
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
const mb = (files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(1);
console.log(`✅ manifest.json generado con éxito: ${files.length} archivos, ${mb} MB (versión ${version})`);

