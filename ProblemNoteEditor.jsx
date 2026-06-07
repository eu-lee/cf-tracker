"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TextSelection } from "@tiptap/pm/state";
import { useEffect, useRef } from "react";

function textToDoc(text = "") {
  const lines = text.split(/\n{2,}/);
  const content = lines.map((line) => {
    const trimmed = line.trimEnd();
    return trimmed
      ? { type: "paragraph", content: [{ type: "text", text: trimmed }] }
      : { type: "paragraph" };
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function normalizeContent(value) {
  if (value && typeof value === "object" && value.type === "tiptap" && value.doc) return value.doc;
  if (typeof value === "string") return textToDoc(value);
  return textToDoc("");
}

function savePayload(editor) {
  return {
    type: "tiptap",
    doc: editor.getJSON(),
    text: editor.getText("\n"),
  };
}

function preserveSelection(tr, from) {
  const mapped = Math.max(0, Math.min(tr.mapping.map(from), tr.doc.content.size));
  tr.setSelection(TextSelection.near(tr.doc.resolve(mapped), -1));
}

// `skipCursor` keeps the one raw box being edited untouched: any match whose
// delimiters straddle the cursor is left as raw so only that box stays open.
function migrateInlineMathStrings(editor, skipCursor = null) {
  const { inlineMath } = editor.schema.nodes;
  if (!inlineMath) return false;

  const replacements = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text || !node.text.includes("$")) return;

    const matches = node.text.matchAll(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g);
    for (const match of matches) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const latex = match[1].trim();
      if (!latex) continue;
      const from = pos + start;
      const to = pos + end;
      if (skipCursor != null && skipCursor > from && skipCursor < to) continue;
      replacements.push({ from, to, latex });
    }
  });

  if (!replacements.length) return false;

  const selectionFrom = editor.state.selection.from;
  const tr = editor.state.tr;
  replacements.reverse().forEach(({ from, to, latex }) => {
    tr.replaceWith(from, to, inlineMath.create({ latex }));
  });
  preserveSelection(tr, selectionFrom);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

function migrateBlockMathStrings(editor, skipCursor = null) {
  const { blockMath } = editor.schema.nodes;
  if (!blockMath) return false;

  const replacements = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return;
    const text = node.textContent.trim();
    const match = text.match(/^\$\$([\s\S]+)\$\$$/);
    if (!match) return;
    if (skipCursor != null && skipCursor > pos && skipCursor < pos + node.nodeSize) return;
    replacements.push({ pos, size: node.nodeSize, latex: match[1].trim() });
  });

  if (!replacements.length) return false;

  const selectionFrom = editor.state.selection.from;
  const tr = editor.state.tr;
  replacements.reverse().forEach(({ pos, size, latex }) => {
    tr.replaceWith(pos, pos + size, blockMath.create({ latex }));
  });
  preserveSelection(tr, selectionFrom);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

function renderMathStrings(editor, skipCursor = null) {
  const inline = migrateInlineMathStrings(editor, skipCursor);
  const block = migrateBlockMathStrings(editor, skipCursor);
  return inline || block;
}

function selectionInsideRawMath(editor, kind) {
  const { $from } = editor.state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return false;

  const text = parent.textContent;
  // Measure the cursor in the same coordinate space as `text`: rendered math are
  // atom nodes (0 chars in textContent but 1 ProseMirror position each), so
  // parentOffset would drift right of the string index whenever earlier inline
  // math exists in this block. textBetween skips atoms exactly like textContent.
  const offset = parent.textBetween(0, $from.parentOffset, "").length;

  if (kind === "block") {
    return text.startsWith("$$") && text.endsWith("$$") && offset >= 2 && offset <= text.length - 2;
  }

  const matches = text.matchAll(/\$(?!\$)([^$]*)\$(?!\$)/g);
  for (const match of matches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) return true;
  }

  return false;
}

export function notePlainText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.type === "tiptap") return value.text || "";
  return "";
}

