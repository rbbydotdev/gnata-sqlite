import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import { Outlet, Link, useLocation } from '@tanstack/react-router';

const THEME_KEY = 'gnata-playground-theme';

function getPreferredTheme(): 'dark' | 'light' {
  const s = localStorage.getItem(THEME_KEY);
  if (s === 'dark' || s === 'light') return s;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export interface LayoutContext {
  theme: 'dark' | 'light';
  onStatusChange: (cls: string, text: string) => void;
  onProgressChange: (pct: number, visible: boolean) => void;
}

const LayoutCtx = createContext<LayoutContext>({
  theme: 'dark',
  onStatusChange: () => {},
  onProgressChange: () => {},
});

export function useLayoutContext() {
  return useContext(LayoutCtx);
}

const SUN_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MOON_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function RootLayout() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getPreferredTheme);
  const [statusCls, setStatusCls] = useState('');
  const [statusText, setStatusText] = useState('Loading\u2026');
  const [progressPct, setProgressPct] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const progressFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const location = useLocation();
  const mode = location.pathname === '/gnata' ? 'gnata' : 'sqlite';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleStatusChange = useCallback((cls: string, text: string) => {
    setStatusCls(cls);
    setStatusText(text);
  }, []);

  const handleProgressChange = useCallback((pct: number, visible: boolean) => {
    setProgressPct(pct);
    if (visible) {
      setProgressVisible(true);
      if (progressFadeTimer.current) {
        clearTimeout(progressFadeTimer.current);
        progressFadeTimer.current = null;
      }
    } else {
      if (progressFadeTimer.current) clearTimeout(progressFadeTimer.current);
      progressFadeTimer.current = setTimeout(() => setProgressVisible(false), 300);
    }
  }, []);

  const ctx: LayoutContext = {
    theme,
    onStatusChange: handleStatusChange,
    onProgressChange: handleProgressChange,
  };

  return (
    <LayoutCtx.Provider value={ctx}>
      <div
        className="progress-bar"
        style={{ width: progressPct + '%', opacity: progressVisible ? 1 : 0 }}
      />

      <header>
        <h1><a href="https://rbby.dev/gnata-sqlite/" style={{ color: 'inherit', textDecoration: 'none' }}><span>gnata-sqlite</span></a></h1>
        <div className="mode-tabs">
          <Link
            to="/sqlite"
            className={'mode-tab' + (mode === 'sqlite' ? ' active' : '')}
          >
            SQLite
          </Link>
          <Link
            to="/gnata"
            className={'mode-tab' + (mode === 'gnata' ? ' active' : '')}
          >
            gnata
          </Link>
        </div>
        <div className="header-links">
          <div className={'status' + (statusCls === 'ready' ? ' ready' : '')}>
            <span className="dot" />
            <span>{statusText}</span>
          </div>
          <div className="sep" />
          <a href="https://docs.jsonata.org/overview" target="_blank" rel="noopener noreferrer">
            Docs
          </a>
          <a href="https://docs.jsonata.org/string-functions" target="_blank" rel="noopener noreferrer">
            Functions
          </a>
          <div className="sep" />
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode">
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {theme === 'dark' ? SUN_SVG : MOON_SVG}
            </span>
          </button>
        </div>
      </header>

      <div className="app">
        <Outlet />
      </div>
    </LayoutCtx.Provider>
  );
}
