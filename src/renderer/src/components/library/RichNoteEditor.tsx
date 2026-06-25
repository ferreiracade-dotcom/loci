import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
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
  Check,
  Loader2,
  FileDown,
  Plus,
  Tag as TagIcon
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

// ---------- frontmatter ----------

interface FrontMatter {
  title?: string
  type?: string
  tags: string[]
  /** Other frontmatter lines preserved verbatim. */
  rest: string[]
}

function parseTagList(s: string): string[] {
  const t = s.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    return t
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return t
    .split(/[\s,]+/)
    .map((x) => x.replace(/^#/, ''))
    .filter(Boolean)
}

function parseNote(raw: string): { fm: FrontMatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { fm: { tags: [], rest: [] }, body: raw }
  const fm: FrontMatter = { tags: [], rest: [] }
  for (const line of m[1].split('\n')) {
    const title = line.match(/^title:\s*(.*)$/)
    if (title) {
      fm.title = title[1].trim()
      continue
    }
    const type = line.match(/^type:\s*(.*)$/)
    if (type) {
      fm.type = type[1].trim()
      continue
    }
    const tags = line.match(/^tags:\s*(.*)$/)
    if (tags) {
      fm.tags = parseTagList(tags[1])
      continue
    }
    if (line.trim()) fm.rest.push(line)
  }
  return { fm, body: raw.slice(m[0].length).replace(/^\s+/, '') }
}

function serializeFrontMatter(fm: FrontMatter): string {
  const lines = ['---']
  if (fm.title != null) lines.push(`title: ${fm.title}`)
  if (fm.type != null) lines.push(`type: ${fm.type}`)
  lines.push(`tags: [${fm.tags.join(', ')}]`)
  lines.push(...fm.rest)
  lines.push('---')
  return lines.join('\n')
}

// ---------- wiki-link highlighting ----------

const WIKI_RE = /\[\[([^\]\n]+)\]\]/g

interface WikiOpts {
  isValid: (name: string) => boolean
  onOpen: (name: string) => void
}

const WikiLink = Extension.create<WikiOpts>({
  name: 'wikiLink',
  addOptions() {
    return { isValid: () => false, onOpen: () => undefined }
  },
  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin({
        key: new PluginKey('wikiLink'),
        props: {
          decorations(state) {
            const decos: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              WIKI_RE.lastIndex = 0
              let m: RegExpExecArray | null
              while ((m = WIKI_RE.exec(node.text))) {
                const from = pos + (m.index ?? 0)
                const to = from + m[0].length
                const name = m[1].split('|')[0].split('#')[0].trim()
                decos.push(
                  Decoration.inline(from, to, {
                    class: `tt-wikilink${opts.isValid(name) ? '' : ' broken'}`,
                    'data-link': name
                  })
                )
              }
            })
            return DecorationSet.create(state.doc, decos)
          },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement).closest?.('.tt-wikilink') as HTMLElement | null
            if (el && (event.metaKey || event.ctrlKey)) {
              const name = el.getAttribute('data-link')
              if (name) {
                opts.onOpen(name)
                return true
              }
            }
            return false
          }
        }
      })
    ]
  }
})

// ---------- wiki-link autocomplete ([[ … ) ----------

