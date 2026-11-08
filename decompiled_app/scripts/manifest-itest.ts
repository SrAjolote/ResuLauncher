// Test end-to-end: gen-manifest genera manifest → el motor de sync lo consume y descarga bien.
import { createServer } from 'http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
// @ts-expect-error — .mjs sin tipos
import { buildManifest } from './gen-manifest.mjs'
import { runSync } from '../src/main/sync/engine'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dbr-mf-'))
  const packDir = join(root, 'modpack')
  mkdirSync(join(packDir, 'mods'), { recursive: true })
  mkdirSync(join(packDir, 'config', 'sub'), { recursive: true })
  writeFileSync(join(packDir, 'mods', 'JRMCore.jar'), 'contenido del mod jrmcore')
  writeFileSync(join(packDir, 'mods', 'DBC.jar'), 'contenido dbc')
  writeFileSync(join(packDir, 'config', 'sub', 'ropa.cfg'), 'clave=valor')
  writeFileSync(join(packDir, 'mods', '.DS_Store'), 'basura') // debe ignorarse

  // Servidor que sirve /files/<path> desde el packDir.
  const server = createServer((req, res) => {
    const rel = decodeURI((req.url ?? '').replace(/^\/files\//, ''))
    try {
      res.end(readFileSync(join(packDir, rel)))
    } catch {
      res.statusCode = 404
      res.end('nope')
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}/files/`

  try {
    console.log('1) buildManifest:')
    const manifest = buildManifest({ dir: packDir, base, version: '2.3.0', forge: '10.13.4.1614' })
    assert(manifest.version === '2.3.0' && manifest.forge === '10.13.4.1614', 'version/forge en manifest')
    assert(manifest.files.length === 3, `3 archivos (ignora .DS_Store) — got ${manifest.files.length}`)
    const paths = manifest.files.map((f: { path: string }) => f.path)
    assert(paths.includes('mods/JRMCore.jar'), 'incluye mods/JRMCore.jar con slash')
    assert(paths.includes('config/sub/ropa.cfg'), 'incluye ruta anidada config/sub/ropa.cfg')
    const jrm = manifest.files.find((f: { path: string }) => f.path === 'mods/JRMCore.jar')
    assert(/^[a-f0-9]{40}$/.test(jrm.sha1) && jrm.size > 0, 'sha1 hex de 40 + size')
    assert(jrm.url === base + 'mods/JRMCore.jar', 'url = base + path')

    console.log('2) el motor de sync consume el manifest generado:')
    const manifestUrl = base + 'manifest.json'
    writeFileSync(join(packDir, 'manifest.json'), JSON.stringify(manifest))
    const gameDir = join(root, 'game')
    const managedFile = join(root, 'managed.json')
    const summary = await runSync({ gameDir, managedFile, manifestUrl }, () => {})
    assert(summary.updated === 3 && summary.version === '2.3.0', `descarga 3, v2.3.0 (${summary.updated})`)
    assert(
      readFileSync(join(gameDir, 'mods', 'JRMCore.jar'), 'utf-8') === 'contenido del mod jrmcore',
      'JRMCore.jar descargado con contenido correcto'
    )
    assert(
      readFileSync(join(gameDir, 'config', 'sub', 'ropa.cfg'), 'utf-8') === 'clave=valor',
      'config anidado descargado'
    )

    console.log('3) re-sync es idempotente (sha1 coincide):')
    const again = await runSync({ gameDir, managedFile, manifestUrl }, () => {})
    assert(again.updated === 0, 'no re-descarga nada')

    console.log('\nTODO OK ✅')
  } finally {
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error('\n' + e.message)
  process.exit(1)
})
