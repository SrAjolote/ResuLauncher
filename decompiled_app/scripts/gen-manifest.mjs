// Generador de manifest.json para la sync del modpack.
// Escanea carpetas (mods/config/…), calcula sha1+tamaño y arma {path,url,sha1,size}.
//
// Uso:
//   node scripts/gen-manifest.mjs --dir ./modpack --base https://.../ --version 1.0.0 \
//        [--forge 10.13.4.1614] [--include mods,config,scripts] [--out manifest.json]
//
// El `--base` es la URL donde estarán alojados los archivos preservando la ruta
// (recomendado: raw.githubusercontent.com/OWNER/REPO/BRANCH/, o un host estático/CDN).
//
// Archivos de "siembra": si el pack tiene un `.dbr-once` en su raíz, cada línea (ruta o
// glob, relativa a la raíz del pack; `#` = comentario) marca archivos con `once: true`.
// Esos se descargan solo si NO existen en el equipo del jugador y nunca se borran: son su
// configuración (options.txt, optionsof.txt, .cfg que quieras dejar tocar). Las rutas
// exactas listadas ahí se incluyen aunque estén fuera de `--include` (p.ej. options.txt,
// que vive en la raíz del pack).
//
// Preset de Android: si el pack tiene una carpeta `android/`, sus archivos salen en
// `androidFiles` (ver buildAndroidFiles). Solo los usa el launcher móvil.

import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { pathToFileURL } from 'url'

function walk(root, base, out) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // saltar dotfiles (.DS_Store, etc.)
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      walk(full, base, out)
    } else if (entry.isFile()) {
      const buf = readFileSync(full)
      out.push({
        path: relative(base, full).split(sep).join('/'),
        sha1: createHash('sha1').update(buf).digest('hex'),
        size: statSync(full).size
      })
    }
  }
}

const ONCE_FILE = '.dbr-once'

/** Lee `.dbr-once` (una ruta o glob por línea, `#` comentarios). Devuelve los patrones. */
function readOncePatterns(dir) {
  const file = join(dir, ONCE_FILE)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(sep).join('/').replace(/^\.\//, ''))
}

/** Convierte un glob simple (`*`, `**`, `?`) en RegExp anclada. `*` no cruza carpetas. */
function globToRegExp(pattern) {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*'
        i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Añade un archivo suelto (ruta relativa al pack) a la lista del manifest. */
function addFile(dir, rel, out) {
  const full = join(dir, ...rel.split('/'))
  if (!existsSync(full) || !statSync(full).isFile()) return
  const buf = readFileSync(full)
  out.push({
    path: rel,
    sha1: createHash('sha1').update(buf).digest('hex'),
    size: statSync(full).size
  })
}

/** Construye el objeto manifest. `base` es la URL raíz donde viven los archivos. */
export function buildManifest({
  dir,
  base,
  version = '1.0.0',
  minecraft = '1.7.10',
  forge,
  include = ['mods', 'config']
}) {
  const files = []
  for (const sub of include) {
    const root = join(dir, sub)
    if (existsSync(root)) walk(root, dir, files)
  }

  // Siembra: patrones de `.dbr-once`. Las rutas exactas que no haya recogido el walk
  // (típico: options.txt en la raíz del pack) se añaden aquí.
  const oncePatterns = readOncePatterns(dir)
  const onceRegExps = oncePatterns.map(globToRegExp)
  const isOnce = (p) => onceRegExps.some((re) => re.test(p))
  for (const pattern of oncePatterns) {
    if (/[*?]/.test(pattern)) continue // los globs no crean entradas nuevas
    if (files.some((f) => f.path === pattern)) continue
    addFile(dir, pattern, files)
  }
  for (const f of files) {
    if (isOnce(f.path)) f.once = true
  }

  files.sort((a, b) => a.path.localeCompare(b.path))

  const baseUrl = base.endsWith('/') ? base : base + '/'
  for (const f of files) {
    f.url = baseUrl + f.path.split('/').map(encodeURIComponent).join('/')
  }

  const androidFiles = buildAndroidFiles(dir, baseUrl)

  return {
    version,
    minecraft,
    ...(forge ? { forge } : {}),
    files,
    ...(androidFiles.length ? { androidFiles } : {})
  }
}

/**
 * Preset de Android: lo que haya en `<pack>/android/` sustituye, solo en el launcher móvil,
 * a la entrada de `files` con la misma ruta (o se añade). La ruta en el juego es la relativa
 * a `android/`: `android/options.txt` siembra `options.txt`. Siempre son de siembra (`once`):
 * es configuración del jugador y solo la reciben las instalaciones nuevas.
 * Va en una lista aparte para que los launchers de PC, que no la conocen, la ignoren.
 */
function buildAndroidFiles(dir, baseUrl) {
  const root = join(dir, 'android')
  if (!existsSync(root)) return []
  const out = []
  walk(root, root, out)
  out.sort((a, b) => a.path.localeCompare(b.path))
  for (const f of out) {
    f.once = true
    f.url = baseUrl + 'android/' + f.path.split('/').map(encodeURIComponent).join('/')
  }
  return out
}

// ---- CLI ----
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (key) args[key] = argv[i + 1]
  }
  return args
}

function main() {
  const a = parseArgs(process.argv.slice(2))
  if (!a.dir || !a.base) {
    console.error('Faltan --dir y --base. Ej:')
    console.error('  node scripts/gen-manifest.mjs --dir ./modpack --base https://host/ --version 1.0.0')
    process.exit(1)
  }
  const manifest = buildManifest({
    dir: a.dir,
    base: a.base,
    version: a.version,
    minecraft: a.minecraft,
    forge: a.forge,
    include: a.include ? a.include.split(',') : undefined
  })
  const out = a.out ?? 'manifest.json'
  writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf-8')
  const totalMb = (manifest.files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(1)
  console.log(`✅ ${out}: ${manifest.files.length} archivos, ${totalMb} MB (v${manifest.version})`)
  if (manifest.androidFiles) {
    console.log(`   preset Android: ${manifest.androidFiles.map((f) => f.path).join(', ')}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