const WikiSuggest = Extension.create<{ getNames: () => string[] }>({
  name: 'wikiSuggest',
  addOptions() {
    return { getNames: () => [] }
  },
  addProseMirrorPlugins() {
    const getNames = this.options.getNames
    return [
      Suggestion<string>({
        editor: this.editor,
        char: '[[',
        allowSpaces: true,
        startOfLine: false,
        items: ({ query }) => {
          if (query.includes(']')) return []
          const q = query.toLowerCase()
          return getNames()
            .filter((n) => n.toLowerCase().includes(q))
            .slice(0, 8)
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `[[${props}]]`).run()
        },
        render: () => {
          let el: HTMLDivElement | null = null
          let items: string[] = []
          let index = 0
          let pick: (item: string) => void = () => undefined

          const draw = (): void => {
            if (!el) return
            el.innerHTML = ''
            items.forEach((it, i) => {
              const b = document.createElement('button')
              b.className = `wiki-suggest-item${i === index ? ' active' : ''}`
              b.textContent = it
              b.onmousedown = (e): void => {
                e.preventDefault()
                pick(it)
              }
              el?.appendChild(b)
            })
          }
          const place = (rect: DOMRect | null | undefined): void => {
            if (!el || !rect) return
            el.style.left = `${rect.left}px`
            el.style.top = `${rect.bottom + 4}px`
          }
          const close = (): void => {
            el?.remove()
            el = null
          }
          const open = (props: SuggestionProps<string>): void => {
            items = props.items
            index = 0
            pick = props.command
            if (!items.length) {
              close()
              return
            }
            if (!el) {
              el = document.createElement('div')
              el.className = 'wiki-suggest'
              document.body.appendChild(el)
            }
            draw()
            place(props.clientRect?.())
          }

          return {
            onStart: open,
            onUpdate: open,
            onKeyDown: (props: SuggestionKeyDownProps): boolean => {
              if (!el || !items.length) return false
              const k = props.event.key
              if (k === 'ArrowDown') {
                index = (index + 1) % items.length
                draw()
                return true
              }
              if (k === 'ArrowUp') {
                index = (index - 1 + items.length) % items.length
                draw()
                return true
              }
              if (k === 'Enter' || k === 'Tab') {
                const it = items[index]
                if (it) pick(it)
                return true
              }
              if (k === 'Escape') {
                close()
                return true
              }
              return false
            },
            onExit: close
          }
        }
      })
    ]
  }
})

// ---------- component ----------

