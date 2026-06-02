'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { Upload, FileText, Check, Loader2, AlertTriangle, PartyPopper, Plus } from 'lucide-react'

interface Plano { id: string; sigla: string; nome_completo: string; bem: string; adesao_percent: number }
interface Opcao { id: string; nome: string; empresa_id?: string; equipe_id?: string }

export default function NovaVendaPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [planos, setPlanos] = useState<Plano[]>([])
  const [etapa, setEtapa] = useState<'upload' | 'revisar' | 'sucesso'>('upload')
  const [parsing, setParsing] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [avisoParser, setAvisoParser] = useState('')
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [pdfNome, setPdfNome] = useState<string | null>(null)
  const [meuRole, setMeuRole] = useState('')
  const [isMatriz, setIsMatriz] = useState(false)
  const [empresas, setEmpresas] = useState<Opcao[]>([])
  const [equipes, setEquipes] = useState<Opcao[]>([])
  const [vendedores, setVendedores] = useState<Opcao[]>([])
  const [empresaSel, setEmpresaSel] = useState('')
  const [equipeSel, setEquipeSel] = useState('')
  const [vendedorSel, setVendedorSel] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [numeroProposta, setNumeroProposta] = useState('')
  const [numeroContrato, setNumeroContrato] = useState('')
  const [grupo, setGrupo] = useState('')
  const [cota, setCota] = useState('')
  const [valorCredito, setValorCredito] = useState('')
  const [valorPrimeiraParcela, setValorPrimeiraParcela] = useState('')
  const [valorDemaisParcelas, setValorDemaisParcelas] = useState('')
  const [adesaoPercent, setAdesaoPercent] = useState('')
  const [planoId, setPlanoId] = useState('')
  const [qtdParcelas, setQtdParcelas] = useState('0')
  const [observacoes, setObservacoes] = useState('')
  const [dataAssembleia, setDataAssembleia] = useState('')
  const [dataVenda, setDataVenda] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [calendarioGrupo, setCalendarioGrupo] = useState<any[]>([])
  const [proximaCobranca, setProximaCobranca] = useState('')
  const [grupoEncontrado, setGrupoEncontrado] = useState<boolean | null>(null)
  const [buscandoGrupo, setBuscandoGrupo] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: pl } = await supabase.from('planos').select('id, sigla, nome_completo, bem, adesao_percent').eq('ativo', true).order('bem')
      if (pl) setPlanos(pl as Plano[])
      try {
        const res = await fetch('/api/vendas/opcoes')
        const op = await res.json()
        if (op.meu_role) { setMeuRole(op.meu_role); setIsMatriz(op.is_matriz); setEmpresas(op.empresas || []); setEquipes(op.equipes || []); setVendedores(op.vendedores || []) }
      } catch {}
    })
  }, [])

  useEffect(() => { setProximaCobranca(calcularProximaCobranca()) }, [dataVencimento, qtdParcelas, calendarioGrupo])

  const valorBoletoCalc = (() => {
    const pd = parseFloat(valorDemaisParcelas.replace(/\./g, '').replace(',', '.')) || 0
    const qtd = parseInt(qtdParcelas) || 0
    return pd * qtd
  })()
  const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  function calcularProximaCobranca() {
    if (!dataVencimento) return ''
    const base = new Date(dataVencimento + 'T00:00:00')
    const qtd = parseInt(qtdParcelas) || 0
    const alvo = new Date(base); alvo.setMonth(alvo.getMonth() + qtd + 1)
    const mesAlvo = alvo.getMonth() + 1
    const anoAlvo = alvo.getFullYear()
    // tenta achar no calendário do grupo pela data (mês certo E ano certo, pra pegar a data já ajustada)
    const noCal = calendarioGrupo.find((c: any) => {
      if (c.mes !== mesAlvo) return false
      // se a linha do calendário tem data_vencimento, confere o ano dela
      if (c.data_vencimento) return new Date(c.data_vencimento + 'T00:00:00').getFullYear() === anoAlvo
      return true
    })
    if (noCal?.data_vencimento) return noCal.data_vencimento
    // fallback: data calculada (sem ajuste do calendário — quando o ano ainda não foi cadastrado)
    return alvo.toISOString().slice(0, 10)
  }

  async function buscarGrupo(g: string) {
    if (!g || g.length < 3) { setGrupoEncontrado(null); return }
    setBuscandoGrupo(true)
    try {
      const res = await fetch(`/api/grupos/${g}`); const data = await res.json()
      if (data.encontrado) { setGrupoEncontrado(true); if (data.proxima_assembleia) setDataAssembleia(data.proxima_assembleia); if (data.proximo_vencimento) setDataVencimento(data.proximo_vencimento); if (data.calendario_ano) setCalendarioGrupo(data.calendario_ano) }
      else { setGrupoEncontrado(false); setCalendarioGrupo([]) }
    } catch { setGrupoEncontrado(null) }
    setBuscandoGrupo(false)
  }

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') { setErro('O arquivo deve ser um PDF'); return }
    setErro(''); setAvisoParser(''); setParsing(true); setPdfNome(file.name)
    const reader = new FileReader(); reader.onload = (e) => setPdfBase64(e.target?.result as string); reader.readAsDataURL(file)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/vendas/parse-pdf', { method: 'POST', body: fd }); const data = await res.json()
      if (data.parse_falhou) setAvisoParser(data.error || 'Não consegui ler o PDF. Preencha manualmente.')
      else if (data.dados) {
        const d = data.dados
        if (d.nome) setNomeCliente(d.nome); if (d.cpf_cnpj) setCpfCnpj(d.cpf_cnpj); if (d.telefone) setTelefone(d.telefone); if (d.email) setEmail(d.email)
        if (d.numero_proposta) setNumeroProposta(d.numero_proposta); if (d.numero_contrato) setNumeroContrato(d.numero_contrato)
        if (d.grupo) { setGrupo(d.grupo); buscarGrupo(d.grupo) }; if (d.cota) setCota(d.cota)
        if (d.valor_credito) setValorCredito(fmtMoeda(d.valor_credito)); if (d.valor_primeira_parcela) setValorPrimeiraParcela(fmtMoeda(d.valor_primeira_parcela))
        if (d.valor_demais_parcelas) setValorDemaisParcelas(fmtMoeda(d.valor_demais_parcelas)); if (d.adesao_calculada) setAdesaoPercent(String(d.adesao_calculada))
        if (d.data_venda) setDataVenda(d.data_venda)
        if (data.plano_detectado) setPlanoId(data.plano_detectado.id)
        const achados = d.campos_encontrados || 0
        if (achados < 5) setAvisoParser(`Consegui ler ${achados} de ${d.campos_totais} campos. Confira e complete.`)
      }
      setEtapa('revisar')
    } catch { setErro('Erro ao processar o PDF') }
    setParsing(false)
  }

  const parseValor = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0

  function limparForm() {
    setNomeCliente(''); setCpfCnpj(''); setTelefone(''); setEmail(''); setNumeroProposta(''); setNumeroContrato(''); setGrupo(''); setCota('')
    setValorCredito(''); setValorPrimeiraParcela(''); setValorDemaisParcelas(''); setAdesaoPercent(''); setPlanoId(''); setQtdParcelas('0'); setObservacoes('')
    setDataAssembleia(''); setDataVencimento(''); setCalendarioGrupo([]); setProximaCobranca(''); setGrupoEncontrado(null); setPdfBase64(null); setPdfNome(''); setErro(''); setAvisoParser('')
    setEmpresaSel(''); setEquipeSel(''); setVendedorSel('')
  }

  async function handleSalvar() {
    if (!nomeCliente.trim() || !valorCredito.trim()) { setErro('Nome do cliente e valor do crédito são obrigatórios'); return }
    if (!planoId) { setErro('⚠️ Selecione o PLANO — sem ele a comissão fica zerada. Confira se o plano foi detectado.'); return }
    setSalvando(true); setErro('')
    try {
      const body: any = {
        nome_cliente: nomeCliente.trim(), cpf_cnpj: cpfCnpj || null, telefone: telefone || null, email: email || null,
        numero_proposta: numeroProposta || null, numero_contrato: numeroContrato || null, grupo: grupo || null, cota: cota || null,
        data_venda: dataVenda || null,
        valor_credito: parseValor(valorCredito), valor_primeira_parcela: parseValor(valorPrimeiraParcela), valor_demais_parcelas: parseValor(valorDemaisParcelas),
        adesao_percent: adesaoPercent ? parseFloat(adesaoPercent) : null, plano_id: planoId || null,
        qtd_parcelas: parseInt(qtdParcelas) || 0, valor_boleto: valorBoletoCalc, pdf_base64: pdfBase64, pdf_nome: pdfNome,
        observacoes: observacoes || null, data_assembleia_entrada: dataAssembleia || null, proxima_cobranca: proximaCobranca || null,
        empresa_id_alvo: empresaSel || null, equipe_id_alvo: equipeSel || null, vendedor_id_alvo: vendedorSel || null,
      }
      if (grupoEncontrado === false && grupo && dataAssembleia) {
        try { await fetch(`/api/grupos/${grupo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bem: planos.find(p => p.id === planoId)?.bem || null, data_assembleia: dataAssembleia, data_vencimento: dataVencimento || null, dia_vencimento: dataVencimento ? new Date(dataVencimento + 'T00:00:00').getDate() : null }) }) } catch {}
      }
      const res = await fetch('/api/vendas/criar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro ao salvar venda'); setSalvando(false); return }
      setEtapa('sucesso')
    } catch { setErro('Erro de conexão') }
    setSalvando(false)
  }

  const inputStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }
  const mostraAtribuicao = ['master', 'representante', 'adm', 'supervisor'].includes(meuRole)
  const equipesFiltradas = isMatriz && empresaSel ? equipes.filter(e => e.empresa_id === empresaSel) : equipes
  const vendedoresFiltrados = vendedores.filter(v => { if (isMatriz && empresaSel && v.empresa_id !== empresaSel) return false; if (equipeSel && v.equipe_id !== equipeSel) return false; return true })

  return (
    <div className="relative min-h-screen font-sans">
      <Sidebar />
      <div className="relative lg:ml-60" style={{ zIndex: 1 }}>
        <Header title="Nova Venda" />
        <main className="mx-auto max-w-3xl px-6 py-8 lg:px-8">
          {etapa === 'upload' && (
            <div className="rounded-xl p-8" style={{ background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)' }}>
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }} className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl cursor-pointer" style={{ border: '2px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                {parsing ? (<><Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent)' }} /><p className="text-sm" style={{ color: 'var(--text2)' }}>Lendo a proposta...</p></>) : (<><div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(212,175,55,0.15)' }}><Upload size={24} style={{ color: 'var(--accent)' }} /></div><p className="text-base font-medium" style={{ color: 'var(--text)' }}>Solte a proposta em PDF aqui</p><p className="text-xs" style={{ color: 'var(--muted-color)' }}>ou clique para selecionar · leitura automática</p></>)}
              </div>
              {erro && <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{erro}</div>}
              <div className="mt-4 text-center"><button onClick={() => setEtapa('revisar')} className="text-xs underline" style={{ color: 'var(--muted-color)' }}>Ou preencher manualmente sem PDF</button></div>
            </div>
          )}
          {etapa === 'sucesso' && (
            <div className="flex flex-col items-center justify-center py-16 gap-5 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="flex h-20 w-20 items-center justify-center rounded-full animate-bounce" style={{ background: 'rgba(34,197,94,0.15)' }}><PartyPopper size={40} style={{ color: '#22c55e' }} /></div>
              <div className="text-center"><h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Parabéns!</h2><p className="text-sm" style={{ color: 'var(--text2)' }}>Venda de <strong>{nomeCliente}</strong> cadastrada com sucesso!</p><p className="text-xs mt-1" style={{ color: 'var(--muted-color)' }}>O boleto entrou como pendente para a administração solicitar.</p></div>
              <div className="flex gap-3 mt-2">
                <button onClick={() => { limparForm(); setEtapa('upload') }} className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}><Plus size={16} />Cadastrar próxima venda</button>
                <button onClick={() => router.push('/clientes')} className="rounded-lg px-5 py-2.5 text-sm transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Ver clientes</button>
              </div>
            </div>
          )}
          {etapa === 'revisar' && (
            <div className="space-y-5">
              {pdfNome && (<div className="flex items-center gap-2 rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}><FileText size={16} style={{ color: '#22c55e' }} /><span className="text-sm" style={{ color: 'var(--text2)' }}>{pdfNome}</span><button onClick={() => { setEtapa('upload'); setPdfNome(null); setPdfBase64(null) }} className="ml-auto text-xs" style={{ color: 'var(--muted-color)' }}>Trocar</button></div>)}
              {avisoParser && (<div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}><AlertTriangle size={16} style={{ color: '#f59e0b', marginTop: 2 }} /><span className="text-sm" style={{ color: '#f59e0b' }}>{avisoParser}</span></div>)}
              {erro && <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{erro}</div>}
              {mostraAtribuicao && (
                <div className="rounded-xl p-5" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: '#a855f7' }}>Atribuir venda</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {isMatriz && (<div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Empresa</label><select value={empresaSel} onChange={(e) => { setEmpresaSel(e.target.value); setEquipeSel(''); setVendedorSel('') }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}><option value="" style={{ background: '#131313' }}>Minha empresa</option>{empresas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}</select></div>)}
                    {['master','representante','adm'].includes(meuRole) && (<div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Equipe</label><select value={equipeSel} onChange={(e) => { setEquipeSel(e.target.value); setVendedorSel('') }} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}><option value="" style={{ background: '#131313' }}>Sem equipe</option>{equipesFiltradas.map(e => <option key={e.id} value={e.id} style={{ background: '#131313' }}>{e.nome}</option>)}</select></div>)}
                    <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Vendedor</label><select value={vendedorSel} onChange={(e) => setVendedorSel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}><option value="" style={{ background: '#131313' }}>Eu mesmo</option>{vendedoresFiltrados.map(v => <option key={v.id} value={v.id} style={{ background: '#131313' }}>{v.nome}</option>)}</select></div>
                  </div>
                </div>
              )}
              <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>Dados do Cliente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2"><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Nome completo *</label><input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>CPF/CNPJ</label><input value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Telefone</label><input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div className="md:col-span-2"><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>Dados da Venda</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Plano</label><select value={planoId} onChange={(e) => setPlanoId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}><option value="" style={{ background: '#131313' }}>Selecione</option>{planos.map((p) => (<option key={p.id} value={p.id} style={{ background: '#131313' }}>{p.sigla} — {p.nome_completo} ({p.adesao_percent}%)</option>))}</select></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Adesão (%)</label><select value={adesaoPercent} onChange={(e) => setAdesaoPercent(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle}><option value="" style={{ background: '#131313' }}>-</option><option value="1" style={{ background: '#131313' }}>1%</option><option value="2" style={{ background: '#131313' }}>2%</option></select></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Nº Proposta</label><input value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Nº Contrato</label><input value={numeroContrato} onChange={(e) => setNumeroContrato(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Grupo</label><input value={grupo} onChange={(e) => setGrupo(e.target.value)} onBlur={(e) => buscarGrupo(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />{buscandoGrupo && <p className="text-xs mt-1" style={{ color: 'var(--muted-color)' }}>Buscando...</p>}{grupoEncontrado === true && <p className="text-xs mt-1" style={{ color: '#22c55e' }}>{'\u2713'} Grupo mapeado</p>}{grupoEncontrado === false && <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>{'\u26a0'} Grupo novo — informe a assembleia</p>}</div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Cota</label><input value={cota} onChange={(e) => setCota(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Valor do Crédito (R$) *</label><input value={valorCredito} onChange={(e) => setValorCredito(e.target.value)} placeholder="110.000,00" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>1ª Parcela (R$)</label><input value={valorPrimeiraParcela} onChange={(e) => setValorPrimeiraParcela(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Demais Parcelas (R$)</label><input value={valorDemaisParcelas} onChange={(e) => setValorDemaisParcelas(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: '#3b82f6' }}>Assembleia e Cobrança</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Assembleia de entrada {grupoEncontrado === false && <span style={{ color: '#ef4444' }}>*</span>}</label><input type="date" value={dataAssembleia} onChange={(e) => setDataAssembleia(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Próxima cobrança</label><div className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>{proximaCobranca ? new Date(proximaCobranca + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--muted-color)' }}>A cobrança segue o vencimento do calendário Embracon. Após as {qtdParcelas || '0'} parcelas, a próxima cai nessa data.</p>
              </div>
              <div className="rounded-xl p-5" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>Boleto Único</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Quantidade de parcelas</label><input type="number" min="0" value={qtdParcelas} onChange={(e) => setQtdParcelas(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Valor do boleto (calculado)</label><div className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--accent)' }}>R$ {fmtMoeda(valorBoletoCalc)}</div></div>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--muted-color)' }}>Opcional. Quantas parcelas o cliente quer adiantar (0 = sem adiantamento). Adesão/1ª parcela é paga só uma vez na proposta.</p>
              </div>
              <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.12)', border: '1px solid var(--border)' }}>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted-color)' }}>Observações</label>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle} />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => router.push('/')} className="rounded-lg px-4 py-2.5 text-sm transition-transform hover:scale-105 active:scale-95" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Cancelar</button>
                <button onClick={handleSalvar} disabled={salvando} className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold disabled:opacity-50 transition-transform hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>{salvando ? <><Loader2 size={16} className="animate-spin" />Salvando...</> : <><Check size={16} />Salvar Venda</>}</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
