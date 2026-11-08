// Test del núcleo determinista del lanzador (sin red, sin lanzar el juego).
import { delimiter } from 'path'
import { mergeVersions, type VersionJson } from '../src/main/launch/version'
import {
  rulesAllow,
  mavenToPath,
  nativeClassifier,
  resolveArtifact,
  resolveNative
} from '../src/main/launch/resolve'
import { buildLaunchArgs, type LaunchContext } from '../src/main/launch/args'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

const vanilla: VersionJson = {
  id: '1.7.10',
  mainClass: 'net.minecraft.client.main.Main',
  minecraftArguments:
    '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type}',
  libraries: [
    {
      name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.1',
      natives: { windows: 'natives-windows', linux: 'natives-linux', osx: 'natives-osx' },
      extract: { exclude: ['META-INF/'] }
    },
    { name: 'net.java.jinput:jinput:2.0.5' },
    { name: 'ca.weblite:java-objc-bridge:1.0.0', rules: [{ action: 'allow', os: { name: 'osx' } }] }
  ],
  assetIndex: { id: '1.7.10', url: 'https://example/1.7.10.json' },
  assets: '1.7.10',
  downloads: { client: { url: 'https://example/client.jar', sha1: 'abc' } }
}

const forge: VersionJson = {
  id: '1.7.10-Forge10.13.4.1614',
  inheritsFrom: '1.7.10',
  mainClass: 'net.minecraft.launchwrapper.Launch',
  minecraftArguments:
    '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type} --tweakClass cpw.mods.fml.common.launcher.FMLTweaker',
  libraries: [
    { name: 'net.minecraftforge:forge:1.7.10-10.13.4.1614', url: 'http://files.minecraftforge.net/maven/' },
    { name: 'net.minecraft:launchwrapper:1.12' }
  ]
}

console.log('1) mergeVersions (forge overlay sobre vanilla):')
const merged = mergeVersions(vanilla, forge)
assert(merged.mainClass === 'net.minecraft.launchwrapper.Launch', 'mainClass = launchwrapper')
assert(merged.libraries[0].name.includes('forge'), 'libs de forge van primero')
assert(!!merged.minecraftArguments?.includes('--tweakClass'), 'args incluyen --tweakClass')
assert(merged.assets === '1.7.10' && !!merged.downloads?.client, 'hereda assets/client de vanilla')

console.log('2) reglas OS:')
assert(rulesAllow(undefined, 'win32'), 'sin reglas => permitido')
assert(!rulesAllow([{ action: 'allow', os: { name: 'osx' } }], 'win32'), 'allow-osx en win => no')
assert(rulesAllow([{ action: 'allow', os: { name: 'osx' } }], 'darwin'), 'allow-osx en mac => sí')

console.log('3) maven -> path y natives:')
assert(
  mavenToPath('net.minecraftforge:forge:1.7.10-10.13.4.1614') ===
    'net/minecraftforge/forge/1.7.10-10.13.4.1614/forge-1.7.10-10.13.4.1614.jar',
  'mavenToPath forge'
)
assert(nativeClassifier(vanilla.libraries[0], 'win32') === 'natives-windows', 'classifier win')
assert(nativeClassifier(vanilla.libraries[1], 'win32') === null, 'jinput no tiene natives')

console.log('4) resolución de artefactos (URLs):')
const jinput = resolveArtifact(vanilla.libraries[1])
assert(jinput.path === 'net/java/jinput/jinput/2.0.5/jinput-2.0.5.jar', 'path jinput')
assert(jinput.url.startsWith('https://libraries.minecraft.net/'), 'jinput usa maven de mojang')
const forgeArt = resolveArtifact(forge.libraries[0])
assert(forgeArt.url.startsWith('http://files.minecraftforge.net/maven/'), 'forge usa su maven')
const nat = resolveNative(vanilla.libraries[0], 'win32')
assert(
  !!nat && nat.path.endsWith('lwjgl-platform-2.9.1-natives-windows.jar'),
  'native path lwjgl-windows'
)
assert(!!nat && nat.exclude.includes('META-INF/'), 'native lleva extract.exclude')

console.log('5) buildLaunchArgs (comando final):')
const ctx: LaunchContext = {
  username: 'Steve',
  uuid: '5627dd98e6be3c21b8a8e92344183641',
  accessToken: 'TOKEN123',
  userType: 'legacy',
  versionName: '1.7.10-Forge10.13.4.1614',
  gameDir: '/g',
  assetsDir: '/g/assets',
  assetIndex: '1.7.10',
  nativesDir: '/g/natives',
  classpath: ['/libs/a.jar', '/libs/client.jar'],
  mainClass: merged.mainClass,
  minecraftArguments: merged.minecraftArguments!,
  ramGb: 4
}
const args = buildLaunchArgs(ctx)
assert(args.includes('-Xmx4G'), 'incluye -Xmx4G')
assert(args.includes('-Djava.library.path=/g/natives'), 'incluye java.library.path')
const cp = args.indexOf('-cp')
assert(cp >= 0 && args[cp + 1] === ['/libs/a.jar', '/libs/client.jar'].join(delimiter), 'classpath con delimitador correcto')
assert(args.indexOf(merged.mainClass) > cp, 'mainClass va tras el classpath')
const uIdx = args.indexOf('--username')
assert(uIdx >= 0 && args[uIdx + 1] === 'Steve', 'username substituido')
const tIdx = args.indexOf('--accessToken')
assert(tIdx >= 0 && args[tIdx + 1] === 'TOKEN123', 'accessToken substituido')
assert(args.includes('--tweakClass') && args.includes('cpw.mods.fml.common.launcher.FMLTweaker'), 'tweakClass presente')
assert(!args.some((a) => a.includes('${')), 'no quedan placeholders sin resolver')

console.log('\nTODO OK ✅')
