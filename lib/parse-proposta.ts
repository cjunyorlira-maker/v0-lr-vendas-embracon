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

  const nome = buscar(/(?:Nome|Cliente|Consorciado|Proponente)[:\s]+([A-ZÀ-Ú][A-Za-zÀ-ú\s]{5,60})/i, texto)
  const cpf_cnpj = buscar(/(?:CPF|CNPJ|CPF\/CNPJ)[:\s]*([\d.\-\/]{11,18})/i, texto)
  const telefone = buscar(/(?:Telefone|Celular|Tel|Fone)[:\s]*(\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4})/i, texto)
  const email = buscar(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i, texto)
  const numero_proposta = buscar(/(?:Proposta|N[º°]\s*Proposta|Nº da Proposta)[:\s#]*(\d{4,12})/i, texto)
  const numero_contrato = buscar(/(?:Contrato|N[º°]\s*Contrato|Nº do Contrato)[:\s#]*(\d{4,12})/i, texto)
  const grupo = buscar(/Grupo[:\s]*(\d{3,6})/i, texto)
  const cota = buscar(/Cota[:\s]*(\d{1,6})/i, texto)

  const creditoStr = buscar(/(?:Cr[ée]dito|Valor do Cr[ée]dito|Valor do Bem)[:\s]*(R\$?\s*[\d.]+,\d{2})/i, texto)
  const valor_credito = creditoStr ? parseValorBR(creditoStr) : null

  const parcelaStr = buscar(/(?:1[ªa]\s*Parcela|Primeira Parcela|Valor da Parcela)[:\s]*(R\$?\s*[\d.]+,\d{2})/i, texto)
  const valor_primeira_parcela = parcelaStr ? parseValorBR(parcelaStr) : null

  let bem_detectado: string | null = null
  const t = texto.toLowerCase()
  if (/im[óo]vel|imovel|apartamento|casa|terreno/.test(t)) bem_detectado = 'Imóvel'
  else if (/caminh[ãa]o|m[áa]quina|pesado|trator/.test(t)) bem_detectado = 'Pesados'
  else if (/autom[óo]vel|ve[íi]culo|carro|moto/.test(t)) bem_detectado = 'Veículo'
  else if (/servi[çc]o|viagem|reforma/.test(t)) bem_detectado = 'Serviços'

  const campos = [nome, cpf_cnpj, telefone, email, numero_proposta, numero_contrato, grupo, cota, valor_credito, valor_primeira_parcela]
  const campos_encontrados = campos.filter((c) => c !== null && c !== undefined).length

  return {
    nome, cpf_cnpj, telefone, email, numero_proposta, numero_contrato,
    grupo, cota, valor_credito, valor_primeira_parcela, bem_detectado,
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
