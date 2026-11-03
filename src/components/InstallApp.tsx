'use client'
import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
type W = Window & { __avronextInstall?: PromptEvent | null }

/** Whether AvroNext can be installed from here, and how. */
export function useInstall() {
  const [state, setState] = useState({ standalone: false, canPrompt: false, ios: false })
  useEffect(() => {
    const update = () =>
      setState({
        standalone: matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
        canPrompt: Boolean((window as W).__avronextInstall),
        ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
      })
    update()
    window.addEventListener('avronext:installable', update)
    return () => window.removeEventListener('avronext:installable', update)
  }, [])
  const prompt = async () => {
    const e = (window as W).__avronextInstall
    if (!e) return false
    await e.prompt()
    await e.userChoice.catch(() => null)
    ;(window as W).__avronextInstall = null
    window.dispatchEvent(new Event('avronext:installable'))
    return true
  }
  return { ...state, prompt }
}

/** How to install when the browser has no install button (iPhone/iPad Safari, some desktop browsers). */
export function InstallHelp({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  return (
    <Modal title="Install AvroNext" onClose={onClose} width={420} footer={<button className="btn btn-primary" onClick={onClose}>Got it</button>}>
      <div className="install-help">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={64} height={64} />
        {ios ? (
          <ol>
            <li>
              Tap <strong>Share</strong> <Icon name="share" size={14} /> in Safari’s toolbar.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>. AvroNext opens full screen from your home screen.
            </li>
          </ol>
        ) : (
          <ol>
            <li>
              Open your browser’s menu (<strong>⋮</strong> or <strong>…</strong>).
            </li>
            <li>
              Choose <strong>Install AvroNext</strong> or <strong>Add to Home screen</strong>.
            </li>
            <li>Chrome, Edge and Samsung Internet support it; Firefox on desktop doesn’t.</li>
          </ol>
        )}
      </div>
    </Modal>
  )
}
