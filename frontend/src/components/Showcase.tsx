import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import ArchitectureView from './ArchitectureView'
import PresentationView from './PresentationView'

export default function Showcase({
  view,
  onClose,
}: {
  view: 'architecture' | 'slides'
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement || document.querySelector('[data-deck-present="true"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        if (document.fullscreenElement || document.querySelector('[data-deck-present="true"]')) {
          event.preventDefault()
          return
        }
        onClose()
      }}
      className="showcase-dialog"
      aria-label={view === 'architecture' ? 'Current Architecture' : 'Presentation slides'}
    >
      <button
        type="button"
        aria-label="Close"
        className={
          view === 'architecture'
            ? 'absolute right-4 top-4 z-40 rounded-lg border border-white/15 bg-[#07111f]/80 p-2 text-sky-100/90 backdrop-blur hover:bg-[#0c1c33]'
            : 'absolute right-4 top-4 z-40 rounded-lg border border-edge bg-surface p-2 text-ink hover:bg-surface-2'
        }
        onClick={onClose}
      >
        <X className="size-4" />
      </button>
      <div className="showcase-body">{view === 'architecture' ? <ArchitectureView /> : <PresentationView />}</div>
    </dialog>
  )
}
