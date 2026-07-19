'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Calculator, CreditCard, Loader2, AlertTriangle, FileText, MonitorPlay, Trophy, RotateCcw, ChevronDown, X, Pencil, Plus, Eye, EyeOff, Shield } from 'lucide-react'
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

const inputStyle = { background: 'rgba(22,23,28,0.9)', border: '1px solid var(--border)', color: 'var(--text)' }

const formatarMoeda = (valor: string) => {
  const num = valor.replace(/\D/g, '')
  if (!num) return ''
  return parseInt(num).toLocaleString('pt-BR')
}

// ══════════════════════════════════════════════════════════════
// Hook de simulação — cada instância é um estado INDEPENDENTE.
// Chamado 1x por aba, então trocar de aba nunca mistura valores.
// ══════════════════════════════════════════════════════════════
function useSimulacao(planos: Plano[]) {
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

  useEffect(() => {
    if (!planoSigla) { setFaixas([]); return }
    const supabase = createClient()
    supabase.from('tabelas_credito').select('credito, primeira_parcela, demais_parcela, total_nao_estornar').eq('sigla', planoSigla).order('credito', { ascending: false }).then(({ data }) => {
      if (data) setFaixas(data as FaixaCredito[]); setCreditoSel('')
    })
  }, [planoSigla])

  const limpar = () => {
    setCategoria(''); setPlanoSigla(''); setFaixas([]); setCreditoSel('')
    setComSeguro(false); setVerCheia(false); setTipoParcela('red50'); setTipoAntecipacao('red50')
    setQtdAntecipar('2'); setNomeCliente(''); setLanceEmbutido('')
  }

  // planos da categoria escolhida
  const planosDaCategoria = categoria ? planos.filter(p => CATEGORIAS[categoria]?.siglas.includes(p.sigla)) : []
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
    pdParc25    = Math.round(C * (planoAtual?.pl_demais_25_pct || 0) * 100) / 100 + seguroMensal
    pdParcCheia = Math.round(C * (planoAtual?.pl_demais_int_pct || 0) * 100) / 100 + seguroMensal
    p1Parc25    = Math.round(C * (planoAtual?.pl_p12_25_pct || 0) * 100) / 100 + seguroMensal
    p1ParcCheia = Math.round(C * (planoAtual?.pl_p12_int_pct || 0) * 100) / 100 + seguroMensal
  }
  const pdPorTipo = (t: string) => {
    if (ehParcelinha) return t === 'cheia' ? pdParcCheia : t === 'red25' ? pdParc25 : pd
    return t === 'cheia' ? demaisCheia : t === 'red25' ? demais25 : pd
  }
  const p1PorTipo = (t: string) => {
    if (ehParcelinha) return t === 'cheia' ? p1ParcCheia : t === 'red25' ? p1Parc25 : p1
    return t === 'cheia' ? primeiraCheia : t === 'red25' ? primeira25 : p1
  }
  const labelPorTipo = (t: string) => t === 'cheia' ? 'Cheia' : t === 'red25' ? '25%' : '50%'
  const p1Proposta = p1PorTipo(tipoParcela)
  const pdProposta = pdPorTipo(tipoParcela)
  const pdAntecip = pdPorTipo(tipoAntecipacao)
  const p1Antecip = p1PorTipo(tipoAntecipacao)
  const p1PropostaSemSeg = p1Proposta - seguroMensal
  const pdPropostaSemSeg = pdProposta - seguroMensal
  const entradaProposta = ehParcelinha ? p1Antecip * (1 + qtd) : p1Antecip + pdAntecip * qtd
  const nParcelasEntrada = 1 + qtd
  const entradaPropostaSemSeg = entradaProposta - seguroMensal * nParcelasEntrada
  const valorAntecipadas = ehParcelinha ? p1 * qtd : pd * qtd
  const totalCliente = ehParcelinha ? p1 * (1 + qtd) : p1 + pd * qtd
  const limiteEstorno = planoAtual?.estorno_ate_pgto || 0
  // acompanha o tipo de parcela selecionado (1ª + (N-1) demais do mesmo tipo)
  const totalNaoEstornar = limiteEstorno > 0 ? p1Proposta + pdProposta * (limiteEstorno - 1) : (faixa?.total_nao_estornar || 0)
  const lanceNum = parseFloat((lanceEmbutido || '').replace(/\./g, '').replace(',', '.')) || 0
  const prazoRestante = Math.max(0, prazoPlano - (1 + qtd))
  const creditoLiquido = faixa ? faixa.credito - lanceNum : 0
  const nomeAmigavel = planoAtual?.nome_completo || ''

  return {
    categoria, setCategoria, planoSigla, setPlanoSigla, faixas, setFaixas, creditoSel, setCreditoSel,
    comSeguro, setComSeguro, verCheia, setVerCheia, tipoParcela, setTipoParcela, tipoAntecipacao, setTipoAntecipacao,
    qtdAntecipar, setQtdAntecipar, nomeCliente, setNomeCliente, lanceEmbutido, setLanceEmbutido, limpar,
    planosDaCategoria, faixa, qtd, planoAtual, prazoPlano, seguroPct, seguroMensal, cheiaInc, demaisCheia, primeiraCheia,
    red25Pct, demais25, primeira25, p1, pd, ehParcelinha, pdParc25, p1Parc25, pdParcCheia, p1ParcCheia,
    pdPorTipo, p1PorTipo, labelPorTipo, p1Proposta, pdProposta, pdAntecip, p1Antecip, p1PropostaSemSeg, pdPropostaSemSeg,
    entradaProposta, nParcelasEntrada, entradaPropostaSemSeg, valorAntecipadas, totalCliente, limiteEstorno, totalNaoEstornar,
    lanceNum, prazoRestante, creditoLiquido, nomeAmigavel,
  }
}

