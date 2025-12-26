import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Zoom() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") || "";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        getCurrentWindow().close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="zoom-container">
      <img
        src={convertFileSrc(path)}
        alt=""
        className="zoom-image"
        draggable={false}
      />
    </div>
  );
}
