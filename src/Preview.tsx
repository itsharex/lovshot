import { useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Preview() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") || "";
  const mode = params.get("mode") || "preview";
  const isCaptionMode = mode === "caption";

  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);

  const handleClick = async () => {
    if (!isCaptionMode) {
      await getCurrentWindow().destroy();
    }
  };

  const handleSave = () => {
    if (!caption.trim()) {
      getCurrentWindow().destroy();
      return;
    }

    console.log("[Preview] handleSave called");

    // Fire the command without waiting
    invoke("save_caption", { path, caption: caption.trim() }).catch(console.error);

    // Close immediately
    console.log("[Preview] Closing window now");
    getCurrentWindow().destroy();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      getCurrentWindow().destroy();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  if (isCaptionMode) {
    return (
      <div className="caption-container" onKeyDown={handleKeyDown}>
        <div className="caption-image-wrapper">
          {path && <img src={convertFileSrc(path)} alt="Screenshot" />}
        </div>
        <div className="caption-input-area">
          <textarea
            className="caption-input"
            placeholder="添加图片描述..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            autoFocus
          />
          <div className="caption-actions">
            <span className="caption-hint">⌘+Enter 保存</span>
            <button className="caption-btn caption-btn-cancel" onClick={() => getCurrentWindow().destroy()}>
              跳过
            </button>
            <button className="caption-btn caption-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </button>
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