type Sim = ReturnType<typeof useSimulacao>

// Seletores de montagem (categoria / plano / crédito) reutilizados nas duas abas
function GridMontagem({ s }: { s: Sim }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Tipo de tabela</label>
        <select value={s.categoria} onChange={(e) => { s.setCategoria(e.target.value); s.setPlanoSigla(''); s.setFaixas([]) }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}>
          <option value="" style={{ background: '#131313' }}>Selecione</option>
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k} style={{ background: '#131313' }}>{v.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Plano</label>
        <select value={s.planoSigla} onChange={(e) => s.setPlanoSigla(e.target.value)} disabled={!s.planosDaCategoria.length} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
          <option value="" style={{ background: '#131313' }}>Selecione</option>
          {s.planosDaCategoria.map(p => <option key={p.id} value={p.sigla} style={{ background: '#131313' }}>{p.nome_completo} · {p.sigla}</option>)}
        </select>
        {s.planoAtual && <p className="text-[10px] mt-1" style={{ color: 'var(--muted-color)' }}>{s.nomeAmigavel} <span style={{ opacity: 0.6 }}>({s.planoAtual.sigla})</span></p>}
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Valor do crédito</label>
        <select value={s.creditoSel} onChange={(e) => s.setCreditoSel(e.target.value)} disabled={!s.faixas.length} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle}>
          <option value="" style={{ background: '#131313' }}>Selecione</option>
          {s.faixas.map(f => <option key={f.credito} value={String(f.credito)} style={{ background: '#131313' }}>{fmtMoeda(f.credito)}</option>)}
        </select>
      </div>
    </div>
  )
}

// Botões de tipo de parcela / base de antecipação
function SeletoresTipoParcela({ s }: { s: Sim }) {
  if (!(s.red25Pct > 0 || s.cheiaInc > 0 || s.ehParcelinha)) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--accent)' }}>Parcela (1ª e demais)</label>
        <div className="flex gap-2">
          <button onClick={() => s.setTipoParcela('red50')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: s.tipoParcela === 'red50' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.tipoParcela === 'red50' ? 'var(--accent)' : 'var(--border)'}`, color: s.tipoParcela === 'red50' ? 'var(--accent)' : 'var(--muted-color)' }}>50%</button>
          {(s.red25Pct > 0 || s.ehParcelinha) && <button onClick={() => s.setTipoParcela('red25')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: s.tipoParcela === 'red25' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.tipoParcela === 'red25' ? 'var(--accent)' : 'var(--border)'}`, color: s.tipoParcela === 'red25' ? 'var(--accent)' : 'var(--muted-color)' }}>25%</button>}
          {(s.cheiaInc > 0 || s.ehParcelinha) && <button onClick={() => s.setTipoParcela('cheia')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: s.tipoParcela === 'cheia' ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.tipoParcela === 'cheia' ? 'var(--accent)' : 'var(--border)'}`, color: s.tipoParcela === 'cheia' ? 'var(--accent)' : 'var(--muted-color)' }}>Cheia</button>}
        </div>
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: '#60a5fa' }}>Entrada (antecipação)</label>
        <div className="flex gap-2">
          <button onClick={() => s.setTipoAntecipacao('red50')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: s.tipoAntecipacao === 'red50' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.tipoAntecipacao === 'red50' ? '#3b82f6' : 'var(--border)'}`, color: s.tipoAntecipacao === 'red50' ? '#3b82f6' : 'var(--muted-color)' }}>50%</button>
          {(s.red25Pct > 0 || s.ehParcelinha) && <button onClick={() => s.setTipoAntecipacao('red25')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: s.tipoAntecipacao === 'red25' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.tipoAntecipacao === 'red25' ? '#3b82f6' : 'var(--border)'}`, color: s.tipoAntecipacao === 'red25' ? '#3b82f6' : 'var(--muted-color)' }}>25%</button>}
          {(s.cheiaInc > 0 || s.ehParcelinha) && <button onClick={() => s.setTipoAntecipacao('cheia')} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium" style={{ background: s.tipoAntecipacao === 'cheia' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.tipoAntecipacao === 'cheia' ? '#3b82f6' : 'var(--border)'}`, color: s.tipoAntecipacao === 'cheia' ? '#3b82f6' : 'var(--muted-color)' }}>Cheia</button>}
        </div>
      </div>
    </div>
  )
}

