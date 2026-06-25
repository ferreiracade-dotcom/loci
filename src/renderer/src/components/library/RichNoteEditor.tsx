import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
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
  FileDown
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { api } from '../../lib/api'

const WIKI_RE = /\[\[([^\]\n]+)\]\]/g

interface WikiOpts {
  isValid: (name: string) => boolean
  onOpen: (name: string) => void
}

/** Highlights [[wiki-links]] (valid vs broken) and Ctrl/Cmd-click to open. */
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

export function RichNoteEditor({ path }: { path: string }) {
  const books = useStore((s) => s.books)
  const notes = useStore((s) => s.standaloneNotes)
  const navigateLink = useStore((s) => s.navigateLink)
  const createNote = useStore((s) => s.createNote)

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [exporting, setExporting] = useState(false)
  const fmRef = useRef('')
  const loadingRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live refs so the editor's (stable) extensions see current data.
  const validRef = useRef<(n: string) => boolean>(() => false)
  const openRef = useRef<(n: string) => void>(() => undefined)
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
      const body = fmRef.current ? `${fmRef.current.trimEnd()}\n\n${md}` : md
      await api.saveNote(path, `${body}\n`)
      setStatus('saved')
    },
    [path]
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
      })
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
      const fm = raw.match(/^(---\n[\s\S]*?\n---\n?)/)
      fmRef.current = fm ? fm[1] : ''
      const bodyMd = (fm ? raw.slice(fm[1].length) : raw).replace(/^\s+/, '')
      editor.commands.setContent(bodyMd)
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
        <EditorContent editor={editor} className="note-doc" />
      </div>
    </div>
  )
}
