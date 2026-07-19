'use client'

import { useState, useRef } from 'react'
import { X, Download, Loader2, Paperclip } from 'lucide-react'
import html2canvas from 'html2canvas'

interface HistMes {
  mes_referencia: string; mes_label: string; numero_assembleia: number | null
  sorteio_qt: number; lance_livre_qt: number; lance_livre_maior: number | null; lance_livre_menor: number | null
  lance_fixo_50_qt: number; lance_fixo_25_qt: number; total_contemplados: number
}

interface Props {
  grupo: string
  bem: string
  mes: HistMes
  onClose: () => void
  // modo travado usado no card "Grupo em Destaque" — esconde os toggles e fixa a configuração
  modoFixo?: 'simulador' | 'atendimento'
  // acesso secundário ao PDF oficial (quando o registro tem arquivo_path)
  onAbrirArquivoOficial?: () => void
}

export default function PassarResultado({ grupo, bem, mes, onClose, modoFixo, onAbrirArquivoOficial }: Props) {
  // configuração inicial: no modo travado, define exatamente o que cada aba mostra
  //  · simulador: fixo 50%/25% separados e COM percentual visível
  //  · atendimento: fixo 50%/25% separados, rótulos SEM percentual ("Lance Fixo" / "Lance Fixo Embutido")
  const [mostrar, setMostrar] = useState({
    total: true,
    sorteio: true,
    fixo50: true,
    fixo25: true,
    livre: true,
    ocultarFixo: false,  // quando true, junta fixo 50% + 25% em "Lance Fixo: total"
    ocultarLivrePct: true, // quando true, esconde o maior/menor % do lance livre (padrão seguro)
  })
  // no modo travado o lance livre nunca exibe %; o fixo mantém % apenas no simulador
  const esconderFixoPct = modoFixo === 'atendimento'
  const [gerando, setGerando] = useState(false)
  const arteRef = useRef<HTMLDivElement>(null)

  const toggle = (k: keyof typeof mostrar) => setMostrar(s => ({ ...s, [k]: !s[k] }))

  const gerarImagem = async () => {
    if (!arteRef.current) return
    setGerando(true)
    try {
      const canvas = await html2canvas(arteRef.current, { scale: 3, backgroundColor: null, useCORS: true })
      const link = document.createElement('a')
      link.download = `assembleia-grupo-${grupo}-${mes.mes_referencia}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      alert('Erro ao gerar imagem. Tente novamente.')
    }
    setGerando(false)
  }

  const fmtPct = (v: number | null) => v == null || v === 0 ? '-' : (v * 100).toFixed(2).replace('.', ',') + '%'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" style={{ background: '#131313', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Passar Resultado — Grupo {grupo}</h3>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--muted-color)' }} /></button>
        </div>

        <div className="p-4">
          {!modoFixo && (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--muted-color)' }}>Escolha o que mostrar ao cliente:</p>
              <div className="flex flex-col gap-2 mb-4">
                {[
                  { k: 'total', label: `Total de contemplados (${mes.total_contemplados})` },
                  { k: 'sorteio', label: `Sorteio (${mes.sorteio_qt})` },
                  { k: 'fixo50', label: `Lance Fixo 50% (${mes.lance_fixo_50_qt})` },
                  { k: 'fixo25', label: `Lance Fixo 25% (${mes.lance_fixo_25_qt})` },
                  { k: 'livre', label: `Lance Livre (${mes.lance_livre_qt})` },
                  { k: 'ocultarFixo', label: `Ocultar % do lance fixo (juntar 50% e 25%)` },
                  { k: 'ocultarLivrePct', label: `Ocultar % do lance livre (maior/menor)` },
                ].map(item => (
                  <label key={item.k} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text2)' }}>
                    <input type="checkbox" checked={mostrar[item.k as keyof typeof mostrar]} onChange={() => toggle(item.k as keyof typeof mostrar)} className="accent-yellow-600" />
                    {item.label}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* PREVIEW DA ARTE (é isso que vira imagem) */}
          <div className="mb-4 flex justify-center">
            <div ref={arteRef} style={{ width: 360, background: 'linear-gradient(160deg, #ffffff 0%, #f5f5f5 100%)', borderRadius: 16, padding: 24, fontFamily: 'system-ui, sans-serif' }}>
              {/* logo embracon */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img src="/logo-embracon.jpg" alt="Embracon" style={{ height: 44, objectFit: 'contain' }} crossOrigin="anonymous" />
              </div>
              {/* título */}
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a' }}>🏆 RESULTADO DA ASSEMBLEIA</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#c91a1a', marginTop: 4 }}>GRUPO {grupo}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{bem} · {mes.mes_label}{mes.numero_assembleia ? ` · ${mes.numero_assembleia}ª assembleia` : ''}</div>
              </div>

              {/* total destaque */}
              {mostrar.total && (
                <div style={{ textAlign: 'center', margin: '16px 0', padding: '12px', background: 'linear-gradient(135deg, #c91a1a 0%, #a01414 100%)', borderRadius: 12 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>🎉 {mes.total_contemplados}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', opacity: 0.9 }}>CONTEMPLADOS</div>
                </div>
              )}

              {/* categorias */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
                {mostrar.sorteio && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                    <span style={{ fontSize: 14, color: '#333' }}>🎲 Sorteio</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#22a043' }}>{mes.sorteio_qt}</span>
                  </div>
                )}
                {mostrar.ocultarFixo ? (
                  (mostrar.fixo50 || mostrar.fixo25) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                      <span style={{ fontSize: 14, color: '#333' }}>🎯 Lance Fixo</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#e8870b' }}>{(mostrar.fixo50 ? mes.lance_fixo_50_qt : 0) + (mostrar.fixo25 ? mes.lance_fixo_25_qt : 0)}</span>
                    </div>
                  )
                ) : (
                  <>
                    {mostrar.fixo50 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                        <span style={{ fontSize: 14, color: '#333' }}>🎯 {esconderFixoPct ? 'Lance Fixo' : 'Lance Fixo 50%'}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#e8870b' }}>{mes.lance_fixo_50_qt}</span>
                      </div>
                    )}
                    {mostrar.fixo25 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                        <span style={{ fontSize: 14, color: '#333' }}>🎯 {esconderFixoPct ? 'Lance Fixo Embutido' : 'Lance Fixo 25%'}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#9333ea' }}>{mes.lance_fixo_25_qt}</span>
                      </div>
                    )}
                  </>
                )}
                {mostrar.livre && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, color: '#333' }}>⚖️ Lance Livre</span>
                      {!mostrar.ocultarLivrePct && mes.lance_livre_qt > 0 && (
                        <span style={{ fontSize: 10, color: '#999' }}>maior {fmtPct(mes.lance_livre_maior)} · menor {fmtPct(mes.lance_livre_menor)}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{mes.lance_livre_qt}</span>
                  </div>
                )}
              </div>

              {/* rodapé motivacional */}
              <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#c91a1a' }}>Possíveis cotas reservas podem ser chamadas</div>
              </div>
            </div>
          </div>

          <button onClick={gerarImagem} disabled={gerando} className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
            {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {gerando ? 'Gerando...' : 'Baixar Imagem'}
          </button>
          {onAbrirArquivoOficial && (
            <button onClick={onAbrirArquivoOficial} className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 mt-2 text-sm font-medium" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <Paperclip size={15} />Abrir arquivo oficial
            </button>
          )}
          <p className="text-[10px] text-center mt-2" style={{ color: 'var(--muted-color)' }}>Baixe e compartilhe no WhatsApp com o cliente</p>
        </div>
      </div>
    </div>
  )
}
