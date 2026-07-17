'use client'

import { useState, useRef } from 'react'
import { Camera, Loader2, Upload } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  usuario: { id: string; nome: string; foto_url?: string | null } | null
  onSuccess: () => void
}

// Processa a imagem: crop central quadrado + redimensiona pra 512x512 com smoothing, exporta JPEG 0.92
function processarImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const lado = Math.min(img.width, img.height)
        const sx = (img.width - lado) / 2
        const sy = (img.height - lado) / 2
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 512
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas')); return }
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, 512, 512)
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function FotoUsuarioModal({ open, onClose, usuario, onSuccess }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open || !usuario) return null

  async function escolherArquivo(file: File) {
    if (!file.type.startsWith('image/')) { alert('Selecione uma imagem'); return }
    try {
      const dataUrl = await processarImagem(file)
      setPreview(dataUrl)
    } catch { alert('Não foi possível processar a imagem') }
  }

  async function salvar() {
    if (!preview || !usuario) return
    setSalvando(true)
    try {
      const res = await fetch('/api/usuarios/foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foto_base64: preview, usuario_id: usuario.id }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao salvar foto'); setSalvando(false); return }
      setPreview(null); setSalvando(false)
      onSuccess(); onClose()
    } catch { alert('Erro de conexão'); setSalvando(false) }
  }

  function fechar() { setPreview(null); onClose() }

  const atual = preview || usuario.foto_url || null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={fechar} />
      <div className="relative w-full max-w-sm rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Camera size={18} style={{ color: 'var(--accent)' }} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Foto de {usuario.nome}</h3>
        </div>

        {/* Preview quadrado */}
        <div className="flex justify-center mb-4">
          <div className="rounded-xl overflow-hidden flex items-center justify-center" style={{ width: 200, height: 200, background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)' }}>
            {atual
              ? <img src={atual || "/placeholder.svg"} alt="Prévia" width={200} height={200} style={{ width: 200, height: 200, objectFit: 'cover' }} />
              : <span className="text-xs" style={{ color: 'var(--muted-color)' }}>Sem foto</span>}
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) escolherArquivo(f) }} />

        <div className="flex flex-col gap-2">
          <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <Upload size={15} />{atual ? 'Escolher outra imagem' : 'Escolher imagem'}
          </button>
          <button onClick={salvar} disabled={!preview || salvando} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}>
            {salvando ? <Loader2 size={15} className="animate-spin" /> : 'Salvar foto'}
          </button>
          <button onClick={fechar} className="rounded-lg py-2 text-xs" style={{ color: 'var(--muted-color)' }}>Cancelar</button>
        </div>
        <p className="text-[10px] text-center mt-3" style={{ color: 'var(--muted-color)' }}>A imagem é recortada no centro e otimizada para 512×512.</p>
      </div>
    </div>
  )
}
