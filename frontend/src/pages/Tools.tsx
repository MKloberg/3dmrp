import { useNavigate } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'

const tools = [
  {
    to: '/tools/hueforge-export',
    label: 'HueForge Filament Export',
    description: 'Export all filaments as a HueForge-compatible JSON library file.',
    icon: Download,
    iconBg: 'bg-green-50 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    badge: null,
  },
  {
    to: '/tools/import-filament',
    label: 'Import Filament from Listing',
    description: 'AI-powered: paste a product listing to extract the full filament spec.',
    icon: FileText,
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badge: '$',
  },
]

export default function Tools() {
  const navigate = useNavigate()
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tools</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(t => (
          <button
            key={t.to}
            onClick={() => navigate(t.to)}
            className="flex items-start gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-sm transition-all text-left"
          >
            <div className={`w-10 h-10 rounded-lg ${t.iconBg} flex items-center justify-center shrink-0`}>
              <t.icon size={20} className={t.iconColor} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{t.label}</p>
                {t.badge && (
                  <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-1 py-0.5 rounded leading-none">{t.badge}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
