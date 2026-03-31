import React, { useRef, useEffect } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { tokyoNightTheme } from '../theme/tokyo-night';
import type { CMTokenColors } from '../theme/colors';

export interface JsonataInputProps {
  /** Current JSON value */
  value?: string;
  /** Called when content changes */
  onChange?: (value: string) => void;
  /** Color theme */
  theme?: 'dark' | 'light';
  /** Optional theme color overrides */
  themeOverrides?: Partial<CMTokenColors>;
  /** CSS class name for the container */
  className?: string;
  /** Inline style for the container */
  style?: React.CSSProperties;
}

const defaultStyle: React.CSSProperties = {
  overflow: 'hidden',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  fontSize: '13px',
};

/**
 * JSON input editor component.
 *
 * A CodeMirror 6 editor configured with the JSON language mode
 * and the Tokyo Night theme. Use this for editing the input
 * data that JSONata expressions are evaluated against.
 */
export const JsonataInput = React.memo(function JsonataInput(props: JsonataInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompRef = useRef(new Compartment());
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  // Create editor on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewRef.current) return;

    const extensions: Extension[] = [
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      json(),
      themeCompRef.current.of(tokyoNightTheme(props.theme ?? 'dark', props.themeOverrides)),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({
        doc: props.value ?? '',
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

  // Track internal vs external changes to avoid cursor reset
  const internalChangeRef = useRef(false);
  const originalOnChange = onChangeRef.current;
  onChangeRef.current = (value: string) => {
    internalChangeRef.current = true;
    originalOnChange?.(value);
  };

  // Sync external value — skip if change originated from user typing
  const prevValueRef = useRef(props.value);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (props.value !== undefined && props.value !== prevValueRef.current) {
      prevValueRef.current = props.value;
      if (internalChangeRef.current) {
        internalChangeRef.current = false;
      } else {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: props.value },
        });
      }
    }
  }, [props.value]);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ ...defaultStyle, ...props.style }}
    />
  );
});
