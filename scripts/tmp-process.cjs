const sharp = require('/tmp/imgtool/node_modules/sharp')

const LO = 18   // abaixo disso = fundo (alfa 0)
const HI = 55   // acima disso = conteúdo pleno (alfa 255)

async function build(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const cor = Buffer.alloc(width * height * 4)
  const branca = Buffer.alloc(width * height * 4)
  for (let p = 0, q = 0; p < data.length; p += channels, q += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2]
    const maxc = Math.max(r, g, b)
    let a = Math.round(((maxc - LO) / (HI - LO)) * 255)
    if (a < 0) a = 0; if (a > 255) a = 255
    // versão colorida: mantém RGB, aplica novo alfa (fundo escuro vira transparente)
    cor[q] = r; cor[q + 1] = g; cor[q + 2] = b; cor[q + 3] = a
    // versão branca: tudo branco, mesma máscara de alfa
    branca[q] = 255; branca[q + 1] = 255; branca[q + 2] = 255; branca[q + 3] = a
  }
  return { width, height, cor, branca }
}

async function finish(buf, width, height, outPath) {
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .png()
    .trim({ threshold: 1 })                 // remove borda transparente
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

;(async () => {
  const { width, height, cor, branca } = await build('scripts/portal-cor-preview.png')
  await finish(cor, width, height, 'scripts/portal-cor-out.png')
  await finish(branca, width, height, 'scripts/portal-branca-out.png')
  console.log('done')
})()
