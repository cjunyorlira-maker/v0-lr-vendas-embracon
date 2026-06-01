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
  data_venda: string | null
  campos_encontrados: number
  campos_totais: number
}

function parseValorBR(texto: string): number | null {
  if (!texto) return null
  let limpo = texto.replace(/[R$\s]/g, '')
  if (limpo.includes(',')) {
    // tem vírgula = decimal brasileiro: pontos são milhar
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  } else if (/\.\d{3}(\.\d{3})*$/.test(limpo)) {
    // sem vírgula mas com ponto de milhar (ex: 12.345 ou 1.234.567) = inteiro
    limpo = limpo.replace(/\./g, '')
  }
  const num = parseFloat(limpo)
  return isNaN(num) ? null : num
}

export function parseProposta(textoPdf: string): DadosProposta {
  // normaliza espaços não-quebráveis (NBSP \u00a0) e \r — eles quebram os regex de busca
  const texto = textoPdf.replace(/\u00a0/g, ' ').replace(/\r/g, '')
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  // Helper: acha índice da primeira linha que casa com regex
  const idxLinha = (re: RegExp, start = 0) => {
    for (let i = start; i < linhas.length; i++) if (re.test(linhas[i])) return i
    return -1
  }
  const isCPF = (s: string) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s)
  const isNomeMaiusculo = (s: string) =>
    /^[A-ZÀ-Ú][A-ZÀ-Ú\s]{8,60}$/.test(s) &&
    s.split(/\s+/).length >= 2 &&
    !/EMBRACON|CONSORCIO|CONSÓRCIO|CONSORCIADO|ADMINISTRADORA|PROPOSTA|PARTICIPA|REGULAMENTO|BANCO CENTRAL|RUA|AVENIDA|ALAMEDA|JARDIM|BAIRRO|CIDADE|CRAVINHOS|RECEPCIONISTA|MAIS POR MENOS|IMOVEL|AUTOMOVEL|RESID[EÊ]NCIA|PR[ÓO]PRIA/.test(s)

  // ─── NOME do titular ─── primeira linha maiúscula que NÃO é a do cônjuge.
  // O nome do cônjuge vem após "(X)Nome do Cônjuge". O titular vem antes.
  let nome: string | null = null
  const idxLabelConjugeNome = idxLinha(/Nome do C[ôo]njuge/i)
  for (let i = 0; i < linhas.length; i++) {
    if (isNomeMaiusculo(linhas[i])) {
      // se essa linha vem logo depois do label "Nome do Cônjuge", pula (é o cônjuge)
      if (idxLabelConjugeNome !== -1 && i > idxLabelConjugeNome && i <= idxLabelConjugeNome + 2) continue
      nome = linhas[i]
      break
    }
  }

  // ─── CPF do titular ─── o CPF que vem logo APÓS o nome do titular.
  let cpf_cnpj: string | null = null
  if (nome) {
    const idxNome = linhas.indexOf(nome)
    // procura primeiro CPF depois do nome (dentro de 5 linhas)
    for (let i = idxNome + 1; i < Math.min(idxNome + 6, linhas.length); i++) {
      if (isCPF(linhas[i])) { cpf_cnpj = linhas[i]; break }
    }
  }
  // fallback: pega CPF que não é o do cônjuge
  if (!cpf_cnpj) {
    const idxConjuge = idxLinha(/CPF do C[ôo]njuge/i)
    for (let i = 0; i < linhas.length; i++) {
      if (isCPF(linhas[i])) {
        if (idxConjuge !== -1 && i > idxConjuge && i <= idxConjuge + 2) continue
        cpf_cnpj = linhas[i]; break
      }
    }
  }

  // ─── TELEFONE ─── número de 8-9 dígitos após "Tel. Celular", DDD após "DDD"
  let telefone: string | null = null
  const idxCel = idxLinha(/Tel\.?\s*Celular/i)
  let numCel = ''
  if (idxCel !== -1) {
    for (let i = idxCel + 1; i < Math.min(idxCel + 4, linhas.length); i++) {
      const mm = linhas[i].match(/^(\d{8,9})$/)
      if (mm && mm[1] !== '0') { numCel = mm[1]; break }
    }
  }
  // DDD: última linha "DDD" seguida de 2 dígitos ≠ 0
  let ddd = ''
  for (let i = 0; i < linhas.length; i++) {
    if (/^DDD$/i.test(linhas[i]) && i + 1 < linhas.length) {
      const d = linhas[i + 1].trim()
      if (/^\d{2}$/.test(d) && d !== '00' && d !== '0') ddd = d
    }
  }
  if (numCel) telefone = (ddd ? ddd + ' ' : '') + numCel

  // ─── EMAIL ───
  const emailMatch = texto.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i)
  const email = emailMatch ? emailMatch[1] : null

  // ─── Nº PROPOSTA ─── 7 dígitos na linha "Grupo Cota...9881377"
  let numero_proposta: string | null = null
  for (const linha of linhas) {
    // linha que contém "Grupo Cota" e um número de 6-8 dígitos
    if (/Grupo\s*Cota/i.test(linha)) {
      const numMatch = linha.match(/(\d{6,8})/)
      if (numMatch) { numero_proposta = numMatch[1]; break }
    }
  }
  // fallback: 7 dígitos isolados nas primeiras linhas
  if (!numero_proposta) {
    for (const linha of linhas.slice(0, 15)) {
      const mm = linha.match(/^(\d{7})$/)
      if (mm) { numero_proposta = mm[1]; break }
    }
  }

  // ─── GRUPO e COTA ─── linha "7275 2913 - 0"
  let grupo: string | null = null
  let cota: string | null = null
  for (const linha of linhas) {
    const gc = linha.match(/^(\d{4})\s+(\d{3,5})\s*-\s*(\d)$/)
    if (gc) { grupo = gc[1]; cota = gc[2] + '-' + gc[3]; break }
  }

  // ─── VALOR DO CRÉDITO ─── primeiro "R$NNN.NNN,NN" >= 30.000
  let valor_credito: number | null = null
  // procura linha que começa com R$ e tem valor alto, perto de "Valor do Crédito"
  const idxCredLabel = idxLinha(/Valor do Cr[ée]dito/i)
  if (idxCredLabel !== -1) {
    for (let i = idxCredLabel; i < Math.min(idxCredLabel + 5, linhas.length); i++) {
      const v = linhas[i].match(/R\$\s*[\d.]+,\d{2}/)
      if (v) {
        const num = parseValorBR(v[0])
        if (num && num >= 30000) { valor_credito = num; break }
      }
    }
  }
  if (!valor_credito) {
    const valores = (texto.match(/R\$\s*[\d.]+,\d{2}/g) || [])
      .map(parseValorBR)
      .filter((v): v is number => v !== null && v >= 30000)
    if (valores.length > 0) valor_credito = Math.max(...valores)
  }

  // ─── 1ª PARCELA ─── "Recebemos ... a importância de R$ 4612" (mesma linha, com OU sem decimais)
  let valor_primeira_parcela: number | null = null
  const idxImp = idxLinha(/import[âa]ncia de R\$/i)
  if (idxImp !== -1) {
    // 1) valor logo após "importância de R$" na mesma linha (vírgula opcional)
    const mesmaLinha = linhas[idxImp].match(/import[âa]ncia de R\$\s*([\d.]+(?:,\d{1,2})?)/i)
    if (mesmaLinha) {
      const num = parseValorBR(mesmaLinha[1])
      if (num && num >= 100) valor_primeira_parcela = num
    }
    // 2) fallback: valor numa linha próxima
    if (!valor_primeira_parcela) {
      for (let i = idxImp; i < Math.min(idxImp + 8, linhas.length); i++) {
        const vm = linhas[i].match(/(?:^|\s)([\d.]+(?:,\d{1,2})?)\s*$/)
        if (vm) {
          const num = parseValorBR(vm[1])
          if (num && num >= 100) { valor_primeira_parcela = num; break }
        }
      }
    }
  }

  // ─── ADESÃO calculada ─── deduz 1% ou 2% pela taxa antecipada embutida
  let adesao_calculada: number | null = null
  let valor_demais_parcelas: number | null = null
  if (valor_credito && valor_primeira_parcela) {
    const parcelaSe1 = valor_primeira_parcela - valor_credito * 0.01
    const parcelaSe2 = valor_primeira_parcela - valor_credito * 0.02
    const minP = valor_credito * 0.0008
    const maxP = valor_credito * 0.012
    const ok1 = parcelaSe1 >= minP && parcelaSe1 <= maxP
    const ok2 = parcelaSe2 >= minP && parcelaSe2 <= maxP
    if (ok2 && !ok1) { adesao_calculada = 2; valor_demais_parcelas = Math.round(parcelaSe2 * 100) / 100 }
    else if (ok1 && !ok2) { adesao_calculada = 1; valor_demais_parcelas = Math.round(parcelaSe1 * 100) / 100 }
    else if (ok1 && ok2) { adesao_calculada = 2; valor_demais_parcelas = Math.round(parcelaSe2 * 100) / 100 }
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

  // Data de fechamento: "Dia 27 Mês maio Ano 2026"
  const MESES_MAP: Record<string, number> = { janeiro:1, fevereiro:2, 'março':3, marco:3, abril:4, maio:5, junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12 }
  let dataVenda: string | null = null
  const mData = texto.match(/Dia\s+(\d{1,2})\s+M[êe]s\s+(\w+)\s+Ano\s+(\d{4})/i)
  if (mData) {
    const dia = parseInt(mData[1])
    const mes = MESES_MAP[mData[2].toLowerCase()] || 0
    const ano = parseInt(mData[3])
    if (mes > 0) dataVenda = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
  }

  const campos = [nome, cpf_cnpj, telefone, email, numero_proposta, grupo, cota, valor_credito, valor_primeira_parcela, bem_detectado]
  const campos_encontrados = campos.filter((c) => c !== null && c !== undefined).length

  return {
    nome, cpf_cnpj, telefone, email,
    numero_proposta, numero_contrato: numero_proposta,
    grupo, cota, valor_credito, valor_primeira_parcela, valor_demais_parcelas,
    adesao_calculada, bem_detectado, plano_codigo,
    data_venda: dataVenda,
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