const SecaoTitulo = ({ n, children, extra }: { n: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) => (
  <div className="mb-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: 26, height: 26, border: '1.5px solid rgba(212,175,55,0.6)', background: 'rgba(212,175,55,0.10)', color: 'var(--accent)', fontSize: 13 }}>{n}</span>
        <h3 className="font-semibold uppercase" style={{ letterSpacing: '2px', fontSize: 14, color: 'var(--text)' }}>{children}</h3>
      </div>
      {extra}
    </div>
    <div className="mt-3" style={{ borderTop: '1px solid var(--border)' }} />
  </div>
)

const cardStyle = { background: 'rgba(17,18,22,0.92)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' } as const
const avisoEmbracon = (
  <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
    <AlertTriangle size={15} style={{ color: '#f59e0b', marginTop: 1 }} />
    <p className="text-xs" style={{ color: '#f59e0b' }}>Se a venda for gerada em menos meses no sistema da Embracon, o valor das parcelas pode mudar. Confira a proposta final.</p>
  </div>
)

// ══════════════════════════════════════════════════════════════
// Gerador de proposta em PDF — compartilhado pelas duas abas.
// Recebe a instância de simulação + logo/nome da empresa.
// ══════════════════════════════════════════════════════════════
function gerarPropostaPDF(s: Sim, logoBase64: string | null, empresaNome: string) {
  const {
    faixa, planoAtual, nomeCliente, lanceNum, creditoLiquido, prazoRestante, prazoPlano,
    p1PropostaSemSeg, pdPropostaSemSeg, entradaPropostaSemSeg, nParcelasEntrada, ehParcelinha,
    labelPorTipo, tipoParcela,
  } = s
  {
    if (!faixa || !planoAtual) return
    const doc = new jsPDF()
    doc.setLanguage('pt-BR')
    const RED: [number,number,number] = [200, 32, 46]
    const DARK: [number,number,number] = [55, 55, 55]
    const fmt = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    const W = 210

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

    let y = 40
    badge(14, y, 38, 'Cliente'); valor(56, y, nomeCliente || 'Simulação'); y += 10
    badge(14, y, 38, 'Criada em'); valor(56, y, new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})); y += 10
    badge(14, y, 38, 'Interesse'); valor(56, y, planoAtual.bem); y += 14

    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(15)
    doc.text('Detalhes da proposta', W/2, y, { align: 'center' }); y += 10

    const colY = y
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

    const segMensal = Math.round(faixa.credito * (planoAtual.seguro_pct || 0) * 100) / 100
    const p12PropostaSemSeg = p1PropostaSemSeg
    const p12PropostaComSeg = p1PropostaSemSeg + segMensal
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

    let y3 = y2 + (ehParcelinha ? 62 : 52)
    caixaSombra(14, y3, 88, (ehParcelinha ? 44 : 34))
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(10)
    doc.text('Investimento sem seguro', 14 + 44, y3 + 8, { align: 'center' })
    let sy = y3 + 14
    badge(18, sy, 38, '1º pagamento'); valor(60, sy, fmt(primeiroPagamentoSem)); sy += 10
    if (ehParcelinha) { badge(18, sy, 38, '1ª à 12ª'); valor(60, sy, fmt(p12PropostaSemSeg)); sy += 10 }
    badge(18, sy, 38, 'Demais parcelas'); valor(60, sy, fmt(pdPropostaSemSeg))

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
}

