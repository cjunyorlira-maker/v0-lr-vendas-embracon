'use client'

import { useState, useRef } from 'react'
import { Camera, Loader2, Upload, Check } from 'lucide-react'

interface Props {
  open: boolean
  usuario: { id: string; nome: string | null } | null
  onSalvou: (fotoUrl: string) => void
  onAgoraNao: () => void
}

// Crop central quadrado + redimensiona para 512x512 (smoothing alto) e exporta JPEG 0.92 (~100-200KB)
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
        try {
          ctx.drawImage(img, sx, sy, lado, lado, 0, 0, 512, 512)
          resolve(canvas.toDataURL('image/jpeg', 0.92))
        } catch {
          reject(new Error('draw'))
        }
      }
      img.onerror = () => reject(new Error('load'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
}

export default function AvisoFotoModal({ open, usuario, onSalvou, onAgoraNao }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open || !usuario) return null

  const inicial = usuario.nome ? usuario.nome.charAt(0).toUpperCase() : 'U'

  async function escolherArquivo(file: File) {
    setErro(null)
    if (!file.type.startsWith('image/')) {
      setErro('Formato não suportado, use JPG ou PNG')
      return
    }
    try {
      const dataUrl = await processarImagem(file)
      setPreview(dataUrl)
    } catch {
      setErro('Formato não suportado, use JPG ou PNG')
    }
  }

  async function salvar() {
    if (!preview) return
    setSalvando(true)
    setErro(null)
    try {
      const res = await fetch('/api/usuarios/foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foto_base64: preview }),
      })
      const data = await res.json()
      if (!res.ok || !data.foto_url) {
        setErro('Não foi possível salvar, tente de novo')
        setSalvando(false)
        return
      }
      // sucesso: entrega a URL e o modal nunca mais aparece (foto_url deixa de estar vazia)
      onSalvou(data.foto_url)
    } catch {
      setErro('Não foi possível salvar, tente de novo')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
      <div className="relative w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <Camera size={20} style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Adicione sua foto</h3>
        </div>
        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--muted-color)' }}>
          Sua foto aparece no ranking e nas premiações. Adicione agora — leva 10 segundos!
        </p>

        {/* Preview circular grande */}
        <div className="flex justify-center mb-5">
          <div
            className="rounded-full overflow-hidden flex items-center justify-center"
            style={{ width: 140, height: 140, background: 'rgba(212,175,55,0.12)', border: '2px solid rgba(212,175,55,0.4)' }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview || "/placeholder.svg"} alt="Prévia da foto" width={140} height={140} style={{ width: 140, height: 140, objectFit: 'cover' }} />
            ) : (
              <span className="text-5xl font-bold" style={{ color: 'var(--accent)' }}>{inicial}</span>
            )}
          </div>
        </div>

        {erro && (
          <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{erro}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) escolherArquivo(f); e.target.value = '' }}
        />

        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={salvando}
            className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)' }}
          >
            <Upload size={15} />{preview ? 'Escolher outra foto' : 'Escolher foto'}
          </button>
          <button
            onClick={salvar}
            disabled={!preview || salvando}
            className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #b8941f 100%)', color: '#0a0a0a' }}
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15} />Salvar</>}
          </button>
          <button
            onClick={onAgoraNao}
            disabled={salvando}
            className="rounded-lg py-2 text-xs disabled:opacity-40"
            style={{ color: 'var(--muted-color)' }}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