export default function ProblemNoteEditor({ value, onChange }) {
  const activeRawMathRef = useRef(null);
  const shellRef = useRef(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Mathematics.configure({
        inlineOptions: {
          onClick: (node, pos) => {
            window.dispatchEvent(new CustomEvent("problem-note-math-click", {
              detail: { kind: "inline", pos, nodeSize: node.nodeSize, latex: node.attrs.latex || "" },
            }));
          },
        },
        blockOptions: {
          onClick: (node, pos) => {
            window.dispatchEvent(new CustomEvent("problem-note-math-click", {
              detail: { kind: "block", pos, nodeSize: node.nodeSize, latex: node.attrs.latex || "" },
            }));
          },
        },
        katexOptions: {
          throwOnError: false,
        },
      }),
    ],
    content: normalizeContent(value),
    editorProps: {
      attributes: {
        class: "problem-note-editor",
        "aria-label": "My notes",
      },
    },
    onCreate({ editor }) {
      if (typeof value === "string" && value.includes("$")) {
        renderMathStrings(editor);
        onChange(savePayload(editor));
      }
    },
    onUpdate({ editor }) {
      if (!activeRawMathRef.current && editor.getText().includes("$")) {
        migrateInlineMathStrings(editor);
      }
      onChange(savePayload(editor));
    },
  });

  useEffect(() => {
    if (!editor) return undefined;
    function unwrapMath(kind, pos, nodeSize, latex) {
      const raw = kind === "block" ? `$$${latex}$$` : `$${latex}$`;
      const bodyStart = pos + (kind === "block" ? 2 : 1);
      const cursorPos = bodyStart + latex.length;
      // Set before dispatching: onUpdate fires synchronously inside run(), and its
      // migrate-back guard checks this ref — leaving it unset re-renders the raw text.
      activeRawMathRef.current = { kind };
      editor
        .chain()
        .focus()
        .insertContentAt({ from: pos, to: pos + nodeSize }, raw)
        .setTextSelection(cursorPos)
        .run();
    }

    function editMath(event) {
      const { kind, pos, nodeSize, latex } = event.detail;
      unwrapMath(kind, pos, nodeSize, latex);
    }

    function editMathOnMouseDown(event) {
      const target = event.target instanceof Element
        ? event.target.closest(".tiptap-mathematics-render")
        : null;
      if (!target || !shellRef.current?.contains(target)) return;

      const kind = target.getAttribute("data-type") === "block-math" ? "block" : "inline";
      const latex = target.getAttribute("data-latex") || "";
      const coords = { left: event.clientX, top: event.clientY };
      const posAtCoords = editor.view.posAtCoords(coords);
      if (!posAtCoords) return;

      const $pos = editor.state.doc.resolve(posAtCoords.pos);
      const mathPos = kind === "block" ? $pos.before($pos.depth) : posAtCoords.inside;
      const node = editor.state.doc.nodeAt(mathPos);
      if (!node || (kind === "block" && node.type.name !== "blockMath") || (kind === "inline" && node.type.name !== "inlineMath")) return;

      event.preventDefault();
      event.stopPropagation();
      unwrapMath(kind, mathPos, node.nodeSize, latex);
    }

    const shell = shellRef.current;
    window.addEventListener("problem-note-math-click", editMath);
    shell?.addEventListener("mousedown", editMathOnMouseDown, true);
    return () => {
      window.removeEventListener("problem-note-math-click", editMath);
      shell?.removeEventListener("mousedown", editMathOnMouseDown, true);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return undefined;

    function renderWhenMathLosesSelection({ editor }) {
      // Re-render every raw box except the one the cursor sits in, so moving off a
      // box (including by opening another) collapses it back to rendered math.
      const cursor = editor.state.selection.from;
      const changed = renderMathStrings(editor, cursor);

      if (!selectionInsideRawMath(editor, "inline") && !selectionInsideRawMath(editor, "block")) {
        activeRawMathRef.current = null;
      }
      if (changed) onChange(savePayload(editor));
    }

    editor.on("selectionUpdate", renderWhenMathLosesSelection);
    return () => editor.off("selectionUpdate", renderWhenMathLosesSelection);
  }, [editor, onChange]);

  function insertInlineMath() {
    const pos = editor?.state.selection.from;
    if (pos == null) return;
    activeRawMathRef.current = { kind: "inline" };
    editor.chain().focus().insertContent("$$").setTextSelection(pos + 1).run();
  }

  function insertBlockMath() {
    const pos = editor?.state.selection.from;
    if (pos == null) return;
    activeRawMathRef.current = { kind: "block" };
    editor.chain().focus().insertContent("$$$$").setTextSelection(pos + 2).run();
  }

  if (!editor) {
    return (
      <div className="problem-note-editor-shell">
        <div className="problem-note-editor problem-note-editor-empty">Loading notes...</div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="problem-note-editor-shell"
      onMouseDown={(e) => {
        if (e.target.closest(".problem-note-toolbar")) return;
        if (!editor.isFocused) editor.chain().focus().run();
      }}
    >
      <div className="problem-note-toolbar" aria-label="Note formatting toolbar">
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleBold().run()} aria-pressed={editor.isActive("bold")}>B</button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleItalic().run()} aria-pressed={editor.isActive("italic")}>I</button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleCode().run()} aria-pressed={editor.isActive("code")}>{"</>"}</button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleBulletList().run()} aria-pressed={editor.isActive("bulletList")}>List</button>
        <button type="button" className="btn" onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-pressed={editor.isActive("codeBlock")}>Code</button>
        <button type="button" className="btn" onClick={insertInlineMath}>$x$</button>
        <button type="button" className="btn" onClick={insertBlockMath}>$$</button>
      </div>
      <div onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        activeRawMathRef.current = null;
        renderMathStrings(editor);
        onChange(savePayload(editor));
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