export function RichNoteEditor({ path }: { path: string }) {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const navigateLink = useStore((s) => s.navigateLink)
  const createNote = useStore((s) => s.createNote)
  const loadStandaloneNotes = useStore((s) => s.loadStandaloneNotes)

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [exporting, setExporting] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [addingTag, setAddingTag] = useState(false)
  const [tagText, setTagText] = useState('')

  const fmRef = useRef<FrontMatter>({ tags: [], rest: [] })
  const loadingRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const validRef = useRef<(n: string) => boolean>(() => false)
  const openRef = useRef<(n: string) => void>(() => undefined)
  const namesRef = useRef<string[]>([])
  namesRef.current = [...books.map((b) => b.title), ...notes.map((n) => n.title)]
  validRef.current = (name) => {
    const ln = name.toLowerCase()
    return (
      books.some((b) => b.title.toLowerCase() === ln) ||
      notes.some((n) => n.title.toLowerCase() === ln)
    )
  }
  openRef.current = (name) => {
    if (validRef.current(name)) void navigateLink(name)
    else if (window.confirm(`“${name}” doesn't exist yet. Create a note for it?`)) void createNote(name)
  }

  const save = useCallback(
    async (ed: Editor) => {
      const md = (ed.storage.markdown.getMarkdown() as string).replace(
        /\\\[\\\[([^\]]*?)\\\]\\\]/g,
        '[[$1]]'
      )
      // Keep the note's title in sync with its first heading (Google-Docs style).
      const h1 = md.match(/^#\s+(.+)$/m)
      if (h1) fmRef.current.title = h1[1].trim()
      const body = `${serializeFrontMatter(fmRef.current)}\n\n${md}\n`
      await api.saveNote(path, body)
      setStatus('saved')
      void loadStandaloneNotes()
    },
    [path, loadStandaloneNotes]
  )

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Markdown.configure({ html: false, transformPastedText: true, breaks: true }),
      WikiLink.configure({
        isValid: (n) => validRef.current(n),
        onOpen: (n) => openRef.current(n)
      }),
      WikiSuggest.configure({ getNames: () => namesRef.current })
    ],
    onUpdate: ({ editor }) => {
      if (loadingRef.current) return
      setStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void save(editor), 800)
    }
  })

  // Load the note when the path changes.
  useEffect(() => {
    if (!editor) return
    let alive = true
    loadingRef.current = true
    void api.readNote(path).then((raw) => {
      if (!alive) return
      const { fm, body } = parseNote(raw)
      fmRef.current = fm
      setTags(fm.tags)
      // Ensure the note opens with its name as a Heading 1.
      const hasH1 = /^#\s+/.test(body)
      const titled = hasH1 ? body : `# ${fm.title ?? 'Untitled'}\n\n${body}`
      editor.commands.setContent(titled)
      setStatus('idle')
      window.setTimeout(() => {
        loadingRef.current = false
      }, 0)
    })
    return () => {
      alive = false
    }
  }, [path, editor])

  // Flush a pending save on unmount / path change.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (editor && !loadingRef.current) void save(editor)
    }
  }, [editor, save])

  const commitTags = (next: string[]): void => {
    setTags(next)
    fmRef.current.tags = next
    if (editor) void save(editor)
  }
  const addTag = (): void => {
    const t = tagText.trim().replace(/^#/, '').toLowerCase()
    setTagText('')
    setAddingTag(false)
    if (t && !tags.includes(t)) commitTags([...tags, t])
  }

  const exportPdf = useCallback(async () => {
    setExporting(true)
    try {
      await api.exportNotePdf({ notePath: path, includeBibliography: true })
    } finally {
      setExporting(false)
    }
  }, [path])

  if (!editor) return <div className="note-editor" />

  const tb = (active: boolean): string => `nt-btn${active ? ' is-active' : ''}`

  return (
    <div className="note-editor rich">
      <div className="note-toolbar">
        <button
          className={tb(editor.isActive('heading', { level: 1 }))}
          title="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={15} />
        </button>
        <button
          className={tb(editor.isActive('heading', { level: 2 }))}
          title="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </button>
        <button
          className={tb(editor.isActive('heading', { level: 3 }))}
          title="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={15} />
        </button>
        <span className="nt-sep" />
        <button
          className={tb(editor.isActive('bold'))}
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </button>
        <button
          className={tb(editor.isActive('italic'))}
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </button>
        <button
          className={tb(editor.isActive('strike'))}
          title="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={15} />
        </button>
        <button
          className={tb(editor.isActive('code'))}
          title="Inline code"
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={15} />
        </button>
        <span className="nt-sep" />
        <button
          className={tb(editor.isActive('bulletList'))}
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </button>
        <button
          className={tb(editor.isActive('orderedList'))}
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </button>
        <button
          className={tb(editor.isActive('blockquote'))}
          title="Blockquote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon size={15} />
        </button>
        <span className="nt-sep" />
        <button title="Export to PDF (with bibliography)" onClick={() => void exportPdf()} disabled={exporting}>
          {exporting ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />}
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
      <div className="note-doc-wrap">
        <div className="note-doc">
          <div className="note-tags">
            <TagIcon size={13} className="note-tags-icon" />
            {tags.map((t) => (
              <span key={t} className="ntag">
                #{t}
                <button title="Remove tag" onClick={() => commitTags(tags.filter((x) => x !== t))}>
                  ×
                </button>
              </span>
            ))}
            {addingTag ? (
              <input
                className="ntag-input"
                autoFocus
                placeholder="tag"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                onBlur={addTag}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTag()
                  else if (e.key === 'Escape') {
                    setTagText('')
                    setAddingTag(false)
                  }
                }}
              />
            ) : (
              <button className="ntag-add" title="Add note tag" onClick={() => setAddingTag(true)}>
                <Plus size={12} /> tag
              </button>
            )}
          </div>
          <EditorContent editor={editor} className="note-doc-content" />
        </div>
      </div>
    </div>
  )
}
