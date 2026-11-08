// E2E del idioma con el launcher real compilado (out/main), sobre una copia de los datos del
// launcher instalado: settings.json y game/options.txt. No toca %APPDATA%/dbr-launcher.
// Uso: npm run build && npx electron scripts/idioma-e2e.cjs (capturas en %TEMP%/dbr-idioma-e2e-*.png)
const { app } = require('electron')
const { join } = require('path')
const fs = require('fs')
const os = require('os')

const real = join(process.env.APPDATA, 'dbr-launcher')
const tmp = fs.mkdtempSync(join(os.tmpdir(), 'dbr-launcher-e2e-'))
fs.mkdirSync(join(tmp, 'game'))
const s = JSON.parse(fs.readFileSync(join(real, 'settings.json'), 'utf-8'))
delete s.idioma
fs.writeFileSync(join(tmp, 'settings.json'), JSON.stringify(s))
fs.copyFileSync(join(real, 'game', 'options.txt'), join(tmp, 'game', 'options.txt'))
app.setPath('userData', tmp)

const opciones = join(tmp, 'game', 'options.txt')
const lang = () => (/^lang:(.+)$/m.exec(fs.readFileSync(opciones, 'utf-8')) || [])[1]
const ajustes = () => JSON.parse(fs.readFileSync(join(tmp, 'settings.json'), 'utf-8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fallos = 0
const ok = (c, m) => {
  console.log((c ? '  ok - ' : '  FALLO - ') + m)
  if (!c) fallos++
}

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const wc = win.webContents
    const texto = () => wc.executeJavaScript('document.body.innerText')
    const htmlLang = () => wc.executeJavaScript('document.documentElement.lang')
    const pulsar = (nombre) =>
      wc.executeJavaScript(`document.querySelector('button[aria-label="${nombre}"]').click()`)
    const foto = async (n) =>
      fs.writeFileSync(join(os.tmpdir(), `dbr-idioma-e2e-${n}.png`), (await wc.capturePage()).toPNG())
    try {
      await sleep(2500)
      console.log('1) arranca con el lang: del juego (' + lang() + ')')
      ok((await htmlLang()) === 'es', 'html lang es')
      ok((await texto()).toLowerCase().includes('iniciar sesión'), 'login en castellano')
      await foto('1-es')

      console.log('2) selector -> Português')
      await pulsar('Português')
      await sleep(800)
      ok(lang() === 'pt_BR', 'options.txt lang:pt_BR')
      ok(ajustes().idioma === 'pt_BR', 'settings.idioma pt_BR')
      ok((await texto()).toLowerCase().includes('escolha como entrar'), 'login en portugués')
      ok((await htmlLang()) === 'pt-BR', 'html lang pt-BR')
      await foto('2-pt')

      console.log('3) selector -> English')
      await pulsar('English')
      await sleep(800)
      ok(lang() === 'en_US', 'options.txt lang:en_US')
      ok((await texto()).toLowerCase().includes('choose how to log in'), 'login en inglés')
      await foto('3-en')

      console.log('4) el jugador lo cambia dentro de Minecraft (es_MX) y vuelve a abrir')
      fs.writeFileSync(opciones, fs.readFileSync(opciones, 'utf-8').replace(/^lang:.*$/m, 'lang:es_MX'))
      wc.reload()
      await sleep(2500)
      ok((await texto()).toLowerCase().includes('elige cómo entrar'), 'sigue al juego: castellano')

      console.log('5) error de main en el idioma: nombre inválido')
      await pulsar('Português')
      await sleep(800)
      await wc.executeJavaScript(`(() => {
        const i = document.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        set.call(i, 'a'); i.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('.mc-btn-gold').click() })()`)
      await sleep(800)
      ok((await texto()).includes('O nome deve ter de 3 a 16 caracteres'), 'error de main en portugués')
      await foto('5-pt-error')

      console.log('6) primera instalación (sin options.txt): manda lo elegido')
      fs.rmSync(opciones)
      wc.reload()
      await sleep(2500)
      ok((await texto()).toLowerCase().includes('escolha como entrar'), 'sin options.txt: pt elegido')
    } catch (e) {
      console.error(e)
      fallos++
    }
    console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
    fs.rmSync(tmp, { recursive: true, force: true })
    app.exit(fallos ? 1 : 0)
  })
})

require(join(__dirname, '..', 'out', 'main', 'index.js'))
