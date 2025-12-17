import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./recording-overlay.css";

interface OverlayRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShortcutConfig {
  modifiers: string[];
  key: string;
  enabled: boolean;
}

interface AppConfig {
  shortcuts: Record<string, ShortcutConfig[]>;
}

function matchesShortcut(e: KeyboardEvent, cfg: ShortcutConfig): boolean {
  if (!cfg.enabled) return false;

  // Check modifiers
  const needAlt = cfg.modifiers.some((m) => m.toLowerCase() === "alt");
  const needCtrl = cfg.modifiers.some((m) => ["ctrl", "control"].includes(m.toLowerCase()));
  const needShift = cfg.modifiers.some((m) => m.toLowerCase() === "shift");
  const needMeta = cfg.modifiers.some((m) => ["cmd", "command", "super", "meta"].includes(m.toLowerCase()));

  if (e.altKey !== needAlt) return false;
  if (e.ctrlKey !== needCtrl) return false;
  if (e.shiftKey !== needShift) return false;
  if (e.metaKey !== needMeta) return false;

  // Check key
  const keyLower = cfg.key.toLowerCase();
  if (keyLower === "escape") return e.key === "Escape";
  return e.key.toLowerCase() === keyLower || e.code === `Key${cfg.key.toUpperCase()}`;
}

function matchesAnyShortcut(e: KeyboardEvent, shortcuts: ShortcutConfig[]): boolean {
  return shortcuts.some((cfg) => matchesShortcut(e, cfg));
}

export default function RecordingOverlay() {
  const [region, setRegion] = useState<OverlayRegion | null>(null);
  const [isStatic, setIsStatic] = useState(false);

  useEffect(() => {
    // Get region from window label query params or listen for it
    const params = new URLSearchParams(window.location.search);
    const x = parseInt(params.get("x") || "0");
    const y = parseInt(params.get("y") || "0");
    const w = parseInt(params.get("w") || "200");
    const h = parseInt(params.get("h") || "200");
    const staticMode = params.get("static") === "1";
    setRegion({ x, y, width: w, height: h });
    setIsStatic(staticMode);

    // Listen for recording stop to close (for GIF recording)
    const unlistenRecording = listen("recording-stopped", async () => {
      await getCurrentWindow().close();
    });

    // Listen for scroll capture stop to close (for scroll capture)
    const unlistenScroll = listen("scroll-capture-stop", async () => {
      await getCurrentWindow().close();
    });

    // Load stop_recording shortcut config and listen for it
    let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

    invoke<AppConfig>("get_shortcuts_config").then((config) => {
      const stopShortcuts = config.shortcuts["stop_recording"] || [];
      if (stopShortcuts.length > 0) {
        handleKeyDown = async (e: KeyboardEvent) => {
          if (matchesAnyShortcut(e, stopShortcuts)) {
            await invoke("stop_recording");
          }
        };
        document.addEventListener("keydown", handleKeyDown);
      }
    });

    return () => {
      unlistenRecording.then((fn) => fn());
      unlistenScroll.then((fn) => fn());
      if (handleKeyDown) {
        document.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, []);

  if (!region) return null;

  const cornerLen = 20;
  const borderWidth = 3;
  const cornerClass = isStatic ? "corner static" : "corner";

  return (
    <div className="recording-overlay">
      {/* Top-left corner - outside */}
      <div
        className={cornerClass}
        style={{
          left: region.x - borderWidth,
          top: region.y - borderWidth,
          width: cornerLen,
          height: cornerLen,
          borderWidth: `${borderWidth}px 0 0 ${borderWidth}px`,
        }}
      />
      {/* Top-right corner - outside */}
      <div
        className={cornerClass}
        style={{
          left: region.x + region.width - cornerLen + borderWidth,
          top: region.y - borderWidth,
          width: cornerLen,
          height: cornerLen,
          borderWidth: `${borderWidth}px ${borderWidth}px 0 0`,
        }}
      />
      {/* Bottom-left corner - outside */}
      <div
        className={cornerClass}
        style={{
          left: region.x - borderWidth,
          top: region.y + region.height - cornerLen + borderWidth,
          width: cornerLen,
          height: cornerLen,
          borderWidth: `0 0 ${borderWidth}px ${borderWidth}px`,
        }}
      />
      {/* Bottom-right corner - outside */}
      <div
        className={cornerClass}
        style={{
          left: region.x + region.width - cornerLen + borderWidth,
          top: region.y + region.height - cornerLen + borderWidth,
          width: cornerLen,
          height: cornerLen,
          borderWidth: `0 ${borderWidth}px ${borderWidth}px 0`,
        }}
      />
    </div>
  );
}
