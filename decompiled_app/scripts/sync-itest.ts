// Test de integración del motor de sync: servidor HTTP local + dir temporal.
import { createServer } from 'http'
import { createHash } from 'crypto'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runSync, safeJoin } from '../src/main/sync/engine'

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')

const A = 'hello dbr'
const B = 'second file'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

async function main(): Promise<void> {
  const server = createServer((req, res) => {
    const url = req.url ?? ''
    const base = `http://127.0.0.1:${port}`
    if (url === '/a.txt') return void res.end(A)
    if (url === '/b.txt') return void res.end(B)
    if (url === '/v1') {
      return void res.end(
        JSON.stringify({
          version: '1.0.0',
          files: [
            { path: 'mods/a.txt', url: base + '/a.txt', sha1: sha1(A) },
            { path: 'config/b.txt', url: base + '/b.txt', sha1: sha1(B) }
          ]
        })
      )
    }
    if (url === '/v2') {
      return void res.end(
        JSON.stringify({
          version: '2.0.0',
          files: [{ path: 'mods/a.txt', url: base + '/a.txt', sha1: sha1(A) }]
        })
      )
    }
    if (url === '/bad') {
      return void res.end(
        JSON.stringify({
          version: '9',
          files: [{ path: 'mods/a.txt', url: base + '/a.txt', sha1: 'deadbeef' }]
        })
      )
    }
    res.statusCode = 404
    res.end('nope')
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  const dir = mkdtempSync(join(tmpdir(), 'dbr-sync-'))
  const gameDir = join(dir, 'game')
  const managedFile = join(dir, 'managed.json')
  const noop = (): void => {}

  try {
    console.log('1) primera sync (v1) descarga ambos:')
    const s1 = await runSync({ gameDir, managedFile, manifestUrl: base + '/v1' }, noop)
    assert(s1.updated === 2 && s1.removed === 0, `updated=2 removed=0 (${s1.updated}/${s1.removed})`)
    assert(readFileSync(join(gameDir, 'mods/a.txt'), 'utf-8') === A, 'a.txt contenido correcto')
    assert(existsSync(join(gameDir, 'config/b.txt')), 'b.txt existe')
    assert(JSON.parse(readFileSync(managedFile, 'utf-8')).files.length === 2, 'managed tiene 2')

    console.log('2) re-sync (v1) es idempotente, no re-descarga:')
    const s2 = await runSync({ gameDir, managedFile, manifestUrl: base + '/v1' }, noop)
    assert(s2.updated === 0 && s2.removed === 0, `updated=0 removed=0 (${s2.updated}/${s2.removed})`)

    console.log('3) sync v2 elimina b.txt obsoleto:')
    const s3 = await runSync({ gameDir, managedFile, manifestUrl: base + '/v2' }, noop)
    assert(s3.removed === 1, `removed=1 (${s3.removed})`)
    assert(!existsSync(join(gameDir, 'config/b.txt')), 'b.txt eliminado')
    assert(existsSync(join(gameDir, 'mods/a.txt')), 'a.txt conservado')

    console.log('4) sha1 incorrecto lanza error:')
    let threw = false
    try {
      await runSync({ gameDir, managedFile, manifestUrl: base + '/bad' }, noop)
    } catch {
      threw = true
    }
    assert(threw, 'sync con sha1 malo lanza')

    console.log('5) safeJoin bloquea path traversal:')
    let threw2 = false
    try {
      safeJoin(gameDir, '../../evil.txt')
    } catch {
      threw2 = true
    }
    assert(threw2, 'safeJoin rechaza ../../')

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
