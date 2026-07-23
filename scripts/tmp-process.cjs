const sharp = require('/tmp/imgtool/node_modules/sharp')

// fundo quase-preto (L ~ 8-14). Piso corta o fundo; teto = conteúdo pleno.
// Faixa larga => preserva o anti-aliasing suave (igual às logos da MB/Marques).
const FLOOR = 16   // L abaixo disso => alfa 0 (fundo)
const CEIL = 150   // L acima disso => alfa 255 (conteúdo)

function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b }

async function build(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const cor = Buffer.alloc(width * height * 4)
  const branca = Buffer.alloc(width * height * 4)
  for (let p = 0, q = 0; p < data.length; p += channels, q += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2]
    const L = lum(r, g, b)
    let a = Math.round(((L - FLOOR) / (CEIL - FLOOR)) * 255)
    if (a < 0) a = 0; if (a > 255) a = 255
    // COLORIDA: mantém a cor original da arte, só recorta o fundo escuro
    cor[q] = r; cor[q + 1] = g; cor[q + 2] = b; cor[q + 3] = a
    // BRANCA: RGB branco puro + máscara de alfa (padrão MB/Marques)
    branca[q] = 255; branca[q + 1] = 255; branca[q + 2] = 255; branca[q + 3] = a
  }
  return { width, height, cor, branca }
}

async function finish(buf, width, height, outPath) {
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .png()
    .trim({ threshold: 10 })                         // remove a moldura transparente
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

;(async () => {
  const { width, height, cor, branca } = await build('scripts/portal-cor-preview.png')
  await finish(cor, width, height, 'scripts/portal-cor-out.png')
  await finish(branca, width, height, 'scripts/portal-branca-out.png')
  console.log('done')
})()
