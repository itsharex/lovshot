import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Preview() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") || "";

  const handleClick = async () => {
    await getCurrentWindow().destroy();
  };

  return (
    <div className="preview-container" onClick={handleClick}>
      {path && <img src={convertFileSrc(path)} alt="Screenshot" />}
      <div className="preview-label">已保存到剪贴板</div>
    </div>
  );
}
