import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

interface ExportDialogProps {
  folderPath: string | null;
  folderName: string;
  onClose: () => void;
  onExported: (path: string) => void;
}

const FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown", example: "![caption](path)" },
  { value: "writing", label: "Writing", example: "caption：\n![](path)" },
  { value: "html", label: "HTML", example: '<img src="..." />' },
  { value: "url_only", label: "URL Only", example: "/path/to/image.png" },
];

type ViewMode = "raw" | "preview" | "split";

export default function ExportDialog({ folderPath, folderName, onClose, onExported }: ExportDialogProps) {
  const [format, setFormat] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

  // Load default format from settings
  useEffect(() => {
    invoke<string>("get_image_export_format").then(setFormat).catch(() => setFormat("markdown"));
  }, []);

  const loadPreview = useCallback(async () => {
    if (!format) return;
    setLoading(true);
    try {
      const content = await invoke<string>("preview_folder_export", {
        folderPath,
        format,
      });
      setPreview(content);
    } catch (e) {
      setPreview(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [folderPath, format]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const path = await invoke<string>("export_folder_to_md", {
        folderPath,
        format,
      });
      onExported(path);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(preview);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  // Transform content to markdown format (convert HTML/URL formats to markdown)
  const transformedContent = useMemo(() => {
    if (!preview) return "";

    let content = preview;

    // Handle HTML img tags: <img src="path" alt="alt" /> -> ![alt](path)
    content = content.replace(/<img src="([^"]+)" alt="([^"]*)" \/>/g, (_, path, alt) => {
      return `![${alt}](${path})`;
    });

    // Handle plain paths (url_only format): lines that are just file paths -> ![](path)
    content = content.replace(/^(\/[^\s]+\.(?:png|jpg|jpeg|gif))$/gm, (_, path) => {
      return `![](${path})`;
    });

    return content;
  }, [preview]);

  const renderRawPane = () => (
    <pre className="export-pane export-pane-raw">
      {loading ? "Loading..." : preview || "(empty)"}
    </pre>
  );

  // Parse markdown images and render them manually
  const renderImages = useMemo(() => {
    if (!transformedContent) return [];

    const elements: React.ReactNode[] = [];
    const lines = transformedContent.split("\n");

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Match ![alt](path)
      const match = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/);
      if (match) {
        const [, alt, path] = match;
        const imgSrc = path.startsWith("/") ? convertFileSrc(path) : path;
        elements.push(
          <div key={i} className="preview-image-block">
            {alt && <p className="preview-image-caption">{alt}</p>}
            <img src={imgSrc} alt={alt || ""} loading="lazy" />
          </div>
        );
      } else if (!trimmed.startsWith("!")) {
        // Regular text (like caption in writing mode)
        elements.push(
          <p key={i} className="preview-text-line">{trimmed}</p>
        );
      }
    });

    return elements;
  }, [transformedContent]);

  const renderPreviewPane = () => (
    <div className="export-pane export-pane-preview">
      {loading ? "Loading..." : renderImages.length > 0 ? renderImages : "(empty)"}
    </div>
  );

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className={`export-dialog ${viewMode === "split" ? "export-dialog-wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog-header">
          <h3>Export: {folderName || "All Images"}</h3>
          <button className="export-dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="export-dialog-body">
          <div className="export-toolbar">
            <div className="export-format-selector">
              <label>Format:</label>
              <div className="export-format-options">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`export-format-btn ${format === opt.value ? "active" : ""}`}
                    onClick={() => setFormat(opt.value)}
                    title={opt.example}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="export-view-toggle">
              <button
                className={`btn-small ${viewMode === "raw" ? "active" : ""}`}
                onClick={() => setViewMode("raw")}
              >
                Raw
              </button>
              <button
                className={`btn-small ${viewMode === "preview" ? "active" : ""}`}
                onClick={() => setViewMode("preview")}
              >
                Preview
              </button>
              <button
                className={`btn-small ${viewMode === "split" ? "active" : ""}`}
                onClick={() => setViewMode("split")}
              >
                Split
              </button>
            </div>
          </div>

          <div className={`export-content ${viewMode === "split" ? "export-content-split" : ""}`}>
            {viewMode === "raw" && renderRawPane()}
            {viewMode === "preview" && renderPreviewPane()}
            {viewMode === "split" && (
              <>
                {renderRawPane()}
                {renderPreviewPane()}
              </>
            )}
          </div>
        </div>

        <div className="export-dialog-footer">
          <button className="btn-small" onClick={handleCopyToClipboard}>
            Copy
          </button>
          <div className="export-dialog-footer-right">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting || !preview}
            >
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
