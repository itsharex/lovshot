import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type CaptureFormat = "image" | "gif" | "video";

interface RecordingState {
  is_recording: boolean;
  frame_count: number;
}

function App() {
  const [format, setFormat] = useState<CaptureFormat>("image");
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [savedPath, setSavedPath] = useState("");

  useEffect(() => {
    const unlisten = listen<RecordingState>("recording-state", (event) => {
      setIsRecording(event.payload.is_recording);
      setFrameCount(event.payload.frame_count);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleStopRecording = async () => {
    await invoke("stop_recording");
    setIsRecording(false);
    try {
      const path = await invoke<string>("save_gif");
      setSavedPath(path);
      setTimeout(() => setSavedPath(""), 3000);
    } catch (e) {
      console.error("Failed to save:", e);
    }
    setFrameCount(0);
  };

  return (
    <main className="container">
      <div className="header">
        <h1>lovshot</h1>
      </div>

      <div className="format-tabs">
        <button
          className={`tab ${format === "image" ? "active" : ""}`}
          onClick={() => setFormat("image")}
          disabled={isRecording}
        >
          Image
        </button>
        <button
          className={`tab ${format === "gif" ? "active" : ""}`}
          onClick={() => setFormat("gif")}
          disabled={isRecording}
        >
          GIF
        </button>
        <button
          className={`tab ${format === "video" ? "active" : ""}`}
          onClick={() => setFormat("video")}
          disabled={isRecording}
        >
          Video
        </button>
      </div>

      <div className="controls">
        {isRecording && (
          <button className="btn-stop" onClick={handleStopRecording}>
            <span className="recording-dot" />
            Stop ({frameCount})
          </button>
        )}
      </div>

      <p className="shortcut-hint">
        <kbd>⇧</kbd> + <kbd>⌥</kbd> + <kbd>A</kbd>
      </p>

      {savedPath && <div className="saved-toast">Saved!</div>}
    </main>
  );
}

export default App;
