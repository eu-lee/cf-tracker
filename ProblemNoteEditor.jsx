"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TextSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";
import { createClient } from "./lib/supabase/client";

export const IMAGES_BUCKET = "problem-images";
const ACCEPT_IMAGES = "image/png,image/jpeg,image/webp,image/gif";

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

export function normalizeRichContent(value) {
  if (value && typeof value === "object" && value.type === "tiptap" && value.doc) return value.doc;
  if (typeof value === "string") return textToDoc(value);
  return textToDoc("");
}

export function richTextPayload(editor) {
  return {
    type: "tiptap",
    doc: editor.getJSON(),
    text: editor.getText("\n"),
  };
}

export function richTextPlainText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.type === "tiptap") return value.text || "";
  return "";
}

export function richTextIsEmpty(value) {
  return richTextPlainText(value).trim() === "" && !richTextImagePaths(value).length;
}

export function richTextImagePaths(value) {
  const doc = value && typeof value === "object" && value.type === "tiptap" ? value.doc : value;
  const paths = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "problemImage" && typeof node.attrs?.path === "string" && node.attrs.path) {
      paths.add(node.attrs.path);
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  }
  visit(doc);
  return [...paths];
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

function CopyableCodeBlockView({ node }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(node.textContent || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <NodeViewWrapper as="pre" className="problem-code-block">
      <button type="button" className="problem-code-copy" contentEditable={false} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <NodeViewContent as="code" />
    </NodeViewWrapper>
  );
}

const CopyableCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CopyableCodeBlockView);
  },
});

function ProblemImageView({ node, selected }) {
  const path = node.attrs.path;
  const alt = node.attrs.alt || "problem screenshot";
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    const supabase = createClient();
    supabase.storage.from(IMAGES_BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setSrc(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <NodeViewWrapper className={`problem-image-node${selected ? " is-selected" : ""}`} data-path={path}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt={alt} draggable={false} />
        : <span className="problem-image-loading">Loading image...</span>}
    </NodeViewWrapper>
  );
}

const ProblemImage = Node.create({
  name: "problemImage",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-path"),
        renderHTML: (attributes) => attributes.path ? { "data-path": attributes.path } : {},
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("alt"),
        renderHTML: (attributes) => attributes.alt ? { alt: attributes.alt } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-path]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertProblemImage: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProblemImageView);
  },
});

function imageFilesFrom(list) {
  return Array.from(list || []).filter((file) => file.type?.startsWith("image/"));
}

async function insertUploadedImages(view, files, uploadImage) {
  const type = view.state.schema.nodes.problemImage;
  if (!type || !uploadImage) return false;
  for (const file of files) {
    const path = await uploadImage(file);
    if (!path) continue;
    const tr = view.state.tr.replaceSelectionWith(type.create({ path, alt: file.name || "problem screenshot" }));
    view.dispatch(tr.scrollIntoView());
  }
  return true;
}

export function richEditorExtensions({ images = false, mathClicks = true } = {}) {
  const extensions = [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      codeBlock: false,
    }),
    CopyableCodeBlock,
    Mathematics.configure({
      inlineOptions: mathClicks ? {
        onClick: (node, pos) => {
          window.dispatchEvent(new CustomEvent("problem-note-math-click", {
            detail: { kind: "inline", pos, nodeSize: node.nodeSize, latex: node.attrs.latex || "" },
          }));
        },
      } : undefined,
      blockOptions: mathClicks ? {
        onClick: (node, pos) => {
          window.dispatchEvent(new CustomEvent("problem-note-math-click", {
            detail: { kind: "block", pos, nodeSize: node.nodeSize, latex: node.attrs.latex || "" },
          }));
        },
      } : undefined,
      katexOptions: {
        throwOnError: false,
      },
    }),
  ];
  if (images) extensions.push(ProblemImage);
  return extensions;
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
  return richTextPlainText(value);
}

export default function ProblemNoteEditor({
  value,
  onChange,
  enableImages = false,
  onUploadImage,
  ariaLabel = "My notes",
  minHeight,
}) {
  const activeRawMathRef = useRef(null);
  const shellRef = useRef(null);
  const fileRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: richEditorExtensions({ images: enableImages, mathClicks: true }),
    content: normalizeRichContent(value),
    editorProps: {
      attributes: {
        class: "problem-note-editor",
        "aria-label": ariaLabel,
        style: minHeight ? `min-height: ${minHeight}px` : undefined,
      },
      handlePaste(view, event) {
        if (!enableImages || !onUploadImage) return false;
        const files = imageFilesFrom(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        setUploadingImage(true);
        insertUploadedImages(view, files, onUploadImage).finally(() => setUploadingImage(false));
        return true;
      },
      handleDrop(view, event) {
        if (!enableImages || !onUploadImage) return false;
        const files = imageFilesFrom(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords) {
          const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(coords.pos)));
          view.dispatch(tr);
        }
        setUploadingImage(true);
        insertUploadedImages(view, files, onUploadImage).finally(() => setUploadingImage(false));
        return true;
      },
    },
    onCreate({ editor }) {
      if (typeof value === "string" && value.includes("$")) {
        renderMathStrings(editor);
        onChange(richTextPayload(editor));
      }
    },
    onUpdate({ editor }) {
      if (!activeRawMathRef.current && editor.getText().includes("$")) {
        migrateInlineMathStrings(editor);
      }
      onChange(richTextPayload(editor));
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
      if (changed) onChange(richTextPayload(editor));
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

  async function uploadFromPicker(files) {
    if (!editor || !onUploadImage) return;
    setUploadingImage(true);
    try {
      for (const file of imageFilesFrom(files)) {
        const path = await onUploadImage(file);
        if (path) editor.chain().focus().insertProblemImage({ path, alt: file.name || "problem screenshot" }).run();
      }
    } finally {
      setUploadingImage(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
        {enableImages && (
          <>
            <input ref={fileRef} type="file" accept={ACCEPT_IMAGES} hidden onChange={(e) => uploadFromPicker(e.target.files)} />
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={uploadingImage}>
              {uploadingImage ? "..." : "Image"}
            </button>
          </>
        )}
      </div>
      <div onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        activeRawMathRef.current = null;
        renderMathStrings(editor);
        onChange(richTextPayload(editor));
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function ProblemRichTextViewer({ value, emptyText = "No description." }) {
  const hasContent = !richTextIsEmpty(value);
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: richEditorExtensions({ images: true, mathClicks: false }),
    content: normalizeRichContent(value),
    editorProps: {
      attributes: {
        class: "problem-note-editor problem-rich-viewer",
        "aria-label": "Problem details",
      },
    },
  });

  if (!hasContent) {
    return <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{emptyText}</span>;
  }
  if (!editor) {
    return (
      <div className="problem-note-editor-shell problem-rich-viewer-shell">
        <div className="problem-note-editor problem-note-editor-empty">Loading details...</div>
      </div>
    );
  }
  return (
    <div className="problem-note-editor-shell problem-rich-viewer-shell">
      <EditorContent editor={editor} />
    </div>
  );
}
