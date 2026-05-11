import Modal from './Modal'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmLabel = 'Yes', cancelLabel = 'No', onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
          {cancelLabel}
        </button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
