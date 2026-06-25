import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { EditorSelection, RangeSetBuilder } from '@codemirror/state'
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
    '.cm-wikilink': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' },
    '.cm-wikilink-broken': { color: '#d98a76', textDecorationStyle: 'dotted' },
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

const WIKI_RE = /\[\[([^\]\n]+)\]\]/g

function wikiLinkPlugin(validNames: Set<string>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view)
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.sliceDoc(from, to)
          let m: RegExpExecArray | null
          WIKI_RE.lastIndex = 0
          while ((m = WIKI_RE.exec(text))) {
            const start = from + m.index
            const name = m[1].split('|')[0].split('#')[0].trim()
            const exists = validNames.has(name.toLowerCase())
            builder.add(
              start,
              start + m[0].length,
              Decoration.mark({
                class: exists ? 'cm-wikilink' : 'cm-wikilink cm-wikilink-broken',
                attributes: { 'data-link': name }
              })
            )
          }
        }
        return builder.finish()
      }
    },
    { decorations: (v) => v.decorations }
  )
}

export function NoteEditor({ path }: { path: string }) {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const tags = useStore((s) => s.tags)
  const navigateLink = useStore((s) => s.navigateLink)
  const createNote = useStore((s) => s.createNote)

  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const valueRef = useRef('')
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  valueRef.current = value

  useEffect(() => {
    let alive = true
    void api.readNote(path).then((c) => {
      if (!alive) return
      dirtyRef.current = false
      setValue(c)
      setStatus('idle')
    })
    return () => {
      alive = false
    }
  }, [path])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (dirtyRef.current) {
        void api.saveNote(path, valueRef.current)
        dirtyRef.current = false
      }
    }
  }, [path])

  const onChange = useCallback(
    (val: string) => {
      setValue(val)
      dirtyRef.current = true
      setStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void api.saveNote(path, valueRef.current).then(() => {
          dirtyRef.current = false
          setStatus('saved')
        })
      }, 800)
    },
    [path]
  )

  const wrap = useCallback((before: string, after: string = before) => {
    const view = cmRef.current?.view
    if (!view) return
    view.dispatch(
      view.state.changeByRange((range) => ({
        changes: [
          { from: range.from, insert: before },
          { from: range.to, insert: after }
        ],
        range: EditorSelection.range(range.from + before.length, range.to + before.length)
      }))
    )
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
    view.dispatch(
      view.state.changeByRange((range) => {
        const text = view.state.sliceDoc(range.from, range.to) || 'text'
        const insert = `[${text}](url)`
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(range.from + 1, range.from + 1 + text.length)
        }
      })
    )
    view.focus()
  }, [])

  const validNames = useMemo(
    () =>
      new Set([
        ...books.map((b) => b.title.toLowerCase()),
        ...notes.map((n) => n.title.toLowerCase())
      ]),
    [books, notes]
  )
  const completion = useMemo(
    () =>
      makeCompletion(
        [...books.map((b) => b.title), ...notes.map((n) => n.title)],
        tags.map((t) => t.name)
      ),
    [books, notes, tags]
  )
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      autocompletion({ override: [completion] }),
      wikiLinkPlugin(validNames),
      EditorView.domEventHandlers({
        mousedown(e) {
          const el = (e.target as HTMLElement).closest?.('.cm-wikilink') as HTMLElement | null
          if (el && (e.metaKey || e.ctrlKey)) {
            const name = el.getAttribute('data-link')
            if (name) {
              e.preventDefault()
              if (el.classList.contains('cm-wikilink-broken')) {
                // Click-to-fix: create the missing note so the link resolves.
                if (window.confirm(`“${name}” doesn't exist yet. Create a note for it?`)) {
                  void createNote(name)
                }
              } else {
                void navigateLink(name)
              }
              return true
            }
          }
          return false
        }
      })
    ],
    [completion, validNames, navigateLink, createNote]
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
