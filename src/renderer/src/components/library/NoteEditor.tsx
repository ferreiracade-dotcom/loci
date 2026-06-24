import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote as QuoteIcon,
  Code,
  Link as LinkIcon,
  Check,
  Loader2
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

type SaveStatus = 'idle' | 'saving' | 'saved'

const lociTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--text)', height: '100%' },
    '.cm-content': {
      fontFamily: 'var(--font-read)',
      fontSize: '15px',
      caretColor: 'var(--accent)',
      padding: '12px 14px'
    },
    '.cm-scroller': { fontFamily: 'var(--font-read)', lineHeight: '1.6', overflow: 'auto' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--accent-40) !important'
    },
    '.cm-gutters': { display: 'none' },
    '.cm-tooltip': {
      background: 'var(--card)',
      border: '1px solid var(--border-strong)',
      borderRadius: '6px',
      color: 'var(--text)'
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'var(--accent-12)',
      color: 'var(--accent)'
    }
  },
  { dark: true }
)

function makeCompletion(
  wikiTargets: string[],
  tagNames: string[]
): (ctx: CompletionContext) => CompletionResult | null {
  return (ctx) => {
    const wiki = ctx.matchBefore(/\[\[[^\]]*/)
    if (wiki) {
      return {
        from: wiki.from + 2,
        options: wikiTargets.map((label) => ({ label, type: 'text', apply: `${label}]]` })),
        validFor: /[^\]]*/
      }
    }
    const tag = ctx.matchBefore(/#[\w-]*/)
    if (tag && tag.from + 1 <= tag.to) {
      return {
        from: tag.from + 1,
        options: tagNames.map((label) => ({ label, type: 'keyword' })),
        validFor: /[\w-]*/
      }
    }
    return null
  }
}

export function NoteEditor({ bookId }: { bookId: string }) {
  const reloadToken = useStore((s) => s.noteReloadToken)
  const books = useStore((s) => s.books)
  const tags = useStore((s) => s.tags)

  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const pathRef = useRef<string | null>(null)
  const valueRef = useRef('')
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  valueRef.current = value

  // Load the note (and reload when a quote is captured into it).
  useEffect(() => {
    let alive = true
    void api.getBookNote(bookId).then((note) => {
      if (!alive || !note) return
      pathRef.current = note.path
      dirtyRef.current = false
      setValue(note.content)
      setStatus('idle')
    })
    return () => {
      alive = false
    }
  }, [bookId, reloadToken])

  // Flush a pending save when the book changes or the editor unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      if (dirtyRef.current && pathRef.current) {
        void api.saveNote(pathRef.current, valueRef.current)
        dirtyRef.current = false
      }
    }
  }, [bookId])

  const onChange = useCallback((val: string) => {
    setValue(val)
    dirtyRef.current = true
    setStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!pathRef.current) return
      void api.saveNote(pathRef.current, valueRef.current).then(() => {
        dirtyRef.current = false
        setStatus('saved')
      })
    }, 800)
  }, [])

  const wrap = useCallback((before: string, after: string = before) => {
    const view = cmRef.current?.view
    if (!view) return
    const tr = view.state.changeByRange((range) => ({
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: after }
      ],
      range: EditorSelection.range(range.from + before.length, range.to + before.length)
    }))
    view.dispatch(tr)
    view.focus()
  }, [])

  const prefixLines = useCallback((prefix: string) => {
    const view = cmRef.current?.view
    if (!view) return
    const { state } = view
    const seen = new Set<number>()
    const changes: { from: number; insert: string }[] = []
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number
      const last = state.doc.lineAt(range.to).number
      for (let n = first; n <= last; n++) {
        if (seen.has(n)) continue
        seen.add(n)
        changes.push({ from: state.doc.line(n).from, insert: prefix })
      }
    }
    view.dispatch({ changes })
    view.focus()
  }, [])

  const insertLink = useCallback(() => {
    const view = cmRef.current?.view
    if (!view) return
    const tr = view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to) || 'text'
      const insert = `[${text}](url)`
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + 1, range.from + 1 + text.length)
      }
    })
    view.dispatch(tr)
    view.focus()
  }, [])

  const completion = useMemo(
    () => makeCompletion(books.map((b) => b.title), tags.map((t) => t.name)),
    [books, tags]
  )
  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, autocompletion({ override: [completion] })],
    [completion]
  )

  return (
    <div className="note-editor">
      <div className="note-toolbar">
        <button title="Heading 1" onClick={() => prefixLines('# ')}>
          <Heading1 size={15} />
        </button>
        <button title="Heading 2" onClick={() => prefixLines('## ')}>
          <Heading2 size={15} />
        </button>
        <button title="Heading 3" onClick={() => prefixLines('### ')}>
          <Heading3 size={15} />
        </button>
        <span className="nt-sep" />
        <button title="Bold" onClick={() => wrap('**')}>
          <Bold size={15} />
        </button>
        <button title="Italic" onClick={() => wrap('*')}>
          <Italic size={15} />
        </button>
        <button title="Strikethrough" onClick={() => wrap('~~')}>
          <Strikethrough size={15} />
        </button>
        <button title="Inline code" onClick={() => wrap('`')}>
          <Code size={15} />
        </button>
        <span className="nt-sep" />
        <button title="Bullet list" onClick={() => prefixLines('- ')}>
          <List size={15} />
        </button>
        <button title="Numbered list" onClick={() => prefixLines('1. ')}>
          <ListOrdered size={15} />
        </button>
        <button title="Blockquote" onClick={() => prefixLines('> ')}>
          <QuoteIcon size={15} />
        </button>
        <button title="Link" onClick={insertLink}>
          <LinkIcon size={15} />
        </button>
        <span className="note-status">
          {status === 'saving' && (
            <>
              <Loader2 size={13} className="spin" /> Saving…
            </>
          )}
          {status === 'saved' && (
            <>
              <Check size={13} /> Saved
            </>
          )}
        </span>
      </div>
      <div className="note-cm">
        <CodeMirror
          ref={cmRef}
          value={value}
          height="100%"
          theme={lociTheme}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            autocompletion: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false
          }}
          extensions={extensions}
          onChange={onChange}
        />
      </div>
    </div>
  )
}
