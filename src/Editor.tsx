import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface RecordingInfo {
  frame_count: number;
  width: number;
  height: number;
  fps: number;
  duration_ms: number;
  has_frames: boolean;
}

interface ExportConfig {
  start_frame: number;
  end_frame: number;
  output_scale: number;
  target_fps: number;
  loop_mode: string;
  quality: number;
  speed: number;
  output_path: string | null;
}

interface SizeEstimate {
  frame_count: number;
  output_width: number;
  output_height: number;
  estimated_bytes: number;
  formatted: string;
}

interface SaveResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

interface ExportProgress {
  current: number;
  total: number;
  stage: string;
}

interface ResolutionPreset {
  label: string;
  height: number;
  scale: number;
}

export default function Editor() {
  const [recordingInfo, setRecordingInfo] = useState<RecordingInfo | null>(null);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    start_frame: 0,
    end_frame: 0,
    output_scale: 1,
    target_fps: 10,
    loop_mode: "infinite",
    quality: 80,
    speed: 1,
    output_path: null,
  });
  const [sizeEstimate, setSizeEstimate] = useState<SizeEstimate | null>(null);
  const [filmstrip, setFilmstrip] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [savedPath, setSavedPath] = useState("");

  const filmstripRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const [previewFrame, setPreviewFrame] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const resolutionPresets = useMemo<ResolutionPreset[]>(() => {
    if (!recordingInfo) return [];

    const { width, height } = recordingInfo;
    const presets: ResolutionPreset[] = [
      { label: `原始 (${width}×${height})`, height, scale: 1 },
    ];

    const standardHeights = [
      { h: 1080, label: "1080p" },
      { h: 720, label: "720p" },
      { h: 480, label: "480p" },
      { h: 360, label: "360p" },
      { h: 240, label: "240p" },
    ];

    for (const { h, label } of standardHeights) {
      if (h < height) {
        const scale = h / height;
        const scaledWidth = Math.round(width * scale);
        presets.push({
          label: `${label} (${scaledWidth}×${h})`,
          height: h,
          scale,
        });
      }
    }

    return presets;
  }, [recordingInfo]);

  const updateSizeEstimate = useCallback(async (config: ExportConfig) => {
    try {
      const estimate = await invoke<SizeEstimate>("estimate_export_size", { config });
      setSizeEstimate(estimate);
    } catch (e) {
      console.error("估算体积失败:", e);
    }
  }, []);

  // Load recording info on mount
  useEffect(() => {
    const loadRecordingInfo = async () => {
      try {
        const info = await invoke<RecordingInfo>("get_recording_info");
        setRecordingInfo(info);
        const initialConfig: ExportConfig = {
          start_frame: 0,
          end_frame: info.frame_count,
          output_scale: 1,
          target_fps: 10,
          loop_mode: "infinite",
          quality: 80,
          speed: 1,
          output_path: null,
        };
        setExportConfig(initialConfig);
        setPreviewFrame(0);
        updateSizeEstimate(initialConfig);

        if (info.frame_count > 0) {
          invoke<string[]>("get_filmstrip", { count: 12, thumbHeight: 40 })
            .then(setFilmstrip)
            .catch((e) => console.error("加载filmstrip失败:", e));
        }
      } catch (e) {
        console.error("获取录制信息失败:", e);
      }
    };

    loadRecordingInfo();
  }, [updateSizeEstimate]);

  // Listen for export events
  useEffect(() => {
    const unlistenExport = listen<SaveResult>("export-complete", (event) => {
      setExporting(false);
      setExportProgress(null);
      if (event.payload.success && event.payload.path) {
        setSavedPath(event.payload.path);
      } else if (event.payload.error) {
        console.error("导出失败:", event.payload.error);
      }
    });

    const unlistenProgress = listen<ExportProgress>("export-progress", (event) => {
      setExportProgress(event.payload);
    });

    return () => {
      unlistenExport.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (recordingInfo) {
      updateSizeEstimate(exportConfig);
    }
  }, [exportConfig, recordingInfo, updateSizeEstimate]);

  const handleExport = async () => {
    try {
      const path = await save({
        defaultPath: `recording_${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}.gif`,
        filters: [{ name: "GIF", extensions: ["gif"] }],
      });

      if (!path) return;

      setExporting(true);
      await invoke("export_gif", { config: { ...exportConfig, output_path: path } });
    } catch (e) {
      console.error("导出失败:", e);
      setExporting(false);
    }
  };

  useEffect(() => {
    if (previewFrame === null || !recordingInfo) {
      setPreviewImage(null);
      return;
    }

    let cancelled = false;
    invoke<string>("get_frame_thumbnail", { frameIndex: previewFrame, maxHeight: 200 })
      .then((img) => {
        if (!cancelled) setPreviewImage(img);
      })
      .catch((e) => console.error("Failed to get preview:", e));

    return () => { cancelled = true; };
  }, [previewFrame, recordingInfo]);

  const getFrameFromX = useCallback((clientX: number): number => {
    if (!filmstripRef.current || !recordingInfo) return 0;
    const rect = filmstripRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * recordingInfo.frame_count);
  }, [recordingInfo]);

  const handleFilmstripMouseDown = useCallback((e: React.MouseEvent, handle: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
  }, []);

  const handleFilmstripHover = useCallback((e: React.MouseEvent) => {
    if (dragging) return; // Don't interfere with handle dragging
    const frame = getFrameFromX(e.clientX);
    setPreviewFrame(Math.min(frame, (recordingInfo?.frame_count ?? 1) - 1));
  }, [getFrameFromX, recordingInfo, dragging]);

  useEffect(() => {
    if (!dragging || !recordingInfo) return;

    const handleMouseMove = (e: MouseEvent) => {
      const frame = getFrameFromX(e.clientX);
      if (dragging === "start") {
        const newStart = Math.max(0, Math.min(frame, exportConfig.end_frame - 1));
        setExportConfig((c) => ({ ...c, start_frame: newStart }));
      } else {
        const newEnd = Math.min(recordingInfo.frame_count, Math.max(frame, exportConfig.start_frame + 1));
        setExportConfig((c) => ({ ...c, end_frame: newEnd }));
      }
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, recordingInfo, exportConfig.start_frame, exportConfig.end_frame, getFrameFromX]);

  const formatDuration = (ms: number) => {
    const seconds = ms / 1000;
    return seconds.toFixed(1) + "s";
  };

  const getPlaybackDuration = useCallback((frameCount: number) => {
    if (!recordingInfo || recordingInfo.fps <= 0) return 0;
    const originalDurationSec = frameCount / recordingInfo.fps;
    return (originalDurationSec / exportConfig.speed) * 1000;
  }, [recordingInfo, exportConfig.speed]);

  const trimmedFrameCount = exportConfig.end_frame - exportConfig.start_frame;
  const trimmedDuration = getPlaybackDuration(trimmedFrameCount);

  if (!recordingInfo) {
    return (
      <main className="container">
        <div className="header">
          <h1>GIF Editor</h1>
          <span className="subtitle">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="controls">
        <div className="editor">
          {previewImage && (
            <div className="preview-container">
              <img src={previewImage} alt="Preview" className="preview-image" draggable={false} />
              <span className="preview-frame-info">
                Frame {previewFrame} / {recordingInfo.frame_count - 1}
              </span>
            </div>
          )}

          <div className="filmstrip-section">
            <div
              ref={filmstripRef}
              className="filmstrip"
              onMouseMove={handleFilmstripHover}
            >
              <div className="filmstrip-frames">
                {filmstrip.map((src, i) => (
                  <img key={i} src={src} alt="" className="filmstrip-thumb" draggable={false} />
                ))}
              </div>
              <div
                className="filmstrip-mask filmstrip-mask-left"
                style={{ width: `${(exportConfig.start_frame / recordingInfo.frame_count) * 100}%` }}
              />
              <div
                className="filmstrip-mask filmstrip-mask-right"
                style={{ width: `${((recordingInfo.frame_count - exportConfig.end_frame) / recordingInfo.frame_count) * 100}%` }}
              />
              {previewFrame !== null && (
                <div
                  className="filmstrip-playhead"
                  style={{ left: `${(previewFrame / recordingInfo.frame_count) * 100}%` }}
                />
              )}
              <div
                className="filmstrip-handle filmstrip-handle-start"
                style={{ left: `${(exportConfig.start_frame / recordingInfo.frame_count) * 100}%` }}
                onMouseDown={(e) => handleFilmstripMouseDown(e, "start")}
              />
              <div
                className="filmstrip-handle filmstrip-handle-end"
                style={{ left: `${(exportConfig.end_frame / recordingInfo.frame_count) * 100}%` }}
                onMouseDown={(e) => handleFilmstripMouseDown(e, "end")}
              />
            </div>
          </div>

          <div className="editor-controls">
            <div className="control-row">
              <label>Resolution</label>
              <select
                value={exportConfig.output_scale}
                onChange={(e) => setExportConfig((c) => ({ ...c, output_scale: parseFloat(e.target.value) }))}
              >
                {resolutionPresets.map((preset) => (
                  <option key={preset.scale} value={preset.scale}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-row">
              <label>Quality</label>
              <div className="speed-slider">
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={exportConfig.quality}
                  onChange={(e) => setExportConfig((c) => ({ ...c, quality: parseInt(e.target.value) }))}
                />
                <span className="speed-value">{exportConfig.quality}%</span>
              </div>
            </div>

            <div className="control-row">
              <label>FPS</label>
              <div className="speed-slider">
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={exportConfig.target_fps}
                  onChange={(e) => setExportConfig((c) => ({ ...c, target_fps: parseInt(e.target.value) }))}
                />
                <span className="speed-value">{exportConfig.target_fps}</span>
              </div>
            </div>

            <div className="control-row">
              <label>Speed</label>
              <div className="speed-slider">
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={exportConfig.speed}
                  onChange={(e) => setExportConfig((c) => ({ ...c, speed: parseFloat(e.target.value) }))}
                />
                <span className="speed-value">{exportConfig.speed.toFixed(1)}×</span>
              </div>
            </div>

            <div className="control-row">
              <label>Loop</label>
              <select
                value={exportConfig.loop_mode}
                onChange={(e) => setExportConfig((c) => ({ ...c, loop_mode: e.target.value }))}
              >
                <option value="infinite">∞ Infinite</option>
                <option value="once">1x Once</option>
                <option value="pingpong">↔ Ping-pong</option>
              </select>
            </div>
          </div>

          {sizeEstimate && (
            <div className="size-estimate">
              <span>{sizeEstimate.output_width}×{sizeEstimate.output_height}</span>
              <span className="size-sep">·</span>
              <span>{formatDuration(trimmedDuration)}</span>
              <span className="size-sep">·</span>
              <span>{sizeEstimate.frame_count}f</span>
              <span className="size-sep">·</span>
              <span className="size-badge">~{sizeEstimate.formatted}</span>
            </div>
          )}

          <div className="export-actions">
            <button
              className="btn-primary btn-export"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                exportProgress ? (
                  <>
                    <span className="export-progress-text">
                      {Math.round((exportProgress.current / exportProgress.total) * 100)}%
                    </span>
                    <span
                      className="export-progress-bar"
                      style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                    />
                  </>
                ) : (
                  "Exporting..."
                )
              ) : (
                "Export GIF"
              )}
            </button>
            {savedPath && (
              <button
                className="btn-open"
                onClick={() => invoke("open_file", { path: savedPath })}
                title={savedPath}
              >
                Open
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
