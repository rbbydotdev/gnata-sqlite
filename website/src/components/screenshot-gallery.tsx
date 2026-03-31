'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

interface Screenshot {
  src: string;
  alt: string;
}

const screenshots: Screenshot[] = [
  { src: `${base}/screenshots/playground-gnata-autocomplete.png`, alt: 'Context-aware autocomplete' },
  { src: `${base}/screenshots/playground-gnata-hover.png`, alt: 'Hover documentation' },
  { src: `${base}/screenshots/playground-gnata-transform.png`, alt: 'Object construction' },
  { src: `${base}/screenshots/playground-gnata-pipeline.png`, alt: 'Pipeline chaining' },
  { src: `${base}/screenshots/playground-sqlite-dashboard.png`, alt: 'SQLite dashboard query' },
  { src: `${base}/screenshots/playground-sqlite-revenue.png`, alt: 'Revenue aggregation' },
];

export function ScreenshotGallery() {
  const [active, setActive] = useState<number | null>(null);
  const [animRect, setAnimRect] = useState<DOMRect | null>(null);
  const [expanded, setExpanded] = useState(false);
  const thumbRefs = useRef<(HTMLImageElement | null)[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  const open = useCallback((idx: number) => {
    const thumb = thumbRefs.current[idx];
    if (thumb) {
      setAnimRect(thumb.getBoundingClientRect());
    }
    setActive(idx);
    // Trigger expansion on next frame so CSS transition fires
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setExpanded(true));
    });
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    // Wait for transition to finish before removing
    setTimeout(() => {
      setActive(null);
      setAnimRect(null);
    }, 300);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (active === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, close]);

  const border = '#292e42';
  const surface = '#1f2335';
  const muted = '#565f89';

  return (
    <>
      {/* Thumbnail grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        {screenshots.map((shot, i) => (
          <button
            key={shot.src}
            onClick={() => open(i)}
            style={{
              border: `1px solid ${border}`,
              borderRadius: 6,
              overflow: 'hidden',
              cursor: 'pointer',
              padding: 0,
              background: surface,
              display: 'flex',
              flexDirection: 'column',
              transition: 'border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = '#7aa2f7';
              (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = border;
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            }}
          >
            <img
              ref={(el) => { thumbRefs.current[i] = el; }}
              src={shot.src}
              alt={shot.alt}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: muted,
                padding: '5px 8px',
                textAlign: 'center',
                letterSpacing: '0.3px',
              }}
            >
              {shot.alt}
            </span>
          </button>
        ))}
      </div>

      {/* Modal overlay + expanding image */}
      {active !== null && animRect && (
        <div
          ref={overlayRef}
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: expanded ? 'rgba(26, 27, 38, 0.85)' : 'transparent',
            backdropFilter: expanded ? 'blur(8px)' : 'none',
            transition: 'background 0.3s, backdrop-filter 0.3s',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={screenshots[active].src}
            alt={screenshots[active].alt}
            style={{
              position: expanded ? 'relative' : 'fixed',
              // Start at thumbnail position, grow to center
              ...(expanded
                ? {
                    maxWidth: '90vw',
                    maxHeight: '85vh',
                    borderRadius: 8,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                    border: `1px solid ${border}`,
                    transition: 'all 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                  }
                : {
                    top: animRect.top,
                    left: animRect.left,
                    width: animRect.width,
                    height: animRect.height,
                    borderRadius: 6,
                    transition: 'all 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                  }),
            }}
          />
          {expanded && (
            <span
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                color: muted,
                fontSize: 12,
                fontWeight: 500,
                opacity: expanded ? 1 : 0,
                transition: 'opacity 0.3s 0.15s',
              }}
            >
              {screenshots[active].alt} — click anywhere to close
            </span>
          )}
        </div>
      )}
    </>
  );
}
