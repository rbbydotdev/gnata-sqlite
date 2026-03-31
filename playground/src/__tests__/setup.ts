import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock browser APIs not available in jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}
vi.stubGlobal('Worker', MockWorker)
