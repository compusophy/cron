import useSWR from 'swr'
import { useSWRConfig } from 'swr'
import useSWRMutation from 'swr/mutation'
import { useState } from 'react'
import PrivateKeyModal from './PrivateKeyModal'
import DeleteConfirmModal from './DeleteConfirmModal'
import WalletCard from './WalletCard'
import SendAssetModal from './SendAssetModal'
import SwapTokenModal from './SwapTokenModal'
import DrainWalletModal from './DrainWalletModal'
import WalletLogsModal from './WalletLogsModal'
import WalletForm from './WalletForm'
import ReparentWalletModal from './ReparentWalletModal'
import CronJobForm from './CronJobForm'
import { useToast } from './ToastProvider'

const DEFAULT_TEST_COIN_ADDRESS = process.env.NEXT_PUBLIC_DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07'

type WalletType = 'master' | 'worker'

interface Wallet {
  id: string
  name: string
  address: string
  createdAt: number
  type: WalletType
  parentId?: string | null
  jobId?: string | null
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

async function triggerMutation(url: string) {
  return fetcher(url)
}

interface Balances {
  eth: string
  weth: string
  usdc: string
}

interface CronJob {
  id: string
  name: string
  type: 'eth_transfer' | 'swap' | 'token_swap'
  enabled: boolean
  workerWalletId?: string
}

export default function WalletList() {
  const { data, error } = useSWR<{ wallets: Wallet[] }>('/api/wallets/list', fetcher)
  const { data: cronJobsData } = useSWR<{ jobs: CronJob[] }>('/api/cron/list', fetcher)
  const { trigger: refreshWallets, isMutating } = useSWRMutation('/api/wallets/list', triggerMutation, {
    populateCache: (result, currentData) => result,
    revalidate: false,
  })
  const { mutate: globalMutate } = useSWRConfig()
  const { showToast } = useToast()
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [privateKeyModal, setPrivateKeyModal] = useState<{ walletId: string; walletName: string; privateKey: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ walletId: string; walletName: string } | null>(null)
  const [sendModal, setSendModal] = useState<{ wallet: Wallet } | null>(null)
  const [swapModal, setSwapModal] = useState<{ wallet: Wallet } | null>(null)
  const [drainModal, setDrainModal] = useState<{ wallet: Wallet } | null>(null)
  const [logsModal, setLogsModal] = useState<{ wallet: Wallet } | null>(null)
  const [newChildModal, setNewChildModal] = useState<{ parent: Wallet } | null>(null)
  const [promoteModal, setPromoteModal] = useState<{ wallet: Wallet } | null>(null)
  const [newMasterModal, setNewMasterModal] = useState(false)
  const [createCronJobModal, setCreateCronJobModal] = useState<{ parentWalletId: string } | null>(null)
  const [editCronJobModal, setEditCronJobModal] = useState<{ jobId: string } | null>(null)

  const refreshBalances = () => {
    refreshWallets()
      .then((result) => (result?.wallets ?? data?.wallets) || [])
      .catch((err) => {
        console.error('Failed to refresh wallets:', err)
        return (data?.wallets || [])
      })
      .then((walletsToRefresh: Wallet[]) => {
        walletsToRefresh.forEach((wallet: Wallet) => {
          globalMutate(`/api/wallets/balances?address=${wallet.address}`)
        })
      })
    // Also refresh cron jobs
    globalMutate('/api/cron/list')
  }

  const handleCronJobCreated = () => {
    refreshBalances()
    setCreateCronJobModal(null)
  }

  const handlePauseCronJob = async (jobId: string) => {
    try {
      const cronJobs = cronJobsData?.jobs || []
      const job = cronJobs.find(j => j.id === jobId)
      if (!job) return

      const response = await fetch('/api/cron/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId, enabled: !job.enabled }),
      })

      if (response.ok) {
        refreshBalances()
        showToast({
          type: 'success',
          message: `Cron job ${job.enabled ? 'paused' : 'resumed'} successfully`,
        })
      } else {
        const data = await response.json()
        showToast({
          type: 'error',
          message: data.error || 'Failed to pause/resume cron job',
        })
      }
    } catch (err) {
      console.error('Failed to pause/resume cron job:', err)
      showToast({
        type: 'error',
        message: 'Failed to pause/resume cron job',
      })
    }
  }

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

