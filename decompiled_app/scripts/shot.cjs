// Captura offscreen de la UI para previsualizar el diseño sin abrir ventana.
const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const { writeFileSync } = require('fs')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 640,
    show: false,
    frame: false,
    backgroundColor: '#0a0705',
    webPreferences: { offscreen: false }
  })

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'))
  // Esperar a que carguen fuentes y termine la animación de entrada
  await new Promise((r) => setTimeout(r, 2200))
  const img = await win.webContents.capturePage()
  writeFileSync(join(__dirname, '..', 'preview.png'), img.toPNG())
  app.quit()
})
