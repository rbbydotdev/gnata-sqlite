import { useRef, useEffect, useCallback } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { sql, SQLite } from '@codemirror/lang-sql';

const dark = {
  bg: '#1a1b26', fg: '#c0caf5', comment: '#565f89', string: '#9ece6a',
  number: '#ff9e64', keyword: '#bb9af7', func: '#7aa2f7', variable: '#9ece6a',
  operator: '#89ddff', error: '#f7768e', select: '#283457', cursor: '#c0caf5',
  property: '#73daca', bracket: '#698098',
};
const light = {
  bg: '#e1e2e7', fg: '#3760bf', comment: '#848cb5', string: '#587539',
  number: '#b15c00', keyword: '#7847bd', func: '#2e7de9', variable: '#587539',
  operator: '#d20065', error: '#f52a65', select: '#b6bfe2', cursor: '#3760bf',
  property: '#118c74', bracket: '#848cb5',
};

type Colors = typeof dark;

function mkTheme(c: Colors, isDark: boolean) {
  return EditorView.theme({
    '&': { backgroundColor: c.bg, color: c.fg },
    '.cm-content': { caretColor: c.cursor },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.cursor },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      background: c.select + ' !important',
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    },
    '.cm-gutters': {
      backgroundColor: c.bg,
      color: c.comment,
      borderRight: '1px solid ' + (isDark ? '#292e42' : '#c4c8da'),
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  }, { dark: isDark });
}

function mkHL(c: Colors) {
  return HighlightStyle.define([
    { tag: t.keyword, color: c.keyword, fontWeight: '600' },
    { tag: t.operator, color: c.operator },
    { tag: t.string, color: c.string },
    { tag: t.number, color: c.number },
    { tag: t.bool, color: c.number },
    { tag: t.null, color: c.comment },
    { tag: t.blockComment, color: c.comment },
    { tag: t.lineComment, color: c.comment },
    { tag: t.variableName, color: c.fg },
    { tag: t.typeName, color: c.func },
    { tag: t.function(t.variableName), color: c.func },
    { tag: t.special(t.variableName), color: c.variable },
    { tag: t.propertyName, color: c.property },
    { tag: t.paren, color: c.bracket },
    { tag: t.squareBracket, color: c.bracket },
    { tag: t.separator, color: c.comment },
  ]);
}

interface SqlEditorProps {
  initialDoc: string;
  theme: 'dark' | 'light';
  onGetSql: React.MutableRefObject<() => string>;
  onSetSql: React.MutableRefObject<(sql: string) => void>;
  onRun: () => void;
}

export function SqlEditor({ initialDoc, theme, onGetSql, onSetSql, onRun }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompRef = useRef(new Compartment());
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  const isDark = theme === 'dark';

  const getThemeExts = useCallback((d: boolean) => {
    const c = d ? dark : light;
    return [mkTheme(c, d), syntaxHighlighting(mkHL(c))];
  }, []);

  // Mount editor
  useEffect(() => {
    if (!containerRef.current) return;
    const themeComp = themeCompRef.current;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          lineNumbers(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          history(),
          sql({ dialect: SQLite }),
          themeComp.of(getThemeExts(document.documentElement.getAttribute('data-theme') !== 'light')),
          EditorView.domEventHandlers({
            keydown(e) {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onRunRef.current();
                return true;
              }
              return false;
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // initialDoc only used at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getThemeExts]);

  // Expose getSql / setSql via refs
  useEffect(() => {
    onGetSql.current = () => viewRef.current?.state.doc.toString() ?? '';
    onSetSql.current = (text: string) => {
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
      }
    };
  }, [onGetSql, onSetSql]);

  // Update theme
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: themeCompRef.current.reconfigure(getThemeExts(isDark)),
      });
    }
  }, [isDark, getThemeExts]);

  return <div className="sql-editor" ref={containerRef} />;
}
