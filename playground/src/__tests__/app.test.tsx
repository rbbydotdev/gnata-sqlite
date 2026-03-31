import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  RouterProvider,
  createRouter,
  createRoute,
  createRootRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { RootLayout } from '../RootLayout'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val }),
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

// Minimal test router with stub routes (no WASM/CodeMirror needed)
function createTestRouter(initialPath = '/sqlite') {
  const rootRoute = createRootRoute({ component: RootLayout })
  const sqliteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sqlite',
    component: () => <div data-testid="sqlite-mode">SQLite Mode</div>,
  })
  const gnataRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/gnata',
    component: () => <div data-testid="gnata-mode">gnata Mode</div>,
  })
  const routeTree = rootRoute.addChildren([sqliteRoute, gnataRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

function renderWithRouter(initialPath = '/sqlite') {
  const testRouter = createTestRouter(initialPath)
  return render(<RouterProvider router={testRouter} />)
}

describe('App with Router', () => {
  beforeEach(() => {
    localStorageMock.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders the header with project name', async () => {
    renderWithRouter()
    await waitFor(() => expect(screen.getByText('SQLite')).toBeInTheDocument())
  })

  it('renders mode tabs as navigation links', async () => {
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText('SQLite')).toBeInTheDocument()
      expect(screen.getByText('gnata')).toBeInTheDocument()
    })
  })

  it('SQLite tab is active on /sqlite', async () => {
    renderWithRouter('/sqlite')
    await waitFor(() => {
      const sqliteTab = screen.getByText('SQLite')
      expect(sqliteTab.classList.contains('active')).toBe(true)
    })
  })

  it('gnata tab is active on /gnata', async () => {
    renderWithRouter('/gnata')
    await waitFor(() => {
      const gnataTab = screen.getByText('gnata')
      expect(gnataTab.classList.contains('active')).toBe(true)
    })
  })

  it('renders the correct route content', async () => {
    renderWithRouter('/sqlite')
    await waitFor(() => expect(screen.getByTestId('sqlite-mode')).toBeInTheDocument())
  })

  it('applies theme to document', async () => {
    renderWithRouter()
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('toggles theme on button click', async () => {
    renderWithRouter()
    await waitFor(() => screen.getByTitle('Toggle light/dark mode'))
    const toggle = screen.getByTitle('Toggle light/dark mode')
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('persists theme to localStorage', async () => {
    renderWithRouter()
    await waitFor(() => screen.getByTitle('Toggle light/dark mode'))
    fireEvent.click(screen.getByTitle('Toggle light/dark mode'))
    expect(localStorageMock.setItem).toHaveBeenCalledWith('gnata-playground-theme', 'light')
  })

  it('renders doc links', async () => {
    renderWithRouter()
    await waitFor(() => {
      expect(screen.getByText('Docs')).toBeInTheDocument()
      expect(screen.getByText('Functions')).toBeInTheDocument()
    })
  })
})
