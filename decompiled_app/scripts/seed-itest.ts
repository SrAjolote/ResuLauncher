// Test de integración de los archivos de "siembra" (`once`) del manifest:
// se bajan solo si faltan, no se pisan al cambiar, no se borran y `reseed` los re-aplica.
import { createServer } from 'http'
import { createHash } from 'crypto'
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runSync } from '../src/main/sync/engine'
import { langActual } from '../src/main/sync/lang'

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')

const MOD = 'un mod'
const OPTIONS_FULL = 'graphics:fancy'
const OPTIONS_LITE = 'graphics:fast'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

async function main(): Promise<void> {
  const server = createServer((req, res) => {
    const url = req.url ?? ''
    const base = `http://127.0.0.1:${port}`
    if (url === '/mod') return void res.end(MOD)
    if (url === '/options-full') return void res.end(OPTIONS_FULL)
    if (url === '/options-lite') return void res.end(OPTIONS_LITE)
    // Variante Full: un mod gestionado + options.txt de siembra.
    if (url === '/full') {
      return void res.end(
        JSON.stringify({
          version: 'full',
          files: [
            { path: 'mods/a.jar', url: base + '/mod', sha1: sha1(MOD) },
            { path: 'options.txt', url: base + '/options-full', sha1: sha1(OPTIONS_FULL), once: true }
          ]
        })
      )
    }
    // Variante Lite: mismo mod, otra config de siembra (misma ruta local).
    if (url === '/lite') {
      return void res.end(
        JSON.stringify({
          version: 'lite',
          files: [
            { path: 'mods/a.jar', url: base + '/mod', sha1: sha1(MOD) },
            { path: 'options.txt', url: base + '/options-lite', sha1: sha1(OPTIONS_LITE), once: true }
          ]
        })
      )
    }
    // Variante que ya no lista options.txt: la siembra NO debe borrarse.
    if (url === '/sin-options') {
      return void res.end(
        JSON.stringify({
          version: 'sin',
          files: [{ path: 'mods/a.jar', url: base + '/mod', sha1: sha1(MOD) }]
        })
      )
    }
    res.statusCode = 404
    res.end('nope')
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  const dir = mkdtempSync(join(tmpdir(), 'dbr-seed-'))
  const gameDir = join(dir, 'game')
  const managedFile = join(dir, 'managed.json')
  const options = join(gameDir, 'options.txt')
  const noop = (): void => {}

  try {
    console.log('1) primera instalación: siembra options.txt junto a los mods')
    const s1 = await runSync({ gameDir, managedFile, manifestUrl: base + '/full' }, noop)
    assert(s1.updated === 2, `updated=2 (${s1.updated})`)
    assert(readFileSync(options, 'utf-8') === OPTIONS_FULL, 'options.txt sembrado')
    const managed = JSON.parse(readFileSync(managedFile, 'utf-8')).files as string[]
    assert(!managed.includes('options.txt'), 'options.txt fuera del índice de gestionados')

    console.log('2) el jugador toca su config: la sync NO la pisa')
    writeFileSync(options, 'mio', 'utf-8')
    const s2 = await runSync({ gameDir, managedFile, manifestUrl: base + '/full' }, noop)
    assert(s2.updated === 0, `updated=0 (${s2.updated})`)
    assert(readFileSync(options, 'utf-8') === 'mio', 'config del jugador intacta')

    console.log('3) cambiar de variante sin aceptar: sigue mandando la del jugador')
    const s3 = await runSync({ gameDir, managedFile, manifestUrl: base + '/lite' }, noop)
    assert(s3.updated === 0, `updated=0 (${s3.updated})`)
    assert(readFileSync(options, 'utf-8') === 'mio', 'config del jugador intacta tras cambiar')

    console.log('4) cambiar de variante aceptando (reseed): aplica la config de Lite')
    const s4 = await runSync({ gameDir, managedFile, manifestUrl: base + '/lite', reseed: true }, noop)
    assert(s4.updated === 1, `updated=1 (${s4.updated})`)
    assert(readFileSync(options, 'utf-8') === OPTIONS_LITE, 'config Lite aplicada')

    console.log('5) si desaparece del manifest, la siembra no se borra')
    const s5 = await runSync({ gameDir, managedFile, manifestUrl: base + '/sin-options' }, noop)
    assert(s5.removed === 0, `removed=0 (${s5.removed})`)
    assert(existsSync(options), 'options.txt conservado')

    console.log('6) si el jugador la borra, la siguiente sync la vuelve a sembrar')
    rmSync(options)
    const s6 = await runSync({ gameDir, managedFile, manifestUrl: base + '/lite' }, noop)
    assert(s6.updated === 1, `updated=1 (${s6.updated})`)
    assert(readFileSync(options, 'utf-8') === OPTIONS_LITE, 'options.txt re-sembrado')

    console.log('7) idioma: la primera siembra pone el inicial; una re-siembra respeta el del jugador')
    rmSync(options)
    await runSync({ gameDir, managedFile, manifestUrl: base + '/lite', langInicial: 'pt_BR' }, noop)
    assert(langActual(options) === 'pt_BR', 'lang:pt_BR en la primera siembra')
    await runSync(
      { gameDir, managedFile, manifestUrl: base + '/full', reseed: true, langInicial: 'es_ES' },
      noop
    )
    assert(readFileSync(options, 'utf-8').startsWith(OPTIONS_FULL), 'config de Full aplicada')
    assert(langActual(options) === 'pt_BR', 'se conserva lang:pt_BR del jugador')

    console.log('\nTODO OK ✅')
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
