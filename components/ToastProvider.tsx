import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastType = 'success' | 'error'

interface ToastOptions {
  type: ToastType
  message: string
}

interface ToastEntry extends ToastOptions {
  id: string
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

interface ToastProviderProps {
  children: ReactNode
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: string) => void }) {
  const [shrink, setShrink] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShrink(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const toneClasses = toast.type === 'success'
    ? 'bg-emerald-500/90 border-emerald-400/80 shadow-emerald-500/20'
    : 'bg-rose-500/90 border-rose-400/80 shadow-rose-500/20'

  return (
    <div className={`relative w-full max-w-sm rounded-lg border px-4 py-3 text-white shadow-lg ${toneClasses}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium flex-1">{toast.message}</div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-2xl font-bold text-white/70 hover:text-white leading-none flex-shrink-0"
        >
          ×
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/20">
        <div
          className="h-full bg-white/80 transition-[width] duration-[3000ms] ease-linear"
          style={{ width: shrink ? '0%' : '100%' }}
        />
      </div>
    </div>
  )
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timersRef = useRef<Record<string, number>>({})

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timer = timersRef.current[id]
    if (timer) {
      clearTimeout(timer)
      delete timersRef.current[id]
    }
  }, [])

  const showToast = useCallback(({ type, message }: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, type, message }])

    const timeoutId = window.setTimeout(() => {
      removeToast(id)
    }, 3000)

    timersRef.current[id] = timeoutId
  }, [removeToast])

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-6 left-1/2 z-[9999] flex w-full max-w-full -translate-x-1/2 flex-col items-center gap-3 px-4">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}