  const wallets = data.wallets || []
  const cronJobs = cronJobsData?.jobs || []
  
  // Create maps for cron job info
  const jobIdToJob = cronJobs.reduce<Record<string, CronJob>>((acc, job) => {
    acc[job.id] = job
    return acc
  }, {})

  const walletById = wallets.reduce<Record<string, Wallet>>((acc, wallet) => {
    acc[wallet.id] = wallet
    return acc
  }, {})

  const childrenMap = wallets.reduce<Record<string, Wallet[]>>((acc, wallet) => {
    const key = wallet.parentId || '__root__'
    if (!acc[key]) acc[key] = []
    acc[key].push(wallet)
    return acc
  }, {})

  const rootWallets = (childrenMap['__root__'] || []).sort((a, b) => a.createdAt - b.createdAt)

  const renderWalletTree = (wallet: Wallet, depth: number) => {
    const children = (childrenMap[wallet.id] || []).sort((a, b) => a.createdAt - b.createdAt)

    return (
      <div key={wallet.id} className={depth === 0 ? 'flex flex-col gap-2' : 'flex flex-col gap-2 border-l border-dashed border-gray-300 ml-4 pl-4'}>
        <WalletCard
          wallet={wallet}
          variant={wallet.parentId ? 'worker' : 'master'}
          copiedAddress={copiedAddress}
          onCopyAddress={copyAddress}
          cronJob={wallet.jobId ? jobIdToJob[wallet.jobId] : null}
          cronJobId={wallet.jobId || null}
          onCreateCronJob={!wallet.parentId ? () => setCreateCronJobModal({ parentWalletId: wallet.id }) : undefined}
          onPauseCronJob={wallet.jobId ? () => handlePauseCronJob(wallet.jobId!) : undefined}
          onEditCronJob={wallet.jobId ? () => setEditCronJobModal({ jobId: wallet.jobId! }) : undefined}
          onShowPrivateKey={(walletId) => {
            fetch(`/api/wallets/get?walletId=${walletId}`)
              .then(res => res.json())
              .then(data => {
                if (data.wallet) {
                  setPrivateKeyModal({
                    walletId,
                    walletName: wallet.name,
                    privateKey: data.wallet.privateKey
                  })
                } else {
                  showToast({
                    type: 'error',
                    message: 'Unable to fetch private key. Please try again.',
                  })
                }
              })
              .catch(err => {
                console.error('Failed to get private key:', err)
                showToast({
                  type: 'error',
                  message: 'Unable to fetch private key. Please try again.',
                })
              })
          }}
          onDelete={(walletId, walletName) => {
            setDeleteConfirm({ walletId, walletName })
          }}
          onSend={(selectedWallet) => setSendModal({ wallet: selectedWallet })}
          onSwap={(selectedWallet) => setSwapModal({ wallet: selectedWallet })}
          onDrain={(selectedWallet) => setDrainModal({ wallet: selectedWallet })}
          onViewLogs={(selectedWallet) => setLogsModal({ wallet: selectedWallet })}
          onAddChild={(selectedWallet) => setNewChildModal({ parent: selectedWallet })}
          onAssignParent={(selectedWallet) => setPromoteModal({ wallet: selectedWallet })}
        />
        {children.length > 0 && (
          <div className="flex flex-col gap-2">
            {children.map((child) => renderWalletTree(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDeleteWallet = async (walletId: string) => {
    try {
      const response = await fetch(`/api/wallets/delete?walletId=${walletId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        showToast({
          type: 'success',
          message: 'Wallet deleted successfully',
        })
        refreshBalances()
      } else {
        const data = await response.json()
        showToast({
          type: 'error',
          message: data.error || 'Failed to delete wallet',
        })
      }
    } catch (err) {
      console.error('Failed to delete wallet:', err)
      showToast({
        type: 'error',
        message: 'Failed to delete wallet',
      })
    }
  }

  return (
    <>
      {isMutating && (
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
          <span className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
          Updating balances…
        </div>
      )}
      <div className="flex flex-col gap-3">
        {rootWallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm text-gray-600">No wallets yet. Create a master wallet to get started.</p>
            <button
              onClick={() => setNewMasterModal(true)}
              className="px-6 py-2 rounded-md font-medium shadow-sm"
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              + Create Master Wallet
            </button>
          </div>
        ) : (
          rootWallets.map((root) => renderWalletTree(root, 0))
        )}
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

      {sendModal && (
        <SendAssetModal
          isOpen={true}
          onClose={() => setSendModal(null)}
          wallet={{
            id: sendModal.wallet.id,
            name: sendModal.wallet.name,
            address: sendModal.wallet.address,
          }}
          onSuccess={refreshBalances}
        />
      )}

      {swapModal && (
        <SwapTokenModal
          isOpen={true}
          onClose={() => setSwapModal(null)}
          wallet={{
            id: swapModal.wallet.id,
            name: swapModal.wallet.name,
            address: swapModal.wallet.address,
          }}
          defaultTokenAddress={DEFAULT_TEST_COIN_ADDRESS}
          onSuccess={refreshBalances}
        />
      )}

      {drainModal && (
        <DrainWalletModal
          isOpen={true}
          onClose={() => setDrainModal(null)}
          wallet={{
            id: drainModal.wallet.id,
            name: drainModal.wallet.name,
            address: drainModal.wallet.address,
          }}
          onSuccess={refreshBalances}
        />
      )}

      {logsModal && (
        <WalletLogsModal
          isOpen={true}
          onClose={() => setLogsModal(null)}
          walletId={logsModal.wallet.id}
          walletName={logsModal.wallet.name}
          walletAddress={logsModal.wallet.address}
        />
      )}

      {newChildModal && (
        <WalletForm
          isOpen={true}
          onClose={() => setNewChildModal(null)}
          onWalletCreated={refreshBalances}
          parentWallet={{
            id: newChildModal.parent.id,
            name: newChildModal.parent.name,
            address: newChildModal.parent.address,
          }}
          allWallets={wallets.map((w) => ({
            id: w.id,
            name: w.name,
            parentId: w.parentId || null,
          }))}
        />
      )}

      {promoteModal && (
        <ReparentWalletModal
          isOpen={true}
          onClose={() => setPromoteModal(null)}
          wallet={{
            id: promoteModal.wallet.id,
            name: promoteModal.wallet.name,
            address: promoteModal.wallet.address,
            parentId: promoteModal.wallet.parentId || null,
          }}
          wallets={wallets.map((w) => ({
            id: w.id,
            name: w.name,
            address: w.address,
            parentId: w.parentId || null,
          }))}
          onSuccess={refreshBalances}
        />
      )}

      {newMasterModal && (
        <WalletForm
          isOpen={true}
          onClose={() => setNewMasterModal(false)}
          onWalletCreated={refreshBalances}
          allWallets={wallets.map((w) => ({
            id: w.id,
            name: w.name,
            parentId: w.parentId || null,
          }))}
        />
      )}

      {createCronJobModal && (
        <CronJobForm
          isOpen={true}
          onClose={() => setCreateCronJobModal(null)}
          onJobCreated={handleCronJobCreated}
          defaultWalletId={createCronJobModal.parentWalletId}
        />
      )}

      {editCronJobModal && (
        <CronJobForm
          isOpen={true}
          onClose={() => setEditCronJobModal(null)}
          onJobCreated={handleCronJobCreated}
          jobId={editCronJobModal.jobId}
        />
      )}
    </>
  )
}

