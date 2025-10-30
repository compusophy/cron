import useSWR from 'swr'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import PrivateKeyModal from './PrivateKeyModal'
import DeleteConfirmModal from './DeleteConfirmModal'

interface Wallet {
  id: string
  name: string
  address: string
  createdAt: number
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function WalletList() {
  const { data, error, mutate } = useSWR<{ wallets: Wallet[] }>('/api/wallets/list', fetcher)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [privateKeyModal, setPrivateKeyModal] = useState<{ walletId: string; walletName: string; privateKey: string } | null>(null)
  const [deletingWallet, setDeletingWallet] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ walletId: string; walletName: string } | null>(null)

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
        Failed to load wallets
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-24 bg-gray-200 animate-pulse rounded-lg" />
        <div className="h-24 bg-gray-200 animate-pulse rounded-lg" />
      </div>
    )
  }

  const wallets = (data.wallets || []).sort((a, b) => b.createdAt - a.createdAt)

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleShowPrivateKey = async (walletId: string, walletName: string) => {
    try {
      const response = await fetch(`/api/wallets/get?walletId=${walletId}`)
      const data = await response.json()
      if (data.wallet) {
        setPrivateKeyModal({ walletId, walletName, privateKey: data.wallet.privateKey })
      }
    } catch (err) {
      console.error('Failed to fetch private key:', err)
    }
  }

  const handleDeleteWallet = async (walletId: string) => {
    setDeletingWallet(walletId)
    try {
      const response = await fetch(`/api/wallets/delete?walletId=${walletId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        mutate()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete wallet')
      }
    } catch (err) {
      console.error('Failed to delete wallet:', err)
      alert('Failed to delete wallet')
    } finally {
      setDeletingWallet(null)
    }
  }

  if (wallets.length === 0) {
    return (
      <div className="p-6 border border-gray-200 rounded-lg text-center text-gray-500">
        No wallets yet. Create one above!
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {wallets.map((wallet) => (
          <div
            key={wallet.id}
            className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow relative"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-semibold mb-2">{wallet.name}</h4>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-500 font-mono break-all">{wallet.address}</p>
                  <button
                    onClick={() => copyAddress(wallet.address)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded flex-shrink-0"
                    title="Copy address"
                  >
                    {copiedAddress === wallet.address ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              
              {/* 3-dot menu */}
              <div className="relative ml-3 flex-shrink-0">
                <button
                  onClick={() => setOpenMenu(openMenu === wallet.id ? null : wallet.id)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                  title="Menu"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                
                {openMenu === wallet.id && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setOpenMenu(null)}
                    />
                    <div className="absolute right-0 top-8 z-20 w-48 bg-white border border-gray-200 rounded-md shadow-lg">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            handleShowPrivateKey(wallet.id, wallet.name)
                            setOpenMenu(null)
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Show Private Key
                        </button>
                          <button
                            onClick={() => {
                              setDeleteConfirm({ walletId: wallet.id, walletName: wallet.name })
                              setOpenMenu(null)
                            }}
                            disabled={deletingWallet === wallet.id}
                            className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {privateKeyModal && (
        <PrivateKeyModal
          isOpen={true}
          onClose={() => setPrivateKeyModal(null)}
          privateKey={privateKeyModal.privateKey}
          walletName={privateKeyModal.walletName}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDeleteWallet(deleteConfirm.walletId)}
          title="Delete Wallet"
          message="Are you sure you want to delete this wallet? This action cannot be undone."
          itemName={deleteConfirm.walletName}
        />
      )}
    </>
  )
}

