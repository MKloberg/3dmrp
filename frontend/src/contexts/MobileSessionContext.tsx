import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { type MobileTask, type MobileTaskResult } from '../api/client'

async function fetchPersistentToken(): Promise<string> {
  const res = await fetch('/api/mobile/persistent-session').then(r => r.json())
  return res.token
}

async function resetPersistentToken(): Promise<string> {
  const res = await fetch('/api/mobile/persistent-session/reset', { method: 'POST' }).then(r => r.json())
  return res.token
}

interface MobileSessionContextValue {
  token: string | null
  phoneConnected: boolean
  phoneName: string | null
  pendingPrint: { spool_id: number } | null
  clearPendingPrint: () => void
  pushTask: (task: { task_type: 'nfc_write'; nfc_token: string } | { task_type: 'print_label'; spool_id: number }, onResult?: (result: MobileTaskResult) => void) => void
}

const MobileSessionContext = createContext<MobileSessionContextValue>({
  token: null,
  phoneConnected: false,
  phoneName: null,
  pendingPrint: null,
  clearPendingPrint: () => {},
  pushTask: () => {},
})

export function useMobileSession() {
  return useContext(MobileSessionContext)
}

export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [phoneName, setPhoneName] = useState<string | null>(null)
  const [pendingPrint, setPendingPrint] = useState<{ spool_id: number } | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingResultRef = useRef<((result: MobileTaskResult) => void) | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTokenRef = useRef<string | null>(null)
  const failureCountRef = useRef(0)
  const unmountedRef = useRef(false)

  const connect = useCallback((tok: string) => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/mobile/ws/${tok}/desktop`)
    wsRef.current = ws

    ws.onopen = () => {
      failureCountRef.current = 0
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'phone_connected') {
          setPhoneConnected(true)
        } else if (msg.type === 'hello') {
          setPhoneConnected(true)
          setPhoneName(msg.name ?? null)
        } else if (msg.type === 'phone_disconnected') {
          setPhoneConnected(false)
          setPhoneName(null)
        } else if (msg.type === 'task' && msg.task_type === 'print_label' && msg.spool_id) {
          setPendingPrint({ spool_id: msg.spool_id })
        } else if (msg.type === 'task_result' && pendingResultRef.current) {
          const cb = pendingResultRef.current
          pendingResultRef.current = null
          cb(msg as MobileTaskResult)
        }
      } catch { /* ignore */ }
    }

    ws.onclose = (event) => {
      if (unmountedRef.current) return
      setPhoneConnected(false)
      setPhoneName(null)

      if (event.code === 4004) {
        // Token no longer valid — reset and get a fresh persistent token
        failureCountRef.current = 0
        activeTokenRef.current = null
        setToken(null)
        reconnectTimerRef.current = setTimeout(async () => {
          if (unmountedRef.current) return
          try {
            const tok = await resetPersistentToken()
            activeTokenRef.current = tok
            setToken(tok)
            connect(tok)
          } catch {
            reconnectTimerRef.current = setTimeout(() => {
              if (!unmountedRef.current && activeTokenRef.current) connect(activeTokenRef.current)
            }, 5000)
          }
        }, 1000)
        return
      }

      // Transient disconnect — reconnect with same token (DB keeps it valid across restarts)
      failureCountRef.current++
      const delay = Math.min(1000 * failureCountRef.current, 10000)
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current && activeTokenRef.current) connect(activeTokenRef.current)
      }, delay)
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    unmountedRef.current = false

    async function init() {
      try {
        const tok = await fetchPersistentToken()
        if (!unmountedRef.current) {
          activeTokenRef.current = tok
          setToken(tok)
          connect(tok)
        }
      } catch {
        return
      }
    }
    init()

    return () => {
      unmountedRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushTask = useCallback((
    task: { task_type: 'nfc_write'; nfc_token: string } | { task_type: 'print_label'; spool_id: number },
    onResult?: (result: MobileTaskResult) => void,
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (onResult) pendingResultRef.current = onResult
      wsRef.current.send(JSON.stringify({ type: 'task', ...task }))
    }
  }, [])

  const clearPendingPrint = useCallback(() => setPendingPrint(null), [])

  return (
    <MobileSessionContext.Provider value={{ token, phoneConnected, phoneName, pendingPrint, clearPendingPrint, pushTask }}>
      {children}
    </MobileSessionContext.Provider>
  )
}
