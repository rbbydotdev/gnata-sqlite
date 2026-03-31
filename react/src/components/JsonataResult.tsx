import React, { useRef, useEffect } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { tokyoNightTheme } from '../theme/tokyo-night';
import type { CMTokenColors } from '../theme/colors';
import { darkColors, lightColors } from '../theme/colors';

export interface JsonataResultProps {
  /** Result text to display */
  value?: string;
  /** Error message (displayed in red) */
  error?: string | null;
  /** Formatted timing string */
  timing?: string;
  /** Color theme */
  theme?: 'dark' | 'light';
  /** Optional theme color overrides */
  themeOverrides?: Partial<CMTokenColors>;
  /** CSS class name for the container */
  className?: string;
  /** Inline style for the container */
  style?: React.CSSProperties;
  /** Whether to show the timing badge (default: true) */
  showTiming?: boolean;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  fontSize: '13px',
  position: 'relative',
};

/**
 * Read-only result display component.
 *
 * Shows the evaluation result in green (success) or red (error)
 * using a read-only CodeMirror instance with JSON syntax highlighting.
 */
export const JsonataResult = React.memo(function JsonataResult(props: JsonataResultProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompRef = useRef(new Compartment());

  const isDark = (props.theme ?? 'dark') === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const hasError = Boolean(props.error);
  const displayText = hasError ? (props.error ?? '') : (props.value ?? '');
  const contentColor = hasError ? colors.error : colors.green;

  // Create editor on mount
  useEffect(() => {
    const container = editorWrapRef.current;
    if (!container || viewRef.current) return;

    const extensions: Extension[] = [
      keymap.of(defaultKeymap),
      json(),
      themeCompRef.current.of(tokyoNightTheme(props.theme ?? 'dark', props.themeOverrides)),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    const view = new EditorView({
      state: EditorState.create({
        doc: displayText,
        extensions,
      }),
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Update theme
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(
        tokyoNightTheme(props.theme ?? 'dark', props.themeOverrides),
      ),
    });
  }, [props.theme, props.themeOverrides]);

  // Update content
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== displayText) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: displayText },
      });
    }
  }, [displayText]);

  const showTiming = props.showTiming !== false;

  return (
    <div ref={containerRef} className={props.className} style={{ ...containerStyle, ...props.style }}>
      {showTiming && props.timing && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 12,
            zIndex: 10,
            fontSize: '12px',
            fontFamily: "'SF Mono', monospace",
            color: colors.accent,
            background: colors.surface,
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${colors.border}`,
          }}
        >
          {props.timing}
        </div>
      )}
      <div
        ref={editorWrapRef}
        className={hasError ? 'gnata-result-error' : 'gnata-result-success'}
        style={{ flex: 1, overflow: 'hidden' }}
      />
      <style>{`
        .gnata-result-error .cm-editor .cm-content { color: ${contentColor} !important; }
        .gnata-result-success .cm-editor .cm-content { color: ${contentColor} !important; }
      `}</style>
    </div>
  );
});
