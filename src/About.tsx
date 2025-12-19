import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

export default function About() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  return (
    <div className="about-container">
      <div className="about-icon">
        <img src="/logo.svg" alt="Lovshot" width={64} height={64} />
      </div>
      <h1>Lovshot</h1>
      <p className="version">Version {version}</p>
      <p className="description">
        A beautiful screen capture tool for macOS.
        <br />
        Screenshots, GIFs, and more.
      </p>
      <div className="about-footer">
        <p className="copyright">
          Made with love by{" "}
          <a
            href="https://lovstudio.vercel.app/app/lovshot"
            onClick={(e) => {
              e.preventDefault();
              invoke("plugin:opener|open_url", { url: "https://lovstudio.vercel.app/app/lovshot" });
            }}
          >
            Lovstudio
          </a>
        </p>
        <button className="btn-primary" onClick={handleClose}>
          OK
        </button>
      </div>
    </div>
  );
}
