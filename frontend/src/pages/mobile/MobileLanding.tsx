import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc2 } from 'lucide-react'
import QrScanner from '../../components/QrScanner'

export default function MobileLanding() {
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = '#030712'
    return () => { document.body.style.backgroundColor = prev }
  }, [])

  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  function handleScan(text: string) {
    if (scanned) return
    const name = text.trim()
    if (!name) return
    setScanned(true)
    navigate(`/mobile/printer/${encodeURIComponent(name)}`)
  }

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-safe pt-5 pb-4">
        <Disc2 size={22} className="text-brand-400 shrink-0" />
        <span className="text-base font-semibold tracking-tight">Filament Loader</span>
      </div>

      {/* Instruction */}
      <div className="px-5 pb-4">
        <p className="text-sm text-gray-400 leading-snug">
          Scan the QR code label on your printer to begin.
        </p>
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative mx-4 mb-4 rounded-2xl overflow-hidden bg-black">
        <QrScanner onScan={handleScan} />

        {/* Corner guides */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-56 h-56">
            {/* TL */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
            {/* TR */}
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
            {/* BL */}
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
            {/* BR */}
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />
          </div>
        </div>
      </div>

      {error && (
        <p className="px-5 pb-4 text-sm text-red-400 text-center">{error}</p>
      )}

      <p className="pb-safe pb-6 text-xs text-gray-600 text-center">
        3DMRP · Filament Loading
      </p>
    </div>
  )
}
