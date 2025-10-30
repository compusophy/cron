import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface PrivateKeyModalProps {
  isOpen: boolean
  onClose: () => void
  privateKey: string
  walletName: string
}

export default function PrivateKeyModal({ isOpen, onClose, privateKey, walletName }: PrivateKeyModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(privateKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold">Private Key - {walletName}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono text-gray-900 whitespace-nowrap overflow-x-auto flex-1">{privateKey}</p>
            <button
              onClick={handleCopy}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded flex-shrink-0"
              title="Copy private key"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

