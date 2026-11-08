// Test de los textos del launcher (shared/i18n) y del lang: de options.txt (main/sync/lang).
// No necesita Electron:
//   npx esbuild scripts/i18n-test.ts --bundle --platform=node --outfile=out/i18n-test.js && node out/i18n-test.js
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LANGS, MC_LANG, langDe, t, type Clave } from '../src/shared/i18n'
import { aplicarLang, escribirLang, fijarLang, langActual, leerLang } from '../src/main/sync/lang'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

const vars = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

console.log('1) cadena de idiomas igual que la del servidor')
assert(langDe('es_MX') === 'es' && langDe('es-419') === 'es', 'es_* -> es')
assert(langDe('pt_PT') === 'pt' && langDe('pt-BR') === 'pt', 'pt_* -> pt')
assert(langDe('de_DE') === 'en' && langDe('') === 'en' && langDe(null) === 'en', 'el resto -> en')
assert(MC_LANG.es === 'es_ES' && MC_LANG.en === 'en_US' && MC_LANG.pt === 'pt_BR', 'códigos de Minecraft')

console.log('2) cada texto está en los tres idiomas con los mismos {placeholders}')
// El objeto de textos no se exporta: las claves salen del fuente.
const fuente = readFileSync(join(__dirname, '..', 'src', 'shared', 'i18n.ts'), 'utf-8')
const todas = [...fuente.matchAll(/^\s+'([\w.]+)': \{/gm)].map((m) => m[1] as Clave)
assert(todas.length > 150, `claves encontradas (${todas.length})`)
let malas = 0
for (const c of todas) {
  const es = t('es', c)
  for (const l of LANGS) {
    const s = t(l, c)
    if (!s.trim()) (malas++, console.log('    vacío:', l, c))
    if (vars(s) !== vars(es)) (malas++, console.log('    placeholders:', l, c))
  }
}
assert(malas === 0, 'sin vacíos ni placeholders distintos')

console.log('3) t() reemplaza solo los placeholders que recibe')
assert(t('pt', 'home.en_linea', { players: 3, max: 50 }) === '3/50 online', 'pt con vars')
assert(t('en', 'sync.limpiando', { done: 1 }) === 'Cleaning up 1/{total}', 'var que falta queda visible')

console.log('4) options.txt')
assert(leerLang('a:1\nlang:pt_BR\nb:2') === 'pt_BR', 'leerLang')
assert(leerLang('a:1') === null, 'leerLang sin línea')
assert(fijarLang('a:1\nlang:es_ES\n', 'en_US') === 'a:1\nlang:en_US\n', 'fijarLang cambia')
assert(fijarLang('a:1', 'pt_BR') === 'a:1\nlang:pt_BR\n', 'fijarLang agrega')

const dir = mkdtempSync(join(tmpdir(), 'dbr-lang-'))
try {
  const ruta = join(dir, 'options.txt')
  assert(!escribirLang(ruta, 'en_US'), 'escribirLang no crea el archivo')
  assert(langActual(ruta) === null, 'langActual sin archivo')

  writeFileSync(ruta, 'gamma:0.5\nlang:es_ES\n')
  aplicarLang(ruta, null, 'pt_BR')
  assert(langActual(ruta) === 'pt_BR', 'primera siembra: el idioma inicial')

  writeFileSync(ruta, 'gamma:0.5\nlang:es_ES\n')
  aplicarLang(ruta, 'de_DE', 'pt_BR')
  assert(langActual(ruta) === 'de_DE', 're-siembra: se respeta el del jugador')

  assert(escribirLang(ruta, 'en_US') && langActual(ruta) === 'en_US', 'selector del launcher')
  assert(readFileSync(ruta, 'utf-8').startsWith('gamma:0.5\n'), 'el resto de opciones intacto')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('\nTODO OK ✅')
