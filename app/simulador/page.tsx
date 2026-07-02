'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Calculator, CreditCard, Loader2, AlertTriangle } from 'lucide-react'
import { jsPDF } from 'jspdf'

interface Plano { id: string; sigla: string; nome_completo: string; bem: string; adesao_percent: number; estorno_ate_pgto: number | null; categoria_comissao: string | null; seguro_pct?: number | null; tx_adm_topo?: number | null; cheia_incremento_pct?: number | null; prazo_meses?: number | null; reduzida_25_pct?: number | null; pl_demais_50_pct?: number | null; pl_demais_25_pct?: number | null; pl_demais_int_pct?: number | null; pl_p12_50_pct?: number | null; pl_p12_25_pct?: number | null; pl_p12_int_pct?: number | null }
interface FaixaCredito { credito: number; primeira_parcela: number; demais_parcela: number; total_nao_estornar: number }

const fmtMoeda = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// categorias agrupadas
const CATEGORIAS: Record<string, { label: string; siglas: string[] }> = {
  imovel_1: { label: '🏠 Imóvel Adesão 1%', siglas: ['EI1', 'SUE'] },
  imovel_2: { label: '🏠 Imóvel Adesão 2%', siglas: ['PSE', 'SEP'] },
  imovel_parcelinha: { label: '🏠 Imóvel Parcelinha', siglas: ['TP', 'TEP'] },
  auto_1: { label: '🚗 Auto Adesão 1%', siglas: ['ETA'] },
  auto_2: { label: '🚗 Auto Adesão 2%', siglas: ['PE2'] },
  pesados_2: { label: '🚛 Pesados Adesão 2%', siglas: ['SP'] },
}

