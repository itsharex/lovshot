import { useRef, useEffect, useState, memo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface MagnifierProps {
  /** 当前光标位置（逻辑像素） */
  cursorX: number;
  cursorY: number;
  /** 屏幕尺寸 */
  screenWidth: number;
  screenHeight: number;
  /** 是否正在拖拽选区 */
  isDragging?: boolean;
  /** 选区起点（拖拽时） */
  selectionStart?: { x: number; y: number };
  /** 颜色变化回调 */
  onColorChange?: (color: string) => void;
}

// 放大镜配置
const MAGNIFIER_SIZE = 120; // 放大镜显示尺寸
const ZOOM_LEVEL = 8; // 放大倍率
const SOURCE_SIZE = Math.floor(MAGNIFIER_SIZE / ZOOM_LEVEL); // 源区域尺寸 (15x15 逻辑像素)
const OFFSET = 24; // 光标偏移距离

/**
 * 放大镜组件 - 直接从 Rust 获取小区域像素，无需传输整个屏幕
 */
function MagnifierComponent({
  cursorX,
  cursorY,
  screenWidth,
  screenHeight,
  isDragging = false,
  selectionStart,
  onColorChange,
}: MagnifierProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPosRef = useRef({ x: -1, y: -1 });
  const [centerColor, setCenterColor] = useState("#000000");

  // 获取并绘制像素
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 节流：位置变化小于 1px 时跳过
    const dx = Math.abs(cursorX - lastPosRef.current.x);
    const dy = Math.abs(cursorY - lastPosRef.current.y);
    if (dx < 1 && dy < 1) return;
    lastPosRef.current = { x: cursorX, y: cursorY };

    // 请求小区域像素（SOURCE_SIZE 逻辑像素）
    invoke<number[] | null>("get_magnifier_pixels", {
      x: Math.round(cursorX),
      y: Math.round(cursorY),
      size: SOURCE_SIZE,
    }).then((pixels) => {
      if (!pixels || pixels.length === 0) return;

      // 计算实际尺寸（像素数组是物理像素）
      const actualSize = Math.sqrt(pixels.length / 4);

      // 提取中心像素颜色
      const centerIdx = Math.floor(actualSize / 2);
      const pixelIdx = (centerIdx * actualSize + centerIdx) * 4;
      const r = pixels[pixelIdx];
      const g = pixels[pixelIdx + 1];
      const b = pixels[pixelIdx + 2];
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
      setCenterColor(hex);
      onColorChange?.(hex);

      // 创建 ImageData
      const imageData = new ImageData(
        new Uint8ClampedArray(pixels),
        actualSize,
        actualSize
      );

      // 清空并绘制
      ctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
      ctx.imageSmoothingEnabled = false;

      // 先绘制到临时 canvas，再放大
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = actualSize;
      tempCanvas.height = actualSize;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
      }

      // 绘制中心十字准星
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 1;
      const center = MAGNIFIER_SIZE / 2;
      const crossSize = ZOOM_LEVEL;

      ctx.beginPath();
      ctx.moveTo(center, center - crossSize * 2);
      ctx.lineTo(center, center + crossSize * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(center - crossSize * 2, center);
      ctx.lineTo(center + crossSize * 2, center);
      ctx.stroke();

      // 中心像素高亮框
      ctx.strokeStyle = "rgba(204, 120, 92, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        center - crossSize / 2,
        center - crossSize / 2,
        crossSize,
        crossSize
      );
    });
  }, [cursorX, cursorY, onColorChange]);

  // 计算放大镜位置 - 跟随鼠标，但避开选区
  const totalHeight = MAGNIFIER_SIZE + 40; // canvas + info bar (2 rows)

  // 光标周围四个方向的候选位置
  const candidates = [
    { x: cursorX - OFFSET - MAGNIFIER_SIZE, y: cursorY - OFFSET - totalHeight }, // 左上
    { x: cursorX + OFFSET, y: cursorY - OFFSET - totalHeight }, // 右上
    { x: cursorX - OFFSET - MAGNIFIER_SIZE, y: cursorY + OFFSET }, // 左下
    { x: cursorX + OFFSET, y: cursorY + OFFSET }, // 右下
  ];

  // 边界修正
  const clamp = (pos: { x: number; y: number }) => ({
    x: Math.max(8, Math.min(pos.x, screenWidth - MAGNIFIER_SIZE - 8)),
    y: Math.max(8, Math.min(pos.y, screenHeight - totalHeight - 8)),
  });

  // 检查是否与选区重叠
  const overlapsSelection = (cx: number, cy: number) => {
    if (!isDragging || !selectionStart) return false;
    const selX = Math.min(selectionStart.x, cursorX);
    const selY = Math.min(selectionStart.y, cursorY);
    const selW = Math.abs(cursorX - selectionStart.x);
    const selH = Math.abs(cursorY - selectionStart.y);
    const magRight = cx + MAGNIFIER_SIZE;
    const magBottom = cy + totalHeight;
    return !(cx > selX + selW || magRight < selX || cy > selY + selH || magBottom < selY);
  };

  // 检查是否遮挡光标
  const overlapsCursor = (cx: number, cy: number) => {
    const margin = 15;
    return (
      cursorX >= cx - margin &&
      cursorX <= cx + MAGNIFIER_SIZE + margin &&
      cursorY >= cy - margin &&
      cursorY <= cy + totalHeight + margin
    );
  };

  // 选择第一个不重叠的位置
  let chosen = clamp(candidates[0]);
  for (const c of candidates) {
    const clamped = clamp(c);
    if (!overlapsSelection(clamped.x, clamped.y) && !overlapsCursor(clamped.x, clamped.y)) {
      chosen = clamped;
      break;
    }
  }

  const magX = chosen.x;
  const magY = chosen.y;

  return (
    <div
      className="magnifier"
      style={{
        left: magX,
        top: magY,
      }}
    >
      <canvas
        ref={canvasRef}
        width={MAGNIFIER_SIZE}
        height={MAGNIFIER_SIZE}
        className="magnifier-canvas"
        style={{ width: MAGNIFIER_SIZE, height: MAGNIFIER_SIZE }}
      />
      <div className="magnifier-info">
        <div className="magnifier-row">
          <span className="magnifier-position-map">
            <span
              className="magnifier-position-dot"
              style={{
                left: `${(cursorX / screenWidth) * 100}%`,
                top: `${(cursorY / screenHeight) * 100}%`,
              }}
            />
          </span>
          <span className="magnifier-coords">{Math.round(cursorX)}, {Math.round(cursorY)}</span>
          <span className="magnifier-hint">P</span>
        </div>
        <div className="magnifier-row">
          <span
            className="magnifier-color-swatch"
            style={{ backgroundColor: centerColor }}
          />
          <span className="magnifier-color">{centerColor}</span>
          <span className="magnifier-hint">C</span>
        </div>
      </div>
    </div>
  );
}

export const Magnifier = memo(MagnifierComponent);
