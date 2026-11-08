// Test del runtime de Java: mapeo de plataforma + locateJava + instalación REAL (red + tar + java -version).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { currentPlatform, adoptiumUrl } from '../src/main/java/platform'
import { installJava, locateJava } from '../src/main/java/install'
import type { JavaProgress } from '../src/shared/java'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

async function main(): Promise<void> {
  console.log('1) plataforma + URL:')
  const pl = currentPlatform()
  console.log('  plataforma:', JSON.stringify(pl))
  const url = adoptiumUrl(pl)
  assert(url.includes(`/8/ga/${pl.os}/${pl.arch}/jre/`), 'URL de Adoptium bien formada')

  console.log('2) locateJava en árbol fabricado:')
  const fake = join(process.cwd(), '.tmp', 'fake-jre')
  rmSync(fake, { recursive: true, force: true })
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  mkdirSync(join(fake, 'jdk8u-jre', 'bin'), { recursive: true })
  writeFileSync(join(fake, 'jdk8u-jre', 'bin', exe), 'dummy')
  const found = locateJava(fake)
  assert(!!found && found.endsWith(join('bin', exe)), `encuentra ${exe} en bin/`)
  rmSync(fake, { recursive: true, force: true })

  console.log('3) instalación REAL (descarga + extrae + java -version):')
  const dest = join(process.cwd(), '.tmp', 'jre8')
  rmSync(dest, { recursive: true, force: true })
  let lastPct = -1
  const onProgress = (p: JavaProgress): void => {
    if (p.phase === 'download' && p.percent !== undefined && p.percent - lastPct >= 20) {
      lastPct = p.percent
      console.log('   descargando', p.percent + '%')
    } else if (p.phase !== 'download') {
      console.log('  ', p.phase + '…')
    }
  }
  const { javaPath, version } = await installJava(dest, pl, onProgress)
  assert(existsSync(javaPath), `java existe en ${javaPath}`)
  assert(version.startsWith('1.8'), `versión es Java 8 (${version})`)

  console.log('\nTODO OK ✅ — limpiando .tmp/jre8')
  rmSync(dest, { recursive: true, force: true })
}

main().catch((e) => {
  console.error('\n' + e.message)
  process.exit(1)
})
