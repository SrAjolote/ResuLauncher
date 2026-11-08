// Genera build/icon.ico a partir del logo: recorta márgenes transparentes,
// lo cuadra (sin deformar) y produce un ICO multi-resolución.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PNG } from 'pngjs'
import png2icons from 'png2icons'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcPath = join(root, 'src/renderer/src/assets/logo.png')
const outPath = join(root, 'build/icon.ico')

const png = PNG.sync.read(readFileSync(srcPath))
const { width, height, data } = png

// 1) Bounding box de los píxeles no transparentes (alpha > 10).
let minX = width, minY = height, maxX = -1, maxY = -1
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 10) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
const cw = maxX - minX + 1
const ch = maxY - minY + 1

// 2) Lienzo cuadrado transparente (lado = mayor dimensión) con el recorte centrado.
const side = Math.max(cw, ch)
const sq = new PNG({ width: side, height: side }) // alpha 0 por defecto
sq.data.fill(0)
const offX = Math.floor((side - cw) / 2)
const offY = Math.floor((side - ch) / 2)
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const s = ((minY + y) * width + (minX + x)) * 4
    const d = ((offY + y) * side + (offX + x)) * 4
    sq.data[d] = data[s]
    sq.data[d + 1] = data[s + 1]
    sq.data[d + 2] = data[s + 2]
    sq.data[d + 3] = data[s + 3]
  }
}

// 3) ICO multi-resolución (PNG-comprimido, Win7+).
const squareBuf = PNG.sync.write(sq)
const ico = png2icons.createICO(squareBuf, png2icons.BICUBIC, 0, true)
if (!ico) throw new Error('png2icons no pudo crear el ICO')

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, ico)
console.log(`✅ build/icon.ico  (recorte ${cw}x${ch} -> cuadrado ${side}x${side}, ${(ico.length / 1024).toFixed(0)} KB)`)
