const sharp = require('/tmp/imgtool/node_modules/sharp')
const fs = require('node:fs')

;(async () => {
  const img = sharp('scripts/portal-cor-preview.png')
  const meta = await img.metadata()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  const px = (x, y) => {
    const i = (y * width + x) * channels
    return [data[i], data[i + 1], data[i + 2], channels === 4 ? data[i + 3] : 255]
  }

  const samples = {
    topLeft: px(2, 2),
    topRight: px(width - 3, 2),
    bottomLeft: px(2, height - 3),
    bottomRight: px(width - 3, height - 3),
    center: px(Math.floor(width / 2), Math.floor(height / 2)),
  }

  let transp = 0, opaque = 0
  for (let i = 0; i < data.length; i += channels) {
    const a = channels === 4 ? data[i + 3] : 255
    if (a < 10) transp++; else if (a > 245) opaque++
  }
  const total = width * height
  const out = { meta: { width, height, channels, hasAlpha: meta.hasAlpha }, samples, transpPct: (transp / total * 100).toFixed(1), opaquePct: (opaque / total * 100).toFixed(1) }
  fs.writeFileSync('scripts/tmp-analyze-out.json', JSON.stringify(out, null, 2))
  console.log('done')
})()