export default function SimuladorPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [categoria, setCategoria] = useState('')
  const [planoSigla, setPlanoSigla] = useState('')
  const [faixas, setFaixas] = useState<FaixaCredito[]>([])
  const [creditoSel, setCreditoSel] = useState('')
  const [comSeguro, setComSeguro] = useState(false)
  const [verCheia, setVerCheia] = useState(false)
  const [tipoParcela, setTipoParcela] = useState<'red50' | 'red25' | 'cheia'>('red50')
  const [tipoAntecipacao, setTipoAntecipacao] = useState<'red50' | 'red25' | 'cheia'>('red50')
  const [qtdAntecipar, setQtdAntecipar] = useState('2')
  const [nomeCliente, setNomeCliente] = useState('')
  const [lanceEmbutido, setLanceEmbutido] = useState('')
  const [empresaNome, setEmpresaNome] = useState('')
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('planos').select('id, sigla, nome_completo, bem, adesao_percent, estorno_ate_pgto, categoria_comissao, seguro_pct, tx_adm_topo, cheia_incremento_pct, prazo_meses, reduzida_25_pct, pl_demais_50_pct, pl_demais_25_pct, pl_demais_int_pct, pl_p12_50_pct, pl_p12_25_pct, pl_p12_int_pct').eq('ativo', true).order('bem').then(({ data }) => {
      if (data) setPlanos(data as Plano[]); setLoading(false)
    })
  }, [])

  useEffect(() => {
    // carrega uma imagem (URL ou caminho público) e converte pra base64 pro PDF
    const carregarLogo = (url: string) => {
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          const reader = new FileReader()
          reader.onloadend = () => setLogoBase64(reader.result as string)
          reader.readAsDataURL(blob)
        })
        .catch(() => setLogoBase64(null))
    }
    fetch('/api/simulador/empresa').then(r => r.json()).then(d => {
      setEmpresaNome(d.empresa_nome || '')
      setEmpresaLogo(d.logo_url || null)
      // usa a logo própria da empresa; sem logo (ou LR Multimarcas) cai pra logo da LR do projeto
      carregarLogo(d.logo_url || '/logo-lr.png')
    }).catch(() => carregarLogo('/logo-lr.png'))
  }, [])

  // planos da categoria escolhida
  const planosDaCategoria = categoria ? planos.filter(p => CATEGORIAS[categoria]?.siglas.includes(p.sigla)) : []

  useEffect(() => {
    if (!planoSigla) { setFaixas([]); return }
    const supabase = createClient()
    supabase.from('tabelas_credito').select('credito, primeira_parcela, demais_parcela, total_nao_estornar').eq('sigla', planoSigla).order('credito', { ascending: false }).then(({ data }) => {
      if (data) setFaixas(data as FaixaCredito[]); setCreditoSel('')
    })
  }, [planoSigla])

  const faixa = faixas.find(f => String(f.credito) === creditoSel)
  const qtd = parseInt(qtdAntecipar) || 0
  const planoAtual = planos.find(p => p.sigla === planoSigla)
  const prazoPlano = planoAtual?.prazo_meses || 240
  const seguroPct = planoAtual?.seguro_pct || 0
  const seguroMensal = (comSeguro && faixa) ? Math.round(faixa.credito * seguroPct * 100) / 100 : 0
  const cheiaInc = planoAtual?.cheia_incremento_pct || 0
  const demaisCheia = faixa ? Math.round((faixa.demais_parcela + faixa.credito * cheiaInc) * 100) / 100 + seguroMensal : 0
  const primeiraCheia = faixa ? demaisCheia + Math.round(faixa.credito * (planoAtual?.adesao_percent || 0) / 100 * 100) / 100 : 0
  const red25Pct = planoAtual?.reduzida_25_pct || 0
  const demais25 = faixa && red25Pct > 0 ? Math.round(faixa.credito * red25Pct * 100) / 100 + seguroMensal : 0
  const primeira25 = faixa && red25Pct > 0 ? demais25 + Math.round(faixa.credito * (planoAtual?.adesao_percent || 0) / 100 * 100) / 100 : 0
  const p1 = (faixa?.primeira_parcela || 0) + seguroMensal
  const pd = (faixa?.demais_parcela || 0) + seguroMensal
  // Parcelinha: as parcelas 1 a 12 são iguais (valor maior). Antecipar = antecipar as parcelas 1-12.
  const ehParcelinha = planoAtual?.categoria_comissao === 'imovel_parcelinha'
  // PARCELINHA: usa percentuais próprios (1ª-12ª = p1, demais = pd; sem adesão)
  let pdParc25 = demais25, p1Parc25 = primeira25, pdParcCheia = demaisCheia, p1ParcCheia = primeiraCheia
  if (ehParcelinha && faixa) {
    const C = faixa.credito
    // demais (cada) por nível
    pdParc25    = Math.round(C * (planoAtual?.pl_demais_25_pct || 0) * 100) / 100 + seguroMensal
    pdParcCheia = Math.round(C * (planoAtual?.pl_demais_int_pct || 0) * 100) / 100 + seguroMensal
    // 1ª-12ª por nível
    p1Parc25    = Math.round(C * (planoAtual?.pl_p12_25_pct || 0) * 100) / 100 + seguroMensal
    p1ParcCheia = Math.round(C * (planoAtual?.pl_p12_int_pct || 0) * 100) / 100 + seguroMensal
  }
  // funções pra pegar a parcela conforme o tipo escolhido
  const pdPorTipo = (t: string) => {
    if (ehParcelinha) return t === 'cheia' ? pdParcCheia : t === 'red25' ? pdParc25 : pd
    return t === 'cheia' ? demaisCheia : t === 'red25' ? demais25 : pd
  }
  const p1PorTipo = (t: string) => {
    if (ehParcelinha) return t === 'cheia' ? p1ParcCheia : t === 'red25' ? p1Parc25 : p1
    return t === 'cheia' ? primeiraCheia : t === 'red25' ? primeira25 : p1
  }
  const labelPorTipo = (t: string) => t === 'cheia' ? 'cheia' : t === 'red25' ? '25%' : '50%'
  // parcela mostrada na proposta (escolha 1)
  const p1Proposta = p1PorTipo(tipoParcela)
  const pdProposta = pdPorTipo(tipoParcela)
  // base da antecipação/entrada (escolha 2, independente)
  const pdAntecip = pdPorTipo(tipoAntecipacao)
  const p1Antecip = p1PorTipo(tipoAntecipacao)
  // versões SEM seguro (o seguro é somado separadamente nas caixas do PDF)
  const p1PropostaSemSeg = p1Proposta - seguroMensal
  const pdPropostaSemSeg = pdProposta - seguroMensal
  // valor da entrada = 1ª (base antecip) + (qtd) demais (base antecip); na Parcelinha são (1+qtd) parcelas iguais
  const entradaProposta = ehParcelinha ? p1Antecip * (1 + qtd) : p1Antecip + pdAntecip * qtd
  const nParcelasEntrada = 1 + qtd
  const entradaPropostaSemSeg = entradaProposta - seguroMensal * nParcelasEntrada
  // antecipadas: na Parcelinha o cliente antecipa as parcelas 1-12 (valor p1); nos outros antecipa as demais (pd)
  const valorAntecipadas = ehParcelinha ? p1 * qtd : pd * qtd
  const totalCliente = ehParcelinha ? p1 * (1 + qtd) : p1 + pd * qtd
  // não estornar (só planos com estorno; Parcelinha não tem)
  const limiteEstorno = planoAtual?.estorno_ate_pgto || 0
  const totalNaoEstornar = limiteEstorno > 0 ? p1 + pd * (limiteEstorno - 1) : (faixa?.total_nao_estornar || 0)
  const lanceNum = parseFloat((lanceEmbutido || '').replace(/\./g, '').replace(',', '.')) || 0
  const prazoRestante = Math.max(0, prazoPlano - (1 + qtd))
  const creditoLiquido = faixa ? faixa.credito - lanceNum : 0

  const inputStyle = { background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }

  const formatarMoeda = (valor: string) => {
    const num = valor.replace(/\D/g, '')
    if (!num) return ''
    return parseInt(num).toLocaleString('pt-BR')
  }

  const gerarPDF = () => {
    if (!faixa || !planoAtual) return
    const doc = new jsPDF()
    doc.setLanguage('pt-BR')
    const RED: [number,number,number] = [200, 32, 46]
    const DARK: [number,number,number] = [55, 55, 55]
    const fmt = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    const W = 210

    // Badge pílula vermelha com texto branco (canto suave + sombra sutil)
    const badge = (x: number, yy: number, w: number, label: string) => {
      doc.setFillColor(220, 220, 220)
      doc.roundedRect(x + 0.4, yy + 0.5, w, 7, 4, 4, 'F')
      doc.setFillColor(...RED); doc.roundedRect(x, yy, w, 7, 4, 4, 'F')
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8)
      doc.text(label, x + w/2, yy + 4.8, { align: 'center' })
    }
    const valor = (x: number, yy: number, txt: string) => {
      doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(9)
      doc.text(txt, x, yy + 4.8)
    }
    const caixaSombra = (x: number, yy: number, w: number, h: number) => {
      doc.setFillColor(235, 235, 235)
      doc.roundedRect(x + 1, yy + 1.2, w, h, 3, 3, 'F')
      doc.setDrawColor(228, 228, 228); doc.setFillColor(255, 255, 255)
      doc.roundedRect(x, yy, w, h, 3, 3, 'FD')
    }

    // Header com gradiente vermelho (escuro -> claro)
    for (let i = 0; i < 30; i++) {
      const t = i / 30
      const r = Math.round(160 + (210 - 160) * t)
      const g = Math.round(20 + (45 - 20) * t)
      const b = Math.round(34 + (55 - 34) * t)
      doc.setFillColor(r, g, b)
      doc.rect(0, i, W, 1, 'F')
    }
    doc.setTextColor(255,255,255); doc.setFont('helvetica','normal'); doc.setFontSize(15)
    doc.text('Oi, ' + (nomeCliente || 'Cliente'), 14, 13)
    doc.setFontSize(11)
    doc.text('Aqui está a sua simulação de crédito.', 14, 21)
    // logo sobre faixa branca (pra logo preta aparecer legível no header vermelho)
    if (logoBase64) {
      try {
        const fmtImg = logoBase64.includes('image/png') ? 'PNG' : 'JPEG'
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(W - 60, 4, 50, 22, 2, 2, 'F')
        doc.addImage(logoBase64, fmtImg, W - 58, 6, 46, 18, undefined, 'FAST')
      } catch (e) {
        doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255)
        doc.text(empresaNome || 'LR MULTIMARCAS', W - 14, 16, { align: 'right' })
      }
    } else {
      doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255)
      doc.text(empresaNome || 'LR MULTIMARCAS', W - 14, 16, { align: 'right' })
    }

    // Bloco cliente (3 linhas com badge)
    let y = 40
    badge(14, y, 38, 'Cliente'); valor(56, y, nomeCliente || 'Simulação'); y += 10
    badge(14, y, 38, 'Criada em'); valor(56, y, new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})); y += 10
    badge(14, y, 38, 'Interesse'); valor(56, y, planoAtual.bem); y += 14

    // Título central
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(15)
    doc.text('Detalhes da proposta', W/2, y, { align: 'center' }); y += 10

    const colY = y
    // ===== COLUNA ESQUERDA =====
    // Caixa Resumo
    caixaSombra(14, colY, 88, 92)
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(11)
    doc.text('Resumo', 14 + 44, colY + 8, { align: 'center' })
    let ry = colY + 14
    const resumoItens: [string,string,number][] = [
      ['Crédito total', fmt(faixa.credito), 40],
      ['Lance embutido', fmt(lanceNum), 40],
      ['Crédito líquido', fmt(creditoLiquido), 40],
      ['Prazo', prazoRestante + ' meses', 30],
      ['Taxa adm', (planoAtual.tx_adm_topo || '-') + '%', 30],
    ['Adesão', planoAtual.adesao_percent + '%', 36],
    ['Fundo reserva', (planoAtual.bem === 'Imóvel' ? '2%' : '3%'), 34],
    ]
    resumoItens.forEach(([k,v,bw]) => { badge(18, ry, bw, k); valor(18 + bw + 4, ry, v); ry += 10.5 })

    // Investimento com seguro (fundo claro)
    const segMensal = Math.round(faixa.credito * (planoAtual.seguro_pct || 0) * 100) / 100
    // valor de cada parcela 1ª-12ª (parcelinha) conforme o tipo escolhido na proposta
    const p12PropostaSemSeg = p1PropostaSemSeg
    const p12PropostaComSeg = p1PropostaSemSeg + segMensal
    // Primeiro pagamento = 1ª parcela + parcelas antecipadas (qtd)
    const primeiroPagamentoSem = entradaPropostaSemSeg
    const primeiroPagamentoCom = entradaPropostaSemSeg + segMensal * nParcelasEntrada
    let y2 = colY + 100
    caixaSombra(14, y2, 88, (ehParcelinha ? 54 : 44))
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text('Investimento com seguro', 14 + 44, y2 + 8, { align: 'center' })
    let iy = y2 + 14
    badge(18, iy, 38, '1º pagamento'); valor(60, iy, fmt(primeiroPagamentoCom)); iy += 10
    if (ehParcelinha) { badge(18, iy, 38, '1ª à 12ª'); valor(60, iy, fmt(p12PropostaComSeg)); iy += 10 }
    badge(18, iy, 38, 'Demais parcelas'); valor(60, iy, fmt(pdPropostaSemSeg + segMensal)); iy += 10
    badge(18, iy, 36, 'Valor do seguro'); valor(58, iy, fmt(segMensal))

    // Investimento sem seguro (fundo claro)
    let y3 = y2 + (ehParcelinha ? 62 : 52)
    caixaSombra(14, y3, 88, (ehParcelinha ? 44 : 34))
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text('Investimento sem seguro', 14 + 44, y3 + 8, { align: 'center' })
    let sy = y3 + 14
    badge(18, sy, 38, '1º pagamento'); valor(60, sy, fmt(primeiroPagamentoSem)); sy += 10
    if (ehParcelinha) { badge(18, sy, 38, '1ª à 12ª'); valor(60, sy, fmt(p12PropostaSemSeg)); sy += 10 }
    badge(18, sy, 38, 'Demais parcelas'); valor(60, sy, fmt(pdPropostaSemSeg))

    // ===== COLUNA DIREITA =====
    let ry2 = colY
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(11)
    doc.text('Demonstrativo de taxa', 108 + 44, ry2 + 8, { align: 'center' })
    ry2 += 16
    const admTopo = planoAtual.tx_adm_topo || 0
    const taxaMes = admTopo / prazoPlano
    const taxaAno = taxaMes * 12
    const fmtPct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
    const barMes = 18
    badge(112, ry2, 22, 'Mês'); doc.setDrawColor(180,220,210); doc.setFillColor(200,230,220); doc.roundedRect(138, ry2+1, barMes, 5, 2.5, 2.5, 'F'); valor(138 + barMes + 4, ry2, fmtPct(taxaMes)); ry2 += 11
    const barAno = Math.min(barMes * 12, 44)
    badge(112, ry2, 22, 'Ano'); doc.setFillColor(235,200,205); doc.roundedRect(138, ry2+1, barAno, 5, 2.5, 2.5, 'F'); valor(138 + barAno + 4, ry2, fmtPct(taxaAno)); ry2 += 16

    // Avisos
    doc.setTextColor(120,120,120); doc.setFont('helvetica','normal'); doc.setFontSize(7.5)
    const avisos = [
      '* Proposta sujeita a alterações, segundo critérios de disponibilidade de vagas no grupo de consórcio.',
      '* Os termos desta proposta têm validade de dois dias, contados a partir da simulação.',
      '* O crédito e parcelas são atualizados no aniversário da cota pelos índices: INCC (imóvel) ou IPCA (demais).',
      '* Os valores das parcelas poderão ser reajustados após a contemplação.',
    ]
    avisos.forEach(a => { doc.text(a, 108, ry2, { maxWidth: 90 }); ry2 += 11 })
    doc.setTextColor(90,90,90); doc.setFontSize(8)
    doc.text('TABELA ' + planoAtual.nome_completo, 108, ry2, { maxWidth: 90 }); ry2 += 5
    doc.text('Tipo: Mais por menos · parcela ' + labelPorTipo(tipoParcela), 108, ry2)

    doc.save('Proposta_' + (nomeCliente || 'cliente').replace(/\s+/g, '_') + '.pdf')
  }

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Simulador" />
        <main className="mx-auto max-w-3xl px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Calculator size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Simulador de Venda</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Simule quanto o cliente paga</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl p-5" style={{ background: 'rgba(17,18,22,0.92)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Tipo de tabela</label>
                    <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPlanoSigla(''); setFaixas([]) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k} style={{ background: '#131313' }}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Plano</label>
                    <select value={planoSigla} onChange={(e) => setPlanoSigla(e.target.value)} disabled={!planosDaCategoria.length} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {planosDaCategoria.map(p => <option key={p.id} value={p.sigla} style={{ background: '#131313' }}>{p.sigla} — {p.nome_completo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Valor do crédito</label>
                    <select value={creditoSel} onChange={(e) => setCreditoSel(e.target.value)} disabled={!faixas.length} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
                      <option value="" style={{ background: '#131313' }}>Selecione</option>
                      {faixas.map(f => <option key={f.credito} value={String(f.credito)} style={{ background: '#131313' }}>{fmtMoeda(f.credito)}</option>)}
                    </select>
                    {faixa && seguroPct > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => setComSeguro(false)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors" style={{ background: !comSeguro ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: `1px solid ${!comSeguro ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.12)'}`, color: !comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>Sem seguro</button>
                        <button onClick={() => setComSeguro(true)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors" style={{ background: comSeguro ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: `1px solid ${comSeguro ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.12)'}`, color: comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>Com seguro</button>
                      </div>
                    )}
                    {comSeguro && seguroMensal > 0 && (
                      <p className="text-[11px] mt-2" style={{ color: 'var(--muted-color)' }}>Seguro de R$ {seguroMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês incluído em cada parcela.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Parcelas a antecipar</label>
                    <input type="number" min="0" value={qtdAntecipar} onChange={(e) => setQtdAntecipar(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                  </div>
                </div>

                {faixa && (
                  <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Gerar PDF da proposta</label>
                    <input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome do cliente" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted-color)' }}>R$</span>
                      <input value={lanceEmbutido} onChange={e => setLanceEmbutido(formatarMoeda(e.target.value))} placeholder="Lance embutido (opcional)" inputMode="numeric" className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none" style={inputStyle} />
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--muted-color)' }}>Prazo da proposta: {prazoRestante} meses</p>
                    {(red25Pct > 0 || cheiaInc > 0 || ehParcelinha) && (
                      <>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Parcela mostrada na proposta</label>
                          <div className="flex gap-2">
                            <button onClick={() => setTipoParcela('red50')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: tipoParcela === 'red50' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipoParcela === 'red50' ? 'var(--accent)' : 'var(--border)'}`, color: tipoParcela === 'red50' ? 'var(--accent)' : 'var(--muted-color)' }}>50%</button>
                            {(red25Pct > 0 || ehParcelinha) && <button onClick={() => setTipoParcela('red25')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: tipoParcela === 'red25' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipoParcela === 'red25' ? 'var(--accent)' : 'var(--border)'}`, color: tipoParcela === 'red25' ? 'var(--accent)' : 'var(--muted-color)' }}>25%</button>}
                            {(cheiaInc > 0 || ehParcelinha) && <button onClick={() => setTipoParcela('cheia')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: tipoParcela === 'cheia' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipoParcela === 'cheia' ? 'var(--accent)' : 'var(--border)'}`, color: tipoParcela === 'cheia' ? 'var(--accent)' : 'var(--muted-color)' }}>Cheia</button>}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Base da antecipação (entrada)</label>
                          <div className="flex gap-2">
                            <button onClick={() => setTipoAntecipacao('red50')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: tipoAntecipacao === 'red50' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipoAntecipacao === 'red50' ? '#3b82f6' : 'var(--border)'}`, color: tipoAntecipacao === 'red50' ? '#3b82f6' : 'var(--muted-color)' }}>50%</button>
                            {(red25Pct > 0 || ehParcelinha) && <button onClick={() => setTipoAntecipacao('red25')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: tipoAntecipacao === 'red25' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipoAntecipacao === 'red25' ? '#3b82f6' : 'var(--border)'}`, color: tipoAntecipacao === 'red25' ? '#3b82f6' : 'var(--muted-color)' }}>25%</button>}
                            {(cheiaInc > 0 || ehParcelinha) && <button onClick={() => setTipoAntecipacao('cheia')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: tipoAntecipacao === 'cheia' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipoAntecipacao === 'cheia' ? '#3b82f6' : 'var(--border)'}`, color: tipoAntecipacao === 'cheia' ? '#3b82f6' : 'var(--muted-color)' }}>Cheia</button>}
                          </div>
                        </div>
                      </>
                    )}
                    <button onClick={gerarPDF} className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors" style={{ background: 'linear-gradient(135deg, rgba(200,32,46,0.85), rgba(160,20,34,0.85))', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', boxShadow: '0 8px 24px rgba(200,32,46,0.25)' }}>Gerar PDF da proposta</button>
                  </div>
                )}
              </div>

              {faixa && (
                <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                  <div className="flex items-center gap-3 mb-4"><CreditCard size={18} style={{ color: '#3b82f6' }} /><h3 className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Quanto o cliente paga</h3></div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>{ehParcelinha ? 'Parcela (1ª a 12ª)' : '1ª parcela'}</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(p1)}</p></div>
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Demais (cada)</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(pd)}</p></div>
                    <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>+ {qtd} antecipadas</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(valorAntecipadas)}</p></div>
                    {!ehParcelinha && <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total p/ não estornar{limiteEstorno > 0 ? ` (1ª + ${limiteEstorno - 1})` : ''}</p><p className="text-lg font-semibold" style={{ color: '#f59e0b' }}>{fmtMoeda(totalNaoEstornar)}</p></div>}
                  </div>
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total que o cliente desembolsa (1ª + {qtd})</p>
                    <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(totalCliente)}</p>
                  </div>

                  <p className="text-xs mt-3" style={{ color: 'var(--muted-color)' }}>Prazo: {prazoPlano} meses {planoAtual?.tx_adm_topo ? `· Taxa adm. total: ${planoAtual.tx_adm_topo}%` : ''}</p>
                  {(red25Pct > 0 || cheiaInc > 0 || ehParcelinha) && faixa && (
                    <button onClick={() => setVerCheia(v => !v)} className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors w-full ${verCheia ? '' : 'animate-pulse'}`} style={{
                      background: verCheia ? 'rgba(212,175,55,0.18)' : 'linear-gradient(135deg, rgba(200,32,46,0.85), rgba(160,20,34,0.85))',
                      border: `1px solid ${verCheia ? 'rgba(212,175,55,0.5)' : 'rgba(255,120,130,0.5)'}`,
                      color: verCheia ? 'var(--accent)' : '#fff',
                      boxShadow: verCheia ? 'none' : '0 4px 16px rgba(200,32,46,0.35)',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    }}>
                      {verCheia ? 'Ocultar outras reduções' : '🔥 Ver 25% e parcela cheia'}
                    </button>
                  )}
                  {verCheia && faixa && (
                    <div className="mt-3 space-y-2">
                      {(red25Pct > 0 || ehParcelinha) && (
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                          <p className="text-xs mb-2" style={{ color: 'var(--muted-color)' }}>Redução de 25%{comSeguro ? ' · com seguro' : ''}:</p>
                          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted-color)' }}>{ehParcelinha ? '1ª a 12ª' : '1ª parcela'}</span><span style={{ color: 'var(--text)' }}>R$ {(ehParcelinha ? p1Parc25 : primeira25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                          <div className="flex justify-between text-sm mt-1"><span style={{ color: 'var(--muted-color)' }}>Demais</span><span style={{ color: 'var(--text)' }}>R$ {(ehParcelinha ? pdParc25 : demais25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                        </div>
                      )}
                      {(cheiaInc > 0 || ehParcelinha) && (
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                          <p className="text-xs mb-2" style={{ color: 'var(--muted-color)' }}>Parcela cheia (sem redução){comSeguro ? ' · com seguro' : ''}:</p>
                          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted-color)' }}>{ehParcelinha ? '1ª a 12ª cheia' : '1ª parcela cheia'}</span><span style={{ color: 'var(--text)' }}>R$ {(ehParcelinha ? p1ParcCheia : primeiraCheia).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                          <div className="flex justify-between text-sm mt-1"><span style={{ color: 'var(--muted-color)' }}>Demais cheias</span><span style={{ color: 'var(--text)' }}>R$ {(ehParcelinha ? pdParcCheia : demaisCheia).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                          <p className="text-[10px] mt-2" style={{ color: 'var(--muted-color)' }}>Cobrada após a contemplação (devolução integral do crédito).</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {planoAtual?.bem === 'Imóvel' && faixa && (
                <div className="rounded-xl p-4 animate-pulse" style={{ background: 'rgba(212,175,55,0.1)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(212,175,55,0.35)', boxShadow: '0 4px 16px rgba(212,175,55,0.15)' }}>
                  <p className="text-sm font-medium text-center" style={{ color: 'var(--accent)' }}>
                    😮 Dica de venda: nos planos de imóvel, vendendo com 2% de adesão em vez de 1%, a taxa de administração total cai de 26% para 22%! Melhor pro cliente e mais comissão pra você.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={15} style={{ color: '#f59e0b', marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#f59e0b' }}>Se a venda for gerada em menos meses no sistema da Embracon, o valor das parcelas pode mudar. Confira a proposta final.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
