export interface DadosProposta {
  nome: string | null
  cpf_cnpj: string | null
  telefone: string | null
  email: string | null
  numero_proposta: string | null
  numero_contrato: string | null
  grupo: string | null
  cota: string | null
  valor_credito: number | null
  valor_primeira_parcela: number | null
  valor_demais_parcelas: number | null
  adesao_calculada: number | null
  bem_detectado: string | null
  plano_codigo: string | null
  campos_encontrados: number
  campos_totais: number
}

function parseValorBR(texto: string): number | null {
  if (!texto) return null
  let limpo = texto.replace(/[R$\s]/g, '')
  // Remove pontos de milhar, troca vírgula decimal por ponto
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  }
  const num = parseFloat(limpo)
  return isNaN(num) ? null : num
}

export function parseProposta(textoPdf: string): DadosProposta {
  const texto = textoPdf.replace(/\r/g, '')
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // ─── NOME ─── linha em maiúsculas, 2+ palavras, não institucional
  let nome: string | null = null
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (
      /^[A-ZÀ-Ú][A-ZÀ-Ú\s]{8,60}$/.test(linha) &&
      linha.split(/\s+/).length >= 2 &&
      !/EMBRACON|CONSORCIO|CONSÓRCIO|CONSORCIADO|ADMINISTRADORA|PROPOSTA|PARTICIPA|REGULAMENTO|BANCO CENTRAL|RUA|AVENIDA|ALAMEDA|JD |JARDIM|BAIRRO|CIDADE|CRAVINHOS|RECEPCIONISTA|MAIS POR MENOS|IMOVEL|AUTOMOVEL/.test(linha)
    ) {
      nome = linha
      break
    }
  }

  // ─── CPF do titular ─── pega o que NÃO é do cônjuge
  // No PDF: linha "414.009.398-60" vem após "CPF do Cônjuge"
  //         linha "525.576.958-40" vem após "(X)CPF ( )CNPJ" (titular)
  let cpf_cnpj: string | null = null
  const cpfRegex = /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/g
  const todosCpfs: { cpf: string; idx: number }[] = []
  let m
  while ((m = cpfRegex.exec(texto)) !== null) {
    todosCpfs.push({ cpf: m[1], idx: m.index })
  }
  // Acha índice de "CPF do Cônjuge" pra descartar o CPF logo após
  const idxConjuge = texto.search(/CPF do C[ôo]njuge/i)
  if (todosCpfs.length === 1) {
    cpf_cnpj = todosCpfs[0].cpf
  } else if (todosCpfs.length > 1) {
    // Pega o CPF que NÃO está logo após "CPF do Cônjuge"
    const naoConjuge = todosCpfs.find(c => {
      if (idxConjuge === -1) return true
      // se o CPF está dentro de ~40 chars depois de "CPF do Cônjuge", é do cônjuge
      return !(c.idx > idxConjuge && c.idx < idxConjuge + 40)
    })
    cpf_cnpj = naoConjuge ? naoConjuge.cpf : todosCpfs[0].cpf
  }

  // ─── TELEFONE ─── DDD perto de "Tel. Celular", número logo após
  let telefone: string | null = null
  const celNumMatch = texto.match(/Tel\.?\s*Celular[\s\S]{0,30}?(\d{8,9})/i)
  let ddd = ''
  // DDD do celular costuma ser o último "DDD\n16" antes ou perto
  const dddMatches = [...texto.matchAll(/DDD\s*\n?\s*(\d{2})/gi)]
  if (dddMatches.length > 0) {
    // pega o último DDD válido (≠ 0)
    for (let i = dddMatches.length - 1; i >= 0; i--) {
      if (dddMatches[i][1] !== '00' && dddMatches[i][1] !== '0') { ddd = dddMatches[i][1]; break }
    }
  }
  if (celNumMatch) {
    const num = celNumMatch[1]
    if (num && num !== '0') telefone = (ddd ? ddd + ' ' : '') + num
  }

  // ─── EMAIL ───
  const emailMatch = texto.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i)
  const email = emailMatch ? emailMatch[1] : null

  // ─── Nº PROPOSTA ─── 7 dígitos perto de "Proposta n°"
  let numero_proposta: string | null = null
  const propRegex = /Proposta\s*n[°º]?[\s\S]{0,120}?\b(\d{7})\b/i
  const propMatch = texto.match(propRegex)
  if (propMatch) {
    numero_proposta = propMatch[1]
  } else {
    for (const linha of linhas.slice(0, 20)) {
      if (/^\d{7}$/.test(linha)) { numero_proposta = linha; break }
    }
  }

  // ─── GRUPO e COTA ─── padrão "7275" e "2913 - 0"
  let grupo: string | null = null
  let cota: string | null = null
  const grupoCotaMatch = texto.match(/\b(\d{4})\s+(\d{4})\s*-\s*(\d)\b/)
  if (grupoCotaMatch) {
    grupo = grupoCotaMatch[1]
    cota = grupoCotaMatch[2] + '-' + grupoCotaMatch[3]
  }

  // ─── VALOR DO CRÉDITO ─── "R$400.000,00"
  let valor_credito: number | null = null
  const creditoMatch = texto.match(/Valor do Cr[ée]dito[\s\S]{0,80}?(R\$\s*[\d.]+,\d{2})/i)
  if (creditoMatch) {
    valor_credito = parseValorBR(creditoMatch[1])
  }
  if (!valor_credito) {
    const valores = (texto.match(/R\$\s*[\d.]+,\d{2}/g) || [])
      .map(parseValorBR)
      .filter((v): v is number => v !== null && v >= 30000)
    if (valores.length > 0) valor_credito = Math.max(...valores)
  }

  // ─── 1ª PARCELA ─── "importância de R$ 9182,8" (valor pago de entrada)
  let valor_primeira_parcela: number | null = null
  const impMatch = texto.match(/import[âa]ncia de R\$\s*\n?\s*([\d.]+,?\d*)/i)
  if (impMatch) {
    let v = impMatch[1]
    // formato "9182,8" -> 9182.80
    if (v.includes(',')) {
      v = v.replace(/\./g, '').replace(',', '.')
    }
    const num = parseFloat(v)
    if (!isNaN(num) && num > 0) valor_primeira_parcela = num
  }

  // ─── ADESÃO calculada ─── deduz 1% ou 2% pela taxa antecipada
  // taxa = % do crédito embutida na 1ª parcela
  // 1ª parcela = parcela_normal + (% × crédito)
  let adesao_calculada: number | null = null
  let valor_demais_parcelas: number | null = null
  if (valor_credito && valor_primeira_parcela) {
    const taxa1 = valor_credito * 0.01
    const taxa2 = valor_credito * 0.02
    const parcelaSe1 = valor_primeira_parcela - taxa1
    const parcelaSe2 = valor_primeira_parcela - taxa2
    // A parcela normal de um consórcio costuma ser 0,1% a 1% do crédito/mês
    const minParcela = valor_credito * 0.001
    const maxParcela = valor_credito * 0.01
    const valido1 = parcelaSe1 >= minParcela && parcelaSe1 <= maxParcela
    const valido2 = parcelaSe2 >= minParcela && parcelaSe2 <= maxParcela
    if (valido2 && !valido1) {
      adesao_calculada = 2
      valor_demais_parcelas = Math.round(parcelaSe2 * 100) / 100
    } else if (valido1 && !valido2) {
      adesao_calculada = 1
      valor_demais_parcelas = Math.round(parcelaSe1 * 100) / 100
    } else if (valido1 && valido2) {
      // ambíguo: usa o que dá parcela mais "redonda" — fica com 2% (mais comum em imóvel grande)
      adesao_calculada = parcelaSe2 > 0 ? 2 : 1
      valor_demais_parcelas = Math.round((adesao_calculada === 2 ? parcelaSe2 : parcelaSe1) * 100) / 100
    }
  }

  // ─── PLANO / BEM ───
  let plano_codigo: string | null = null
  const planoMatch = texto.match(/(IMOVELNAC|AUTONAC|MOTONAC|SERVNAC|PESADONAC)/i)
  if (planoMatch) plano_codigo = planoMatch[1].toUpperCase()

  let bem_detectado: string | null = null
  const t = texto.toLowerCase()
  if (/imovelnac|im[óo]vel/.test(t)) bem_detectado = 'Imóvel'
  else if (/pesadonac|caminh[ãa]o|m[áa]quina/.test(t)) bem_detectado = 'Pesados'
  else if (/autonac|motonac|autom[óo]vel|ve[íi]culo/.test(t)) bem_detectado = 'Veículo'
  else if (/servnac|servi[çc]o/.test(t)) bem_detectado = 'Serviços'

  const campos = [nome, cpf_cnpj, telefone, email, numero_proposta, grupo, cota, valor_credito, valor_primeira_parcela, bem_detectado]
  const campos_encontrados = campos.filter((c) => c !== null && c !== undefined).length

  return {
    nome, cpf_cnpj, telefone, email,
    numero_proposta, numero_contrato: numero_proposta,
    grupo, cota, valor_credito, valor_primeira_parcela, valor_demais_parcelas,
    adesao_calculada, bem_detectado, plano_codigo,
    campos_encontrados, campos_totais: 10,
  }
}

export function gerarMensagemBoleto(params: {
  nome: string
  grupo: string
  cota: string
  contrato: string
  valor_credito: number
  qtd_parcelas: number
  valor_boleto: number
}): string {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `Gostaria de um boleto unico
${params.nome}
Grupo/ cota: ${params.grupo} / ${params.cota}
Contrato: ${params.contrato}
Valor do credito: R$${fmt(params.valor_credito)}
Quantidade de parcelas: ${params.qtd_parcelas}
Valor do boleto: R$${fmt(params.valor_boleto)}`
}
