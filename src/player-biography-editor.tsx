import { useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { manualSourceUrl } from '../shared/club-sources';
import { maxBiographyHtml } from '../shared/player-biography';
import { api, ApiError, body } from './api';
import { ErrorMessage } from './components';

const extensions = [StarterKit.configure({
  blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false,
  heading: { levels: [3, 4] },
  link: { autolink: false, linkOnPaste: false, openOnClick: false,
    isAllowedUri: url => manualSourceUrl.safeParse(url).success,
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  },
})];

export default function BiographyEditor({ id, version, html, onClose }: { id: string; version: number; html: string; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [initial] = useState({ version, html });
  const [url, setUrl] = useState('');
  const [invalidLink, setInvalidLink] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const editor = useEditor({
    extensions, content: initial.html, injectCSS: false, immediatelyRender: false,
    editorProps: {
      attributes: { class: 'player-rich-text player-rich-editor', role: 'textbox', 'aria-label': t('biographyText'), 'aria-multiline': 'true' },
      handleDOMEvents: {
        paste(view, event) {
          event.preventDefault();
          const text = event.clipboardData?.getData('text/plain');
          if (text && text.length <= maxBiographyHtml) view.pasteText(text, event);
          if (text && text.length > maxBiographyHtml) setTooLong(true);
          return true;
        },
        drop(_view, event) { event.preventDefault(); return true; },
      },
    },
  });
  const active = useEditorState({ editor, selector: ({ editor }) => ({
    heading: editor?.isActive('heading', { level: 3 }), subheading: editor?.isActive('heading', { level: 4 }),
    bold: editor?.isActive('bold'), italic: editor?.isActive('italic'), bullet: editor?.isActive('bulletList'), ordered: editor?.isActive('orderedList'),
  }) });
  const save = useMutation({
    mutationFn: (content: string) => api(`/api/players/${id}/biography`, { method: 'PATCH', body: body({ version: initial.version, html: content }) }),
    onSuccess: () => { void client.invalidateQueries(); onClose(); },
  });
  if (!editor) return <p role="status">{t('loading')}</p>;

  const controls = [
    { name: 'bioHeading', pressed: active?.heading, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { name: 'bioSubheading', pressed: active?.subheading, run: () => editor.chain().focus().toggleHeading({ level: 4 }).run() },
    { name: 'bioBold', pressed: active?.bold, run: () => editor.chain().focus().toggleBold().run() },
    { name: 'bioItalic', pressed: active?.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { name: 'bioBulletList', pressed: active?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'bioNumberedList', pressed: active?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
  ] as const;

  function addLink() {
    if (!editor) return;
    const link = manualSourceUrl.safeParse(url.trim());
    setInvalidLink(!link.success);
    if (!link.success) return;
    const href = new URL(link.data).href;
    const command = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) command.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    else command.extendMarkRange('link').setLink({ href }).run();
    setUrl('');
  }

  return <form onSubmit={event => {
    event.preventDefault();
    const content = editor.isEmpty ? '' : editor.getHTML();
    setTooLong(content.length > maxBiographyHtml);
    if (content.length <= maxBiographyHtml) save.mutate(content);
  }}>
    <div role="group" aria-label={t('bioFormatting')} className="flex gap-2 flex-wrap mb-3">
      {controls.map(control => <button key={control.name} type="button" className="secondary" aria-pressed={!!control.pressed} onClick={control.run}>{t(control.name)}</button>)}
    </div>
    <EditorContent editor={editor} />
    <div className="flex gap-2 flex-wrap items-end mt-3">
      <label className="field flex-1 !mb-0">{t('bioLinkAddress')}<input type="text" inputMode="url" value={url} maxLength={2048}
        onChange={event => { setUrl(event.currentTarget.value); setInvalidLink(false); }} /></label>
      <button type="button" className="secondary" onClick={addLink} disabled={!url.trim()}>{t('bioAddLink')}</button>
      <button type="button" className="secondary" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>{t('bioRemoveLink')}</button>
    </div>
    {invalidLink && <p className="error" role="alert">{t('bioInvalidLink')}</p>}
    {(tooLong || (save.error instanceof ApiError && save.error.code === 'BIOGRAPHY_TOO_LONG')) && <p className="error" role="alert">{t('bioTooLong')}</p>}
    {save.isError && (save.error instanceof ApiError && save.error.status === 409 ? <p className="error" role="alert">{t('contextChanged')}</p>
      : !(save.error instanceof ApiError && save.error.code === 'BIOGRAPHY_TOO_LONG') && <ErrorMessage />)}
    <div className="form-footer"><button className="primary" disabled={save.isPending}>{t('save')}</button></div>
  </form>;
}
