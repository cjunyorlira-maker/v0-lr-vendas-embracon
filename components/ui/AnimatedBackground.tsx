'use client'

export default function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* Blob 1 — canto superior esquerdo */}
      <div
        className="animate-gradient-shift absolute"
        style={{
          top: '-20%',
          left: '-10%',
          width: '60%',
          height: '60%',
          background:
            'radial-gradient(ellipse at center, rgba(212,175,55,0.06) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
        }}
      />
      {/* Blob 2 — canto inferior direito */}
      <div
        className="animate-gradient-shift2 absolute"
        style={{
          bottom: '-20%',
          right: '-10%',
          width: '55%',
          height: '55%',
          background:
            'radial-gradient(ellipse at center, rgba(201,162,39,0.05) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(80px)',
        }}
      />
      {/* Blob 3 — centro */}
      <div
        className="animate-gradient-shift absolute"
        style={{
          top: '30%',
          left: '40%',
          width: '40%',
          height: '40%',
          background:
            'radial-gradient(ellipse at center, rgba(212,175,55,0.03) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(100px)',
        }}
      />
    </div>
  )
}
