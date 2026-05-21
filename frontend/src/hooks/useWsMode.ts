import { useQuery } from '@tanstack/react-query'
import { getSettings } from '../api/client'

export type WsMode = 'off' | 'active' | 'all'

export function useWsMode(): WsMode {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  })
  const raw = settings?.printer_ws_mode
  if (raw === 'off' || raw === 'active') return raw
  return 'all'
}
