import './assets/main.css'
import { createRoot } from 'react-dom/client'
import { initializeI18n } from './locales'
import { installStreamingPerfMonitor } from './lib/streaming-perf'

const isNotifyWindow = window.location.hash.startsWith('#notify')
const appView = new URLSearchParams(window.location.search).get('appView')

installStreamingPerfMonitor()

const root = createRoot(document.getElementById('root')!)

async function renderWindowSurface(): Promise<void> {
  await initializeI18n()

  if (isNotifyWindow) {
    const { NotifyWindow } = await import('./components/notify/NotifyWindow')
    root.render(<NotifyWindow />)
    return
  }

  if (appView === 'pet') {
    const { PetWindow } = await import('./components/pet/PetWindow')
    root.render(<PetWindow />)
    return
  }

  if (appView === 'ssh') {
    const { SshWindowApp } = await import('./components/ssh/SshWindowApp')
    root.render(<SshWindowApp />)
    return
  }

  const { default: App } = await import('./App')
  root.render(<App />)
}

void renderWindowSurface().catch((error) => {
  console.error('[Renderer] Failed to load window surface:', error)
  root.render(
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-destructive">
      Failed to load this window. Please reopen it or restart 千行.
    </div>
  )
})
