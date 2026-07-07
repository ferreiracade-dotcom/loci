import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Bold, Italic, Strikethrough, Check, X } from 'lucide-react'

/**
 * A compact rich-text editor for a quote body. Bold/italic/strike only (no headings/lists) —
 * quotes are short prose. Stores markdown (`**bold**`, `*italic*`, `~~strike~~`) so it round-trips
 * through the note mirror and drag-to-note unchanged. Mounted only for the card being edited.
 */
export function QuoteBodyEditor({
  value,
  onSave,
  onCancel
}: {
  value: string
  onSave: (markdown: string) => void
  onCancel: () => void
}) {
  const editor = useEditor({
    immediatelyRender: true,
    autofocus: 'end',
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false
      }),
      Markdown.configure({ html: false, transformPastedText: true, breaks: true })
    ],
    content: value
  })

  if (!editor) return null

  const commit = (): void => {
    const md = (editor.storage.markdown.getMarkdown() as string).trim()
    onSave(md)
  }
  const tb = (active: boolean): string => `nt-btn${active ? ' is-active' : ''}`

  return (
    <div
      className="quote-body-editor"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    >
      <div className="qbe-toolbar">
        <button
          className={tb(editor.isActive('bold'))}
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={13} />
        </button>
        <button
          className={tb(editor.isActive('italic'))}
          title="Italic (Ctrl+I)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={13} />
        </button>
        <button
          className={tb(editor.isActive('strike'))}
          title="Strikethrough"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={13} />
        </button>
        <span className="qbe-spacer" />
        <button className="qbe-save" title="Save (Ctrl+Enter)" onClick={commit}>
          <Check size={13} />
        </button>
        <button className="qbe-cancel" title="Cancel (Esc)" onClick={onCancel}>
          <X size={13} />
        </button>
      </div>
      <EditorContent editor={editor} className="qbe-content" />
    </div>
  )
}
