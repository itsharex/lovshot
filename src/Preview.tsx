import { useState, useEffect, useRef } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";

const SHARE_TEMPLATES = [
  { id: "caption_below", label: "标准" },
  { id: "card", label: "卡片" },
  { id: "minimal", label: "极简" },
  { id: "social", label: "社交" },
] as const;

type TemplateId = typeof SHARE_TEMPLATES[number]["id"];

export default function Preview() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") || "";
  const mode = params.get("mode") || "preview";
  const isCaptionMode = mode === "caption";

  const [caption, setCaption] = useState("");
  const [template, setTemplate] = useState<TemplateId>("caption_below");
  const [composing, setComposing] = useState(false);
  const captionRef = useRef(caption);
  captionRef.current = caption;

  const handleClose = async () => {
    console.log("[Preview] handleClose called");
    try {
      await getCurrentWindow().close();
      console.log("[Preview] close completed");
    } catch (e) {
      console.error("[Preview] close failed:", e);
    }
  };

  const handleClick = async () => {
    if (!isCaptionMode) {
      await handleClose();
    }
  };

  useEffect(() => {
    if (!isCaptionMode) return;

    const onKeyDown = async (e: KeyboardEvent) => {
      console.log("[Preview] keydown:", e.key);
      if (e.key === "Escape") {
        e.preventDefault();
        console.log("[Preview] ESC pressed, closing...");
        try {
          await getCurrentWindow().close();
        } catch (err) {
          console.error("[Preview] ESC close failed:", err);
        }
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Trigger copy with current template
        handleCopyComposed();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCaptionMode, path]);

  const handleCopyComposed = async () => {
    if (composing) return;
    const text = captionRef.current.trim();
    if (!text) return;
    setComposing(true);
    try {
      console.log("[Preview] Composing with template:", template);
      await invoke("compose_share", {
        sourcePath: path,
        caption: text,
        template,
      });
      console.log("[Preview] Share image composed and copied");
    } catch (err) {
      console.error("[Preview] compose_share failed:", err);
    } finally {
      setComposing(false);
    }
  };

  if (isCaptionMode) {
    return (
      <div className={`share-preview template-${template}`}>
        {/* Live preview area */}
        <div className="share-preview-content" data-tauri-drag-region>
          {template === "social" && caption && (
            <div className="preview-caption-top">{caption}</div>
          )}
          <div className="preview-image-wrapper">
            {path && <img src={convertFileSrc(path)} alt="Screenshot" />}
          </div>
          {template !== "social" && caption && (
            <div className="preview-caption-bottom">{caption}</div>
          )}
          {template === "social" && (
            <div className="preview-watermark">via lovshot</div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="share-controls">
          <div className="template-tabs">
            {SHARE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`template-tab${template === t.id ? " active" : ""}`}
                onClick={() => setTemplate(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            className="caption-input"
            placeholder="添加说明文字…"
            value={caption}
            onChange={(e) => {
              const val = e.target.value;
              setCaption(val);
              emit("caption-typing", { path, caption: val });
            }}
            autoFocus
          />
          <div className="share-footer">
            <span className="share-hint">
              <kbd>⌘</kbd><kbd>↵</kbd> 复制 · <kbd>esc</kbd> 关闭
            </span>
            <div className="share-actions">
              <button
                className="share-btn secondary"
                onClick={() => invoke("copy_image_to_clipboard", { path })}
                title="仅复制原图"
              >
                原图
              </button>
              <button
                className="share-btn"
                onClick={handleCopyComposed}
                disabled={composing || !caption.trim()}
              >
                {composing ? "生成中…" : "复制"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-container" onClick={handleClick}>
      {path && <img src={convertFileSrc(path)} alt="Screenshot" />}
      <div className="preview-label">已保存到剪贴板</div>
    </div>
  );
}
