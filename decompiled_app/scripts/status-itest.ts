// Test del Server List Ping: protocolo (puro) + ping real a un servidor público.
import {
  writeVarInt,
  readVarInt,
  writeString,
  buildHandshake,
  buildStatusRequest,
  tryParseStatus,
  flattenMotd
} from '../src/main/status/protocol'
import { pingServer } from '../src/main/status/ping'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg)
  console.log('  ok -', msg)
}

async function main(): Promise<void> {
  console.log('1) VarInt roundtrip:')
  for (const n of [0, 1, 127, 128, 255, 300, 25565, 2097151]) {
    const buf = writeVarInt(n)
    const dec = readVarInt(buf, 0)
    assert(!!dec && dec.value === n && dec.size === buf.length, `varint ${n}`)
  }
  assert(readVarInt(Buffer.from([0x80]), 0) === null, 'varint incompleto => null')

  console.log('2) writeString:')
  const s = writeString('hola')
  const len = readVarInt(s, 0)!
  assert(s.slice(len.size).toString('utf8') === 'hola', 'string codificada')

  console.log('3) handshake/request son frames válidos:')
  assert(!!readVarInt(buildHandshake('host', 25565), 0), 'handshake con prefijo de longitud')
  assert(buildStatusRequest().length === 2, 'status request = [len=1][0x00]')

  console.log('4) tryParseStatus:')
  const json = '{"version":{"name":"1.7.10"},"players":{"online":3,"max":20},"description":"Hola"}'
  const data = Buffer.concat([writeVarInt(0x00), writeString(json)])
  const frame = Buffer.concat([writeVarInt(data.length), data])
  const parsed = tryParseStatus(frame) as { players: { online: number } }
  assert(!!parsed && parsed.players.online === 3, 'parsea respuesta completa')
  assert(tryParseStatus(frame.slice(0, frame.length - 5)) === null, 'buffer truncado => null')

  console.log('5) flattenMotd:')
  assert(flattenMotd('Hi') === 'Hi', 'motd string')
  assert(flattenMotd({ text: 'A', extra: [{ text: 'B' }, { text: 'C' }] }) === 'ABC', 'motd component')

  console.log('6) ping REAL a servidor público:')
  const candidates = ['mc.hypixel.net', 'play.cubecraft.net']
  let got = null
  for (const host of candidates) {
    const st = await pingServer(host, 25565, 8000)
    console.log(`   ${host}:`, JSON.stringify({ online: st.online, players: st.players, max: st.max, version: st.version, ms: st.latencyMs, err: st.error }))
    if (st.online) {
      got = st
      break
    }
  }
  assert(!!got && typeof got.players === 'number', 'al menos un servidor respondió online con players')

  console.log('\nTODO OK ✅')
}

main().catch((e) => {
  console.error('\n' + e.message)
  process.exit(1)
})
