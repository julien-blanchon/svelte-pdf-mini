---
'svelte-pdf-mini': minor
---

Emoji notes. A note can show an emoji instead of the speech-bubble icon.

- **Model:** `NoteAnnotation.emoji` (one grapheme). The PDF keeps it exactly in svelte-pdf-mini's private data. `/Name` gets the closest standard icon (💬 Comment, 🤔 Help, 💡 Key, 📌 Note, anything else Comment, see `noteIconFor`), so Preview and Acrobat show a sensible icon. The appearance stream is still the colored speech bubble, because a color emoji can't be drawn with the standard PDF fonts.
- **Store:** the `noteEmojis` option (`Annotations.Root` prop) enables it, e.g. `noteEmojis={defaultNoteEmojis}` (💬 🤔 💡 🤯 🧐 🤨 😍 📌). When the note tool is active, or the selected (or just created) annotations are notes, keys 1–8 pick an emoji instead of a color, and `store.pickingNoteEmoji` is true. `store.noteEmoji` (bindable `noteEmoji`, `onNoteEmojiChange`) is the emoji new notes get, `store.pickNoteEmoji(emoji)` picks one, and `store.setNoteEmoji(ids, emoji)` changes notes. Without `noteEmojis`, nothing changes.
- **UI:** `Annotations.NoteEmoji` is a toolbar button for one emoji. The emoji shows on the page marker (scaled with the zoom), in `Annotations.Margin` notes and markers, and in the default hover card and list. Snippets get it as `emoji`. `toMarkdown` writes it in place of the color. `isSingleEmoji(value)` validates user input.
