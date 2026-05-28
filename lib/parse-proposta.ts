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
  bem_detectado: string | null
  plano_codigo: string | null
  campos_encontrados: number
  campos_totais: number
}

function parseValorBR(texto: string): number | null {
  if (!texto) return null
  const limpo = texto.replace(/[R$\s.]/g, '').replace(',', '.')
  const num = parseFloat(limpo)
  return isNaN(num) ? null : num
}

function buscar(regex: RegExp, texto: string): string | null {
  const m = texto.match(regex)
  return m && m[1] ? m[1].trim() : null
}

export function parseProposta(textoPdf: string): DadosProposta {
  const texto = textoPdf.replace(/\r/g, '')
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // CNPJs a ignorar (Embracon e vendedor)
  const cnpjsIgnorar = ['58.113.812/0001-23', '58.207.061/0001-04']

  // NOME — primeira linha toda em maiúsculas com 3+ palavras (nome do consorciado)
  // Vem geralmente logo após "Razão Social" / antes de "(X)CPF"
  let nome: string | null = null
  for (const linha of linhas) {
    // Linha com 2+ palavras totalmente em maiúsculas, sem números, sem "EMBRACON"
    if (
      /^[A-ZÀ-Ú][A-ZÀ-Ú\s]{8,60}$/.test(linha) &&
      linha.split(/\s+/).length >= 2 &&
      !/EMBRACON|CONSORCIO|CONSÓRCIO|CONSORCIADO|ADMINISTRADORA|PROPOSTA|PARTICIPA|REGULAMENTO|BANCO CENTRAL|RUA|AVENIDA|ALAMEDA/.test(linha)
    ) {
      nome = linha
      break
    }
  }

  // CPF do cliente — formato XXX.XXX.XXX-XX (11 dígitos), pega o primeiro que NÃO seja cônjuge
  // Procura todos os CPFs no formato pessoa física
  const cpfMatches = texto.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || []
  const cpf_cnpj = cpfMatches.length > 0 ? cpfMatches[0] : null

  // TELEFONE — celular, geralmente "16 993499982" ou "993499982" perto de "Celular"
  let telefone: string | null = null
  const celMatch = texto.match(/Tel\.?\s*Celular[\s\S]{0,40}?(\d{2})?\s*(\d{8,9})/i)
  if (celMatch) {
    const ddd = celMatch[1] || ''
    const num = celMatch[2] || ''
    if (num && num !== '0') telefone = (ddd && ddd !== '0' ? ddd + ' ' : '') + num
  }

  // EMAIL
  const email = buscar(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i, texto)

  // NÚMERO DA PROPOSTA — 7 dígitos, geralmente isolado perto do topo (ex: 9881377)
  // Aparece após "Proposta n" ou como número de 7 dígitos sozinho numa linha
  let numero_proposta: string | null = null
  const propMatch = texto.match(/Proposta\s*n[°º]?\s*\n?\s*(\d{6,8})/i)
  if (propMatch) {
    numero_proposta = propMatch[1]
  } else {
    // procura número de 7 dígitos isolado numa linha
    for (const linha of linhas.slice(0, 15)) {
      if (/^\d{7}$/.test(linha)) { numero_proposta = linha; break }
    }
  }

  // GRUPO e COTA — aparecem como "7275" e "2913 - 0" perto de "Grupo Cota"
  let grupo: string | null = null
  let cota: string | null = null
  // Procura padrão "GRUPO COTA" seguido de "NNNN NNNN - N"
  const grupoCotaMatch = texto.match(/(\d{3,5})\s+(\d{3,5})\s*-\s*(\d)/)
  if (grupoCotaMatch) {
    grupo = grupoCotaMatch[1]
    cota = grupoCotaMatch[2] + '-' + grupoCotaMatch[3]
  } else {
    grupo = buscar(/Grupo[:\s]*(\d{3,5})/i, texto)
    cota = buscar(/Cota[:\s]*(\d{1,5})/i, texto)
  }

  // VALOR DO CRÉDITO — "R$400.000,00" perto de "Valor do Crédito"
  let valor_credito: number | null = null
  const creditoMatch = texto.match(/Valor do Cr[ée]dito[\s\S]{0,60}?(R\$\s*[\d.]+,\d{2})/i)
  if (creditoMatch) {
    valor_credito = parseValorBR(creditoMatch[1])
  }
  // Fallback: maior valor R$ acima de 30.000 no documento
  if (!valor_credito) {
    const valores = (texto.match(/R\$\s*[\d.]+,\d{2}/g) || [])
      .map(parseValorBR)
      .filter((v): v is number => v !== null && v >= 30000)
    if (valores.length > 0) valor_credito = Math.max(...valores)
  }

  // 1ª PARCELA — "Recebemos do Consorciado a importância de R$ 9182,8"
  let valor_primeira_parcela: number | null = null
  const parcelaMatch = texto.match(/import[âa]ncia de R\$\s*([\d.]+,?\d*)/i)
  if (parcelaMatch) {
    let v = parcelaMatch[1].replace(/\./g, '').replace(',', '.')
    const num = parseFloat(v)
    if (!isNaN(num)) valor_primeira_parcela = num
  }

  // CÓDIGO/DESCRIÇÃO DO BEM e PLANO
  let plano_codigo: string | null = null
  const planoMatch = texto.match(/(IMOVELNAC|AUTONAC|MOTONAC|SERVNAC|PESADONAC|[A-Z]+NAC)/i)
  if (planoMatch) plano_codigo = planoMatch[1].toUpperCase()

  // BEM detectado
  let bem_detectado: string | null = null
  const t = texto.toLowerCase()
  if (/imovelnac|im[óo]vel|apartamento|terreno/.test(t)) bem_detectado = 'Imóvel'
  else if (/pesadonac|caminh[ãa]o|m[áa]quina|trator/.test(t)) bem_detectado = 'Pesados'
  else if (/autonac|motonac|autom[óo]vel|ve[íi]culo/.test(t)) bem_detectado = 'Veículo'
  else if (/servnac|servi[çc]o|viagem/.test(t)) bem_detectado = 'Serviços'

  const campos = [nome, cpf_cnpj, telefone, email, numero_proposta, grupo, cota, valor_credito, valor_primeira_parcela, bem_detectado]
  const campos_encontrados = campos.filter((c) => c !== null && c !== undefined).length

  return {
    nome, cpf_cnpj, telefone, email,
    numero_proposta, numero_contrato: numero_proposta,
    grupo, cota, valor_credito, valor_primeira_parcela,
    bem_detectado, plano_codigo,
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