// ══════════════════════════════════════════════════════════════
// 🏆 GRUPO EM DESTAQUE — componente compartilhado (Simulador + Atendimento)
// Campeão = maior total_contemplados no último resultado disponível da faixa
// ══════════════════════════════════════════════════════════════
function GrupoDestaque({ bem, credito, variant }: { bem?: string; credito?: number; variant: 'simulador' | 'atendimento' }) {
  const [destaque, setDestaque] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [extLoading, setExtLoading] = useState(false)
  const [expandido, setExpandido] = useState(false)
  const podeCarregar = !!bem && !!credito

  const carregar = async () => {
    if (!podeCarregar) return
    setLoading(true)
    try {
      const r = await fetch(`/api/simulador/grupo-destaque?bem=${encodeURIComponent(bem!)}&credito=${credito}`)
      setDestaque(await r.json())
    } catch { setDestaque({ encontrado: false }) }
    setLoading(false)
  }

  // reativo: nova faixa/categoria → recalcula o campeão na hora (simulador auto; atendimento sob demanda)
  useEffect(() => {
    setDestaque(null)
    if (variant === 'simulador') { if (podeCarregar) carregar() }
    else setExpandido(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bem, credito])

  const toggle = () => {
    const abrir = !expandido
    setExpandido(abrir)
    if (abrir && !destaque && !loading) carregar()
  }
  const abrirExtrato = async () => {
    if (!destaque?.grupo) return
    setExtLoading(true)
    try {
      const r = await fetch(`/api/assembleias/extrato/download?grupo=${encodeURIComponent(destaque.grupo)}`)
      const d = await r.json()
      if (d.url) window.open(d.url, '_blank')
    } catch {}
    setExtLoading(false)
  }
  const fmtData = (iso: string | null) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const corpo = loading ? (
    <div className="flex items-center justify-center py-4"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
  ) : !destaque?.encontrado ? (
    <p className="text-sm text-center" style={{ color: 'var(--muted-color)' }}>Nenhum grupo mapeado para esta faixa no momento.</p>
  ) : (
    <>
      <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>GRUPO {destaque.grupo} · {destaque.faixa_credito}</p>
      {destaque.ultima_assembleia ? (
        <>
          <p className="text-sm mt-2" style={{ color: 'var(--text)' }}>
            Última assembleia ({destaque.ultima_assembleia.label}): <span className="font-semibold">{destaque.ultima_assembleia.total_contemplados} contemplações</span>
          </p>
          <ul className="mt-1 space-y-0.5">
            <li className="text-sm" style={{ color: 'var(--muted-color)' }}>🎲 {destaque.ultima_assembleia.sorteio_qt} por sorteio</li>
            <li className="text-sm" style={{ color: 'var(--muted-color)' }}>💎 {destaque.ultima_assembleia.lance_fixo_50_qt} por lance fixo</li>
            <li className="text-sm" style={{ color: 'var(--muted-color)' }}>💎 {destaque.ultima_assembleia.lance_fixo_25_qt} por lance fixo embutido</li>
          </ul>
        </>
      ) : (
        <p className="text-sm mt-2" style={{ color: 'var(--muted-color)' }}>Sem histórico de assembleia registrado para este grupo.</p>
      )}
      <p className="text-sm mt-1" style={{ color: 'var(--text)' }}>Próxima assembleia: <span className="font-semibold">{fmtData(destaque.proxima_assembleia)}</span></p>
      {destaque.tem_extrato && (
        <button onClick={abrirExtrato} disabled={extLoading} className="mt-3 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)', color: 'var(--accent)' }}>
          {extLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}📊 Ver último resultado
        </button>
      )}
      <div className="flex items-start gap-2 rounded-lg p-3 mt-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <AlertTriangle size={14} style={{ color: '#f59e0b', marginTop: 1 }} />
        <p className="text-xs" style={{ color: '#f59e0b' }}>Grupo sujeito a disponibilidade — a adesão pode ocorrer em grupo similar da mesma faixa.</p>
      </div>
    </>
  )

  // seção própria no Simulador (cabeçalho padrão badge + título)
  if (variant === 'simulador') {
    return (
      <div className="rounded-xl p-5" style={cardStyle}>
        <SecaoTitulo n={<Trophy size={13} />}>Grupo em destaque</SecaoTitulo>
        {corpo}
      </div>
    )
  }

  // toggle colapsável no Atendimento
  return (
    <div className="mt-8 mx-auto max-w-xl">
      <button onClick={toggle} className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--accent)' }}>
        <Trophy size={16} />Grupo em destaque desta faixa
        <ChevronDown size={16} className="transition-transform" style={{ transform: expandido ? 'rotate(180deg)' : 'none' }} />
      </button>
      {expandido && (
        <div className="mt-3 rounded-2xl p-5 text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.25)' }}>
          {corpo}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ABA SIMULADOR — 4 seções + barra de proposta sticky
// ══════════════════════════════════════════════════════════════
function SimuladorTab({ planos, empresaNome, logoBase64 }: { planos: Plano[]; empresaNome: string; logoBase64: string | null }) {
  const s = useSimulacao(planos)
  const {
    faixa, qtd, planoAtual, prazoPlano, comSeguro, seguroPct, seguroMensal, verCheia, setVerCheia,
    red25Pct, cheiaInc, demais25, primeira25, demaisCheia, primeiraCheia, p1, pd, ehParcelinha,
    pdParc25, p1Parc25, pdParcCheia, p1ParcCheia, labelPorTipo, tipoParcela, tipoAntecipacao,
    entradaProposta, limiteEstorno, totalNaoEstornar, lanceNum, prazoRestante, creditoLiquido,
    nomeAmigavel, nomeCliente, setNomeCliente, lanceEmbutido, setLanceEmbutido, p1Proposta, pdProposta, p1Antecip, pdAntecip,
  } = s

  const gerarPDF = () => gerarPropostaPDF(s, logoBase64, empresaNome)

  return (
    <div className="space-y-5 pb-40">
      {/* 1️⃣ MONTAGEM */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <SecaoTitulo n="1" extra={
          <button onClick={s.limpar} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted-color)' }}>
            <RotateCcw size={12} />Limpar
          </button>
        }>Simule</SecaoTitulo>
        <GridMontagem s={s} />
      </div>

      {/* 2️⃣ CONDIÇÕES */}
      {faixa && (
        <div className="rounded-xl p-5" style={cardStyle}>
          <SecaoTitulo n="2">Condições</SecaoTitulo>
          <div className="space-y-3">
            <SeletoresTipoParcela s={s} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Parcelas a antecipar</label>
                <input type="number" min="0" value={s.qtdAntecipar} onChange={(e) => s.setQtdAntecipar(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Lance embutido (opcional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted-color)' }}>R$</span>
                  <input value={lanceEmbutido} onChange={e => setLanceEmbutido(formatarMoeda(e.target.value))} placeholder="0" inputMode="numeric" className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none" style={inputStyle} />
                </div>
              </div>
            </div>
            {seguroPct > 0 && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Seguro prestamista</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => s.setComSeguro(false)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors" style={{ background: !comSeguro ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${!comSeguro ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.12)'}`, color: !comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>Sem seguro</button>
                  <button onClick={() => s.setComSeguro(true)} className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors" style={{ background: comSeguro ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${comSeguro ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.12)'}`, color: comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>Com seguro</button>
                </div>
                {comSeguro && seguroMensal > 0 && <p className="text-[11px] mt-2" style={{ color: 'var(--muted-color)' }}>Seguro de R$ {seguroMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês incluído em cada parcela.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3️⃣ RESULTADO (visão interna) */}
      {faixa && (
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <SecaoTitulo n="3">Resultado</SecaoTitulo>
          <div className="flex items-center gap-3 mb-4"><CreditCard size={18} style={{ color: '#3b82f6' }} /><h3 className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Quanto o cliente paga</h3></div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs" style={{ color: 'var(--accent)' }}>{ehParcelinha ? 'Parcela (1ª a 12ª)' : '1ª parcela'} · {labelPorTipo(tipoParcela)}</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(p1Proposta)}</p></div>
            <div><p className="text-xs" style={{ color: 'var(--accent)' }}>Demais (cada) · {labelPorTipo(tipoParcela)}</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(pdProposta)}</p></div>
            <div><p className="text-xs" style={{ color: '#60a5fa' }}>+ {qtd} antecipadas · {labelPorTipo(tipoAntecipacao)}</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda((ehParcelinha ? p1Antecip : pdAntecip) * qtd)}</p></div>
            {!ehParcelinha && <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Total p/ não estornar{limiteEstorno > 0 ? ` (1ª + ${limiteEstorno - 1})` : ''} · {labelPorTipo(tipoParcela)}</p><p className="text-lg font-semibold" style={{ color: '#f59e0b' }}>{fmtMoeda(totalNaoEstornar)}</p></div>}
            <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Crédito líquido{lanceNum > 0 ? ' (após lance)' : ''}</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(creditoLiquido)}</p></div>
            {seguroMensal > 0 && <div><p className="text-xs" style={{ color: 'var(--muted-color)' }}>Seguro / mês</p><p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{fmtMoeda(seguroMensal)}</p></div>}
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: '#60a5fa' }}>Entrada total · 1ª + {qtd} antecipadas · {labelPorTipo(tipoAntecipacao)}</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(entradaProposta)}</p>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted-color)' }}>Prazo: {prazoPlano} meses {planoAtual?.tx_adm_topo ? `· Taxa adm. total: ${planoAtual.tx_adm_topo}%` : ''}</p>
          {(red25Pct > 0 || cheiaInc > 0 || ehParcelinha) && (
            <button onClick={() => setVerCheia(v => !v)} className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors w-full ${verCheia ? '' : 'animate-pulse'}`} style={{
              background: verCheia ? 'rgba(212,175,55,0.18)' : 'linear-gradient(135deg, rgba(200,32,46,0.85), rgba(160,20,34,0.85))',
              border: `1px solid ${verCheia ? 'rgba(212,175,55,0.5)' : 'rgba(255,120,130,0.5)'}`,
              color: verCheia ? 'var(--accent)' : '#fff',
              boxShadow: verCheia ? 'none' : '0 4px 16px rgba(200,32,46,0.35)',
            }}>
              {verCheia ? 'Ocultar outras reduções' : '🔥 Ver 25% e parcela cheia'}
            </button>
          )}
          {verCheia && (
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

      {/* 🏆 GRUPO EM DESTAQUE (mesma seção do Atendimento) */}
      {faixa && <GrupoDestaque bem={planoAtual?.bem} credito={faixa.credito} variant="simulador" />}

      {planoAtual?.bem === 'Imóvel' && faixa && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.35)' }}>
          <p className="text-sm font-medium text-center" style={{ color: 'var(--accent)' }}>
            😮 Dica de venda: nos planos de imóvel, vendendo com 2% de adesão em vez de 1%, a taxa de administração total cai de 26% para 22%! Melhor pro cliente e mais comissão pra você.
          </p>
        </div>
      )}

      {faixa && avisoEmbracon}

      {/* 4️⃣ BARRA DE PROPOSTA (sticky) */}
      {faixa && (
        <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-4 lg:-mx-8 lg:px-8" style={{ background: 'linear-gradient(to top, rgba(10,11,14,0.98) 70%, rgba(10,11,14,0))' }}>
          {/* Resumo-frase: reflete exatamente as escolhas da seção 2 */}
          <p className="text-[11px] mb-2 text-pretty" style={{ color: 'var(--muted-color)' }}>
            <span style={{ color: 'var(--text)' }}>{nomeAmigavel}</span> · {fmtMoeda(faixa.credito)} · parcela {labelPorTipo(tipoParcela)} · entrada {labelPorTipo(tipoAntecipacao)} · primeiro pagamento total de <span style={{ color: 'var(--accent)' }}>{fmtMoeda(entradaProposta)}</span> + {prazoRestante}× de {fmtMoeda(pdProposta)}
          </p>
          <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: 'rgba(17,18,22,0.95)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 -4px 24px rgba(0,0,0,0.4)' }}>
            <span className="flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: 26, height: 26, border: '1.5px solid rgba(212,175,55,0.6)', background: 'rgba(212,175,55,0.10)', color: 'var(--accent)', fontSize: 13 }}>4</span>
            <input value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome do cliente" className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            <button onClick={gerarPDF} className="rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', border: '1px solid rgba(212,175,55,0.6)', color: '#0a0a0a', boxShadow: '0 8px 24px rgba(212,175,55,0.25)' }}>
              <FileText size={15} />Gerar Proposta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ABA ATENDIMENTO — estado próprio + apresentação pro cliente
// ══════════════════════════════════════════════════════════════
function AtendimentoTab({ planos, empresaNome, empresaLogo, logoBase64, ativo, onSair }: { planos: Plano[]; empresaNome: string; empresaLogo: string | null; logoBase64: string | null; ativo: boolean; onSair: () => void }) {
  const s = useSimulacao(planos)
  const { faixa, qtd, planoAtual, lanceNum, creditoLiquido, ehParcelinha, pdProposta, entradaProposta, prazoRestante, nomeAmigavel, red25Pct, cheiaInc, tipoParcela } = s

  const scrollRef = useRef<HTMLDivElement>(null)
  const lanceRef = useRef<HTMLDivElement>(null)

  // 💎 lance embutido: menu com 10/15/20/25% do crédito · valor livre
  const [lanceModo, setLanceModo] = useState<'none' | '10' | '15' | '20' | '25' | 'livre'>('none')
  const [lanceMenu, setLanceMenu] = useState(false)
  // 👁 entrada total oculta por padrão (revela sob comando do vendedor)
  const [entradaVisivel, setEntradaVisivel] = useState(false)

  // ESC fecha o menu de lance (se aberto) ou sai da tela cheia; trava o scroll do body
  useEffect(() => {
    if (!ativo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (lanceMenu) setLanceMenu(false); else onSair() } }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [ativo, onSair, lanceMenu])

  // fecha o menu de lance ao clicar fora
  useEffect(() => {
    if (!lanceMenu) return
    const onDown = (e: MouseEvent) => { if (lanceRef.current && !lanceRef.current.contains(e.target as Node)) setLanceMenu(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [lanceMenu])

  useEffect(() => {
    if (lanceModo === 'none') { if (s.lanceEmbutido) s.setLanceEmbutido(''); return }
    if (lanceModo === 'livre') return
    if (faixa) s.setLanceEmbutido(formatarMoeda(String(Math.round(faixa.credito * (parseInt(lanceModo) / 100)))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanceModo, faixa?.credito])

  const aplicarLance = (m: typeof lanceModo) => { setLanceModo(m); if (m !== 'livre') setLanceMenu(false) }
  const removerLance = () => { setLanceModo('none'); setLanceMenu(false) }
  const limparTudo = () => { s.limpar(); setLanceModo('none'); setLanceMenu(false); setEntradaVisivel(false) }
  const scrollTopo = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

  // ao trocar de crédito/plano é uma nova simulação: re-oculta a entrada
  useEffect(() => { setEntradaVisivel(false) }, [faixa?.credito, planoAtual?.sigla])

  // moeda compacta (sem centavos) p/ caber no botão de lance
  const fmtCompacto = (v: number) => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR')
  const labelChip = (t: string) => t === 'cheia' ? 'Cheia' : t === 'red25' ? 'Reduzida 25%' : 'Reduzida 50%'

  // opções de tipo de parcela disponíveis para este plano
  const tiposParcela: { v: 'red50' | 'red25' | 'cheia'; label: string }[] = [{ v: 'red50', label: '50%' }]
  if (red25Pct > 0 || ehParcelinha) tiposParcela.push({ v: 'red25', label: '25%' })
  if (cheiaInc > 0 || ehParcelinha) tiposParcela.push({ v: 'cheia', label: 'Cheia' })

  const pillWrap = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' } as const
  const pillSelect = 'bg-transparent text-sm font-medium outline-none cursor-pointer'

  return (
    <div ref={scrollRef} className={ativo ? 'fixed inset-0 z-[120] overflow-y-auto' : 'hidden'} style={{ background: 'radial-gradient(1100px 700px at 50% -8%, #16171d 0%, #0b0c10 55%, #08090c 100%)' }}>
      {/* Sair da tela cheia (discreto) — ESC também sai */}
      <button onClick={onSair} aria-label="Sair da apresentação" className="fixed top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--muted-color)' }}>
        <X size={16} />
      </button>

      <div className="mx-auto w-full max-w-5xl px-5 pt-6 pb-32 sm:px-8">
      {/* PILLS DO VENDEDOR (discretas, sem lance) */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* categoria */}
        <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5" style={pillWrap}>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Tipo</span>
          <select value={s.categoria} onChange={(e) => { s.setCategoria(e.target.value); s.setPlanoSigla(''); s.setFaixas([]) }} className={pillSelect} style={{ color: 'var(--text)' }}>
            <option value="" style={{ background: '#131313' }}>selecione</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k} style={{ background: '#131313' }}>{v.label}</option>)}
          </select>
        </div>
        {/* plano — só nome amigável, nunca sigla */}
        <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5" style={pillWrap}>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Plano</span>
          <select value={s.planoSigla} onChange={(e) => s.setPlanoSigla(e.target.value)} disabled={!s.planosDaCategoria.length} className={`${pillSelect} disabled:opacity-40`} style={{ color: 'var(--text)' }}>
            <option value="" style={{ background: '#131313' }}>selecione</option>
            {s.planosDaCategoria.map(p => <option key={p.id} value={p.sigla} style={{ background: '#131313' }}>{p.nome_completo}</option>)}
          </select>
        </div>
        {/* crédito */}
        <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5" style={pillWrap}>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Crédito</span>
          <select value={s.creditoSel} onChange={(e) => s.setCreditoSel(e.target.value)} disabled={!s.faixas.length} className={`${pillSelect} disabled:opacity-40`} style={{ color: 'var(--text)' }}>
            <option value="" style={{ background: '#131313' }}>selecione</option>
            {s.faixas.map(f => <option key={f.credito} value={String(f.credito)} style={{ background: '#131313' }}>{fmtMoeda(f.credito)}</option>)}
          </select>
        </div>
        {/* tipo de parcela — comanda PARCELAS e ENTRADA juntas */}
        {faixa && tiposParcela.length > 1 && (
          <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5" style={pillWrap}>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Parcela</span>
            <select value={tipoParcela} onChange={(e) => { const v = e.target.value as any; s.setTipoParcela(v); s.setTipoAntecipacao(v) }} className={pillSelect} style={{ color: 'var(--accent)' }}>
              {tiposParcela.map(t => <option key={t.v} value={t.v} style={{ background: '#131313' }}>{t.label}</option>)}
            </select>
          </div>
        )}
        {/* Carência (controle da antecipação, rótulo neutro) */}
        {faixa && (
          <div className="flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5" style={pillWrap}>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-color)' }}>Carência</span>
            <select value={s.qtdAntecipar} onChange={(e) => s.setQtdAntecipar(e.target.value)} className={pillSelect} style={{ color: 'var(--text)' }}>
              {Array.from({ length: 13 }, (_, i) => <option key={i} value={String(i)} style={{ background: '#131313' }}>{i}</option>)}
            </select>
          </div>
        )}
        {/* 🛡 seguro (recalcula parcelas e entrada) */}
        {faixa && s.seguroPct > 0 && (
          <button onClick={() => s.setComSeguro(!s.comSeguro)} className="flex items-center gap-1.5 rounded-full pl-3 pr-3 py-1.5 text-sm font-medium" style={{ background: s.comSeguro ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.comSeguro ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`, color: s.comSeguro ? 'var(--accent)' : 'var(--muted-color)' }}>
            <Shield size={13} />{s.comSeguro ? 'Com seguro' : 'Sem seguro'}
          </button>
        )}
        {/* limpar */}
        {(s.categoria || faixa) && (
          <button onClick={limparTudo} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted-color)' }}>
            <RotateCcw size={12} />Limpar
          </button>
        )}
      </div>

      {/* PALCO — virado pro cliente */}
      <div>
        {!faixa ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 px-6 text-center">
            <MonitorPlay size={34} style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--muted-color)' }}>Escolha o plano e o crédito acima para apresentar ao cliente.</p>
          </div>
        ) : (
          <div>
            {/* logo da empresa */}
            <div className="flex items-center justify-center mb-8">
              {empresaLogo ? (
                <img src={empresaLogo || "/placeholder.svg"} alt={empresaNome || 'Empresa'} className="h-16 w-auto object-contain" crossOrigin="anonymous" />
              ) : (
                <p className="text-lg font-bold tracking-wide" style={{ color: 'var(--accent)' }}>{empresaNome || 'LR MULTIMARCAS'}</p>
              )}
            </div>

            {/* crédito gigante + alterar + linha bem·plano */}
            <div className="text-center">
              <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--muted-color)' }}>Seu crédito de</p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <p className="font-bold leading-none" style={{ color: 'var(--accent)', fontSize: 'clamp(52px, 9vw, 88px)' }}>{fmtMoeda(faixa.credito)}</p>
                <button onClick={scrollTopo} title="Alterar simulação" className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted-color)' }}>
                  <Pencil size={11} />alterar
                </button>
              </div>
              <p className="text-base mt-3" style={{ color: 'var(--text)' }}>{planoAtual?.bem} · {nomeAmigavel}</p>
            </div>

            {/* 💎 botão de lance embutido (abaixo do crédito) */}
            <div ref={lanceRef} className="flex justify-center mt-5 relative">
              <button onClick={() => setLanceMenu(v => !v)} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold max-w-full" style={{ background: lanceNum > 0 ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${lanceNum > 0 ? 'rgba(212,175,55,0.5)' : 'var(--border)'}`, color: lanceNum > 0 ? 'var(--accent)' : 'var(--muted-color)' }}>
                {lanceNum > 0 ? <><span className="shrink-0">💎 Lance:</span><span className="truncate">{fmtCompacto(lanceNum)}</span><Pencil size={13} className="shrink-0" /></> : <><Plus size={15} />💎 Adicionar lance embutido</>}
              </button>
              {lanceMenu && (
                <div className="absolute top-full mt-2 z-20 rounded-xl p-2 w-64 max-w-[90vw]" style={{ background: '#131418', border: '1px solid rgba(212,175,55,0.3)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {(['10', '15', '20', '25'] as const).map(p => (
                      <button key={p} onClick={() => aplicarLance(p)} className="rounded-lg py-2 text-xs font-semibold" style={{ background: lanceModo === p ? 'rgba(212,175,55,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${lanceModo === p ? 'var(--accent)' : 'var(--border)'}`, color: lanceModo === p ? 'var(--accent)' : 'var(--text)' }}>{p}%</button>
                    ))}
                  </div>
                  <button onClick={() => setLanceModo('livre')} className="w-full rounded-lg py-2 text-xs font-semibold mb-2" style={{ background: lanceModo === 'livre' ? 'rgba(212,175,55,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${lanceModo === 'livre' ? 'var(--accent)' : 'var(--border)'}`, color: lanceModo === 'livre' ? 'var(--accent)' : 'var(--text)' }}>Valor livre</button>
                  {lanceModo === 'livre' && (
                    <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 mb-2 w-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                      <span className="text-xs shrink-0" style={{ color: 'var(--muted-color)' }}>R$</span>
                      <input autoFocus value={s.lanceEmbutido} onChange={e => s.setLanceEmbutido(formatarMoeda(e.target.value))} placeholder="0" inputMode="numeric" className="flex-1 min-w-0 w-full bg-transparent text-sm font-medium outline-none" style={{ color: 'var(--accent)' }} />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setLanceMenu(false)} className="flex-1 rounded-lg py-2 text-xs font-semibold" style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', color: '#0a0a0a' }}>Aplicar</button>
                    {lanceNum > 0 && <button onClick={removerLance} className="flex-1 rounded-lg py-2 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted-color)' }}>Remover lance</button>}
                  </div>
                </div>
              )}
            </div>

            {lanceNum <= 0 ? (
              /* SEM lance: 2 cards grandes */
              <div className="grid gap-4 mt-8 sm:grid-cols-2 max-w-3xl mx-auto">
                <div className="rounded-2xl px-6 py-9 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--muted-color)' }}>Parcelas de</p>
                  <p className="text-4xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(pdProposta)}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted-color)' }}>por mês</p>
                </div>
                <div className="rounded-2xl px-6 py-9 text-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>Entrada total</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-4xl font-bold transition-opacity duration-300" style={{ color: 'var(--accent)', opacity: entradaVisivel ? 1 : 0.85 }}>{entradaVisivel ? fmtMoeda(entradaProposta) : 'R$ ••••••'}</p>
                    <button onClick={() => setEntradaVisivel(v => !v)} aria-label={entradaVisivel ? 'Ocultar entrada' : 'Mostrar entrada'} className="shrink-0" style={{ color: 'var(--accent)' }}>{entradaVisivel ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                  </div>
                </div>
              </div>
            ) : (
              /* COM lance embutido: 4 cards */
              <div className="grid gap-4 mt-8 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl px-6 py-7 text-center" style={{ background: 'rgba(212,175,55,0.16)', border: '1px solid rgba(212,175,55,0.5)' }}>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>💰 Crédito líquido</p>
                  <p className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(creditoLiquido)}</p>
                </div>
                <div className="rounded-2xl px-6 py-7 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,175,55,0.25)' }}>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>💎 Lance embutido</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(lanceNum)}</p>
                  <p className="text-[11px] mt-1 text-pretty" style={{ color: 'var(--muted-color)' }}>sai do próprio crédito, sem desembolso</p>
                </div>
                <div className="rounded-2xl px-6 py-7 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--muted-color)' }}>Parcelas de</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmtMoeda(pdProposta)}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted-color)' }}>por mês</p>
                </div>
                <div className="rounded-2xl px-6 py-7 text-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>Entrada total</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-2xl font-bold transition-opacity duration-300" style={{ color: 'var(--accent)', opacity: entradaVisivel ? 1 : 0.85 }}>{entradaVisivel ? fmtMoeda(entradaProposta) : 'R$ ••••••'}</p>
                    <button onClick={() => setEntradaVisivel(v => !v)} aria-label={entradaVisivel ? 'Ocultar entrada' : 'Mostrar entrada'} className="shrink-0" style={{ color: 'var(--accent)' }}>{entradaVisivel ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Frase da venda */}
            <p className="text-center text-base mt-8 text-pretty" style={{ color: 'var(--text)' }}>
              {lanceNum > 0
                ? <>Com <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(lanceNum)}</span> de lance embutido, você conquista <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(faixa.credito)}</span> e recebe <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(creditoLiquido)}</span> líquidos</>
                : <>Entrada total de <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(entradaProposta)}</span> e parcelas de <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(pdProposta)}</span> para conquistar <span className="font-bold" style={{ color: 'var(--accent)' }}>{fmtMoeda(faixa.credito)}</span></>}
            </p>
            <p className="text-center text-xs mt-2" style={{ color: 'var(--muted-color)' }}>Prazo de {prazoRestante} meses</p>

            {/* 🏆 Grupo em destaque desta faixa (componente compartilhado) */}
            <GrupoDestaque bem={planoAtual?.bem} credito={faixa.credito} variant="atendimento" />
          </div>
        )}
      </div>
      </div>

      {/* ═ PROPOSTA (rodapé fixo) ═ */}
      {faixa && (
        <div className="fixed bottom-0 inset-x-0 z-10" style={{ background: 'linear-gradient(to top, #08090c 72%, rgba(8,9,12,0))' }}>
          <div className="mx-auto w-full max-w-5xl px-5 pt-6 pb-4 sm:px-8">
            <div className="rounded-xl p-3 flex flex-col lg:flex-row lg:items-center gap-3" style={{ background: 'rgba(17,18,22,0.96)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 -4px 24px rgba(0,0,0,0.4)' }}>
              {/* chips: o que vai no PDF (pré-selecionado; o vendedor pode divergir) */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide w-16 shrink-0" style={{ color: 'var(--muted-color)' }}>Parcela</span>
                  {tiposParcela.map(t => {
                    const on = tipoParcela === t.v
                    return <button key={t.v} onClick={() => s.setTipoParcela(t.v)} className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: on ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--muted-color)' }}>{labelChip(t.v)}</button>
                  })}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide w-16 shrink-0" style={{ color: 'var(--muted-color)' }}>Entrada</span>
                  {tiposParcela.map(t => {
                    const on = s.tipoAntecipacao === t.v
                    return <button key={t.v} onClick={() => s.setTipoAntecipacao(t.v)} className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: on ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? '#3b82f6' : 'var(--border)'}`, color: on ? '#60a5fa' : 'var(--muted-color)' }}>{labelChip(t.v)}</button>
                  })}
                </div>
              </div>
              <input value={s.nomeCliente} onChange={e => s.setNomeCliente(e.target.value)} placeholder="Nome do cliente" className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
              <button onClick={() => gerarPropostaPDF(s, logoBase64, empresaNome)} className="rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', border: '1px solid rgba(212,175,55,0.6)', color: '#0a0a0a', boxShadow: '0 8px 24px rgba(212,175,55,0.25)' }}>
                <FileText size={15} />Gerar Proposta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SimuladorPage() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<'simulador' | 'atendimento'>('simulador')
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
      carregarLogo(d.logo_url || '/logo-lr.png')
    }).catch(() => carregarLogo('/logo-lr.png'))
  }, [])

  const abas: { id: typeof modo; label: string; icon: typeof Calculator }[] = [
    { id: 'simulador', label: '🧮 Simulador', icon: Calculator },
    { id: 'atendimento', label: '🎥 Atendimento', icon: MonitorPlay },
  ]

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Simulador" />
        <main className="mx-auto max-w-3xl px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.25)' }}><Calculator size={18} style={{ color: 'var(--accent)' }} /></div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Simulador de Venda</h2>
              <p className="text-xs" style={{ color: 'var(--muted-color)' }}>Simule internamente ou apresente ao cliente</p>
            </div>
          </div>

          {/* Abas (estados independentes) */}
          <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: 'rgba(17,18,22,0.6)', border: '1px solid var(--border)' }}>
            {abas.map(a => {
              const ativo = modo === a.id
              return (
                <button key={a.id} onClick={() => setModo(a.id)} className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors" style={{ background: ativo ? 'rgba(212,175,55,0.18)' : 'transparent', border: `1px solid ${ativo ? 'rgba(212,175,55,0.5)' : 'transparent'}`, color: ativo ? 'var(--accent)' : 'var(--muted-color)' }}>
                  {a.label}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <SimuladorTab planos={planos} empresaNome={empresaNome} logoBase64={logoBase64} />
          )}
        </main>
      </div>

      {/* Atendimento: sempre montado (preserva a simulação) — vira tela cheia quando ativo */}
      {!loading && (
        <AtendimentoTab planos={planos} empresaNome={empresaNome} empresaLogo={empresaLogo} logoBase64={logoBase64} ativo={modo === 'atendimento'} onSair={() => setModo('simulador')} />
      )}
    </div>
  )
}
