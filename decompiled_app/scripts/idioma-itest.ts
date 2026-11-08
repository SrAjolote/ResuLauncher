// Test de integración del idioma en main (settings.json + options.txt). Corre en Electron:
//   npx esbuild scripts/idioma-itest.ts --bundle --platform=node --external:electron --outfile=out/idioma-itest.js
//   npx electron out/idioma-itest.js
import { app } from 'electron'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fijarIdioma, idiomaInfo, langInicial, tr } from '../src/main/idioma'
import { loadSettings } from '../src/main/settings'
import { langActual } from '../src/main/sync/lang'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

const dir = mkdtempSync(join(tmpdir(), 'dbr-idioma-'))
app.setPath('userData', dir)

app.whenReady().then(() => {
  let code = 0
  try {
    const opciones = join(dir, 'game', 'options.txt')

    console.log('1) sin elegir y sin options.txt: el del sistema')
    assert(loadSettings().idioma === null, 'settings.idioma = null')
    assert(idiomaInfo().juego === null, 'sin options.txt')

    console.log('2) elegir antes de la primera sync: queda para la siembra')
    const i2 = fijarIdioma('pt')
    assert(i2.lang === 'pt' && i2.juego === null, 'launcher en pt')
    assert(langInicial() === 'pt_BR', 'la siembra usará pt_BR')
    assert(tr('err.sin_sesion') === 'Você não está logado.', 'errores de main en pt')

    console.log('3) con options.txt manda el del juego (el jugador lo cambió dentro)')
    mkdirSync(join(dir, 'game'), { recursive: true })
    writeFileSync(opciones, 'gamma:0.5\nlang:es_MX\n')
    const i3 = idiomaInfo()
    assert(i3.lang === 'es' && i3.juego === 'es_MX', 'launcher sigue al juego')

    console.log('4) elegir con options.txt: cambia los dos')
    const i4 = fijarIdioma('en')
    assert(i4.lang === 'en' && i4.juego === 'en_US', 'idioma en_US')
    assert(langActual(opciones) === 'en_US', 'options.txt reescrito')
    assert(loadSettings().idioma === 'en_US', 'settings.idioma guardado')
    assert(tr('err.ms_expiro') === 'The code expired. Try again.', 'errores de main en en')

    console.log('\nTODO OK ✅')
  } catch (e) {
    console.error(e)
    code = 1
  } finally {
    rmSync(dir, { recursive: true, force: true })
    app.exit(code)
  }
})
