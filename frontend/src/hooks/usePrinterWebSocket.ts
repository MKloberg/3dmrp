import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PrinterStatus, AfcLanesResponse } from '../api/client'

type RawState = Record<string, Record<string, unknown>>

const AFC_KEYS = ['AFC_lane E0', 'AFC_lane E1', 'AFC_lane E2', 'AFC_lane E3']

const SUBSCRIBE_OBJECTS = {
  print_stats: null,
  extruder: null,
  heater_bed: null,
  virtual_sdcard: null,
  toolhead: null,
  'AFC_lane E0': null,
  'AFC_lane E1': null,
  'AFC_lane E2': null,
  'AFC_lane E3': null,
}

function buildStatus(raw: RawState): PrinterStatus {
  const ps = (raw['print_stats'] ?? {}) as Record<string, unknown>
  const vs = (raw['virtual_sdcard'] ?? {}) as Record<string, unknown>
  const ex = (raw['extruder'] ?? {}) as Record<string, unknown>
  const hb = (raw['heater_bed'] ?? {}) as Record<string, unknown>
  const th = (raw['toolhead'] ?? {}) as Record<string, unknown>
  return {
    state: (ps.state as string) || 'standby',
    filename: (ps.filename as string) || null,
    progress: (vs.progress as number) ?? null,
    print_duration: (ps.print_duration as number) ?? null,
    time_remaining: null,
    extruder_temp: (ex.temperature as number) ?? null,
    extruder_target: (ex.target as number) ?? null,
    bed_temp: (hb.temperature as number) ?? null,
    bed_target: (hb.target as number) ?? null,
    active_extruder: (th.extruder as string) || null,
  }
}

function buildAfcLanes(raw: RawState): AfcLanesResponse {
  const lanes = AFC_KEYS.flatMap(key => {
    const lane = raw[key] as Record<string, unknown> | undefined
    if (!lane) return []
    const material = (lane.material as string) || ''
    const spool_id = Number(lane.spool_id ?? 0)
    if (!material && spool_id === 0) return []
    return [{
      name: (lane.name as string) || key.split(' ')[1],
      map: (lane.map as string) || '',
      extruder: (lane.extruder as string) || '',
      color: (lane.color as string) || '#888888',
      material,
      weight: Number(lane.weight ?? 0),
      status: (lane.status as string) || 'unknown',
      tool_loaded: Boolean(lane.tool_loaded),
      loaded_to_hub: Boolean(lane.loaded_to_hub),
      spool_id,
    }]
  })
  return { lanes }
}

export function usePrinterWebSocket(printerId: number, printerUrl: string, enabled: boolean): void {
  const qc = useQueryClient()
  const rawRef = useRef<RawState>({})
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    if (!enabled || !printerUrl) {
      qc.setQueryData(['ws-connected', printerId], false)
      return
    }

    const wsUrl = printerUrl.replace(/^https?/, 'ws').replace(/\/$/, '') + '/websocket'

    // Mixed-content guard: browsers block ws:// from an https:// page
    if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      qc.setQueryData(['ws-connected', printerId], false)
      return
    }

    function subscribeMsg(id: number) {
      return JSON.stringify({
        jsonrpc: '2.0',
        method: 'printer.objects.subscribe',
        params: { objects: SUBSCRIBE_OBJECTS },
        id,
      })
    }

    function queryMsg(id: number) {
      return JSON.stringify({
        jsonrpc: '2.0',
        method: 'printer.objects.query',
        params: { objects: SUBSCRIBE_OBJECTS },
        id,
      })
    }

    function connect() {
      if (!mountedRef.current) return

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelay.current = 1000
        ws.send(subscribeMsg(1))
      }

      ws.onmessage = (event: MessageEvent) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(event.data as string) } catch { return }

        // Subscription or query response — full state snapshot
        if ((msg.id === 1 || msg.id === 2) && msg.result) {
          const result = msg.result as { status?: Record<string, unknown> }
          if (result.status) {
            rawRef.current = result.status as RawState
            qc.setQueryData(['printer-status', printerId], buildStatus(rawRef.current))
            qc.setQueryData(['printer-afc-lanes', printerId], buildAfcLanes(rawRef.current))
            if (msg.id === 1) qc.setQueryData(['ws-connected', printerId], true)
          }
        }

        // Push: incremental delta update
        if (msg.method === 'notify_status_update' && Array.isArray(msg.params)) {
          const [delta] = msg.params as [Record<string, unknown>]
          for (const [key, val] of Object.entries(delta)) {
            rawRef.current[key] = { ...(rawRef.current[key] ?? {}), ...(val as Record<string, unknown>) }
          }
          qc.setQueryData(['printer-status', printerId], buildStatus(rawRef.current))
          qc.setQueryData(['printer-afc-lanes', printerId], buildAfcLanes(rawRef.current))
        }

        // Klippy went offline — mark state without clearing temps
        if (msg.method === 'notify_klippy_disconnected') {
          qc.setQueryData<PrinterStatus>(['printer-status', printerId], prev =>
            prev ? { ...prev, state: 'offline' } : prev
          )
        }

        // Klippy came back — re-query for fresh state
        if (msg.method === 'notify_klippy_ready') {
          rawRef.current = {}
          ws.send(queryMsg(2))
        }
      }

      ws.onerror = () => {
        // onclose fires after onerror, handled there
      }

      ws.onclose = () => {
        wsRef.current = null
        qc.setQueryData(['ws-connected', printerId], false)
        if (!mountedRef.current) return
        reconnectTimer.current = setTimeout(() => {
          if (!mountedRef.current) return
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
          connect()
        }, reconnectDelay.current)
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
      qc.setQueryData(['ws-connected', printerId], false)
    }
  // printerUrl and printerId treated as stable after mount; reconnect handled internally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, printerId, printerUrl])
}
