const sharp = require('/tmp/imgtool/node_modules/sharp')
const fs = require('fs')

async function inspect(path) {
  const img = sharp(path)
  const meta = await img.metadata()
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const corner = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i+1], data[i+2], data[i+3]] }
  // histograma de alfa
  let a0 = 0, a255 = 0, amid = 0
  for (let i = 0; i < data.length; i += channels) {
    const a = data[i + 3]
    if (a < 10) a0++; else if (a > 245) a255++; else amid++
  }
  return {
    path, w: width, h: height, channels, hasAlpha: meta.hasAlpha,
    topLeft: corner(0, 0), center: corner(width >> 1, height >> 1),
    alpha: { transparent: a0, opaque: a255, partial: amid, total: width * height },
  }
}

;(async () => {
  const out = []
  for (const p of ['scripts/mb-cor.png', 'scripts/mb-branca.png', 'scripts/marques-branca.png']) {
    try { out.push(await inspect(p)) } catch (e) { out.push({ path: p, err: e.message }) }
  }
  fs.writeFileSync('scripts/tmp-mb-out.json', JSON.stringify(out, null, 2))
  console.log('done')
})()
