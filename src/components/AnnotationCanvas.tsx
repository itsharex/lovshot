import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Image, Rect, Arrow, Text, Line, Transformer, Shape } from 'react-konva';
import type Konva from 'konva';
import type {
  Annotation,
  AnnotationTool,
  AnnotationStyles,
  RectAnnotation,
  ArrowAnnotation,
  TextAnnotation,
  MosaicAnnotation,
} from '../types/annotation';

interface Props {
  imageUrl: string;
  width: number;
  height: number;
  left: number;
  top: number;
  annotations: Annotation[];
  selectedId: string | null;
  activeTool: AnnotationTool;
  activeColor: string;
  activeStyles: AnnotationStyles;
  strokeWidth: number;
  fontSize: number;
  onAddAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onSelectAnnotation: (id: string | null) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentAnnotation: Annotation | null;
}

function generateId() {
  return `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function AnnotationCanvas({
  imageUrl,
  width,
  height,
  left,
  top,
  annotations,
  selectedId,
  activeTool,
  activeColor,
  activeStyles,
  strokeWidth,
  fontSize,
  onAddAnnotation,
  onUpdateAnnotation,
  onSelectAnnotation,
  stageRef,
}: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [drawing, setDrawing] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentAnnotation: null,
  });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const transformerRef = useRef<Konva.Transformer>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Load background image
  useEffect(() => {
    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => setImage(img);
  }, [imageUrl]);

  // Update transformer when selection changes
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;

    if (selectedId && activeTool === 'select') {
      const node = stage.findOne(`#${selectedId}`);
      if (node) {
        transformer.nodes([node]);
        transformer.getLayer()?.batchDraw();
        return;
      }
    }
    transformer.nodes([]);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, activeTool, annotations, stageRef]);

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool === 'select') {
      // Check if clicked on empty space
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background';
      if (clickedOnEmpty) {
        onSelectAnnotation(null);
      }
      return;
    }

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const id = generateId();

    if (activeTool === 'rect') {
      const annotation: RectAnnotation = {
        id,
        type: 'rect',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        style: activeStyles.rect,
        color: activeColor,
        strokeWidth,
      };
      setDrawing({ isDrawing: true, startX: pos.x, startY: pos.y, currentAnnotation: annotation });
    } else if (activeTool === 'mosaic') {
      const annotation: MosaicAnnotation = {
        id,
        type: 'mosaic',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        style: activeStyles.mosaic,
        blockSize: 10,
      };
      setDrawing({ isDrawing: true, startX: pos.x, startY: pos.y, currentAnnotation: annotation });
    } else if (activeTool === 'arrow') {
      const annotation: ArrowAnnotation = {
        id,
        type: 'arrow',
        points: [pos.x, pos.y, pos.x, pos.y],
        style: activeStyles.arrow,
        color: activeColor,
        strokeWidth,
      };
      setDrawing({ isDrawing: true, startX: pos.x, startY: pos.y, currentAnnotation: annotation });
    } else if (activeTool === 'text') {
      const annotation: TextAnnotation = {
        id,
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: '',
        fontSize,
        color: activeColor,
      };
      onAddAnnotation(annotation);
      setEditingTextId(id);
      onSelectAnnotation(id);
    }
  }, [activeTool, activeColor, activeStyles, strokeWidth, fontSize, onAddAnnotation, onSelectAnnotation]);

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!drawing.isDrawing || !drawing.currentAnnotation) return;

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const ann = drawing.currentAnnotation;

    if (ann.type === 'rect' || ann.type === 'mosaic') {
      const x = Math.min(pos.x, drawing.startX);
      const y = Math.min(pos.y, drawing.startY);
      const w = Math.abs(pos.x - drawing.startX);
      const h = Math.abs(pos.y - drawing.startY);
      setDrawing({
        ...drawing,
        currentAnnotation: { ...ann, x, y, width: w, height: h } as typeof ann,
      });
    } else if (ann.type === 'arrow') {
      setDrawing({
        ...drawing,
        currentAnnotation: {
          ...ann,
          points: [drawing.startX, drawing.startY, pos.x, pos.y],
        } as ArrowAnnotation,
      });
    }
  }, [drawing]);

  const handleMouseUp = useCallback(() => {
    if (!drawing.isDrawing || !drawing.currentAnnotation) return;

    const ann = drawing.currentAnnotation;

    // Only add if has meaningful size
    if (ann.type === 'rect' || ann.type === 'mosaic') {
      if ((ann as RectAnnotation).width > 5 && (ann as RectAnnotation).height > 5) {
        onAddAnnotation(ann);
      }
    } else if (ann.type === 'arrow') {
      const pts = (ann as ArrowAnnotation).points;
      const dx = pts[2] - pts[0];
      const dy = pts[3] - pts[1];
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        onAddAnnotation(ann);
      }
    }

    setDrawing({ isDrawing: false, startX: 0, startY: 0, currentAnnotation: null });
  }, [drawing, onAddAnnotation]);

  const handleShapeClick = useCallback((id: string) => {
    if (activeTool === 'select') {
      onSelectAnnotation(id);
    }
  }, [activeTool, onSelectAnnotation]);

  const handleTransformEnd = useCallback((id: string, node: Konva.Node) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and apply to dimensions
    node.scaleX(1);
    node.scaleY(1);

    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;

    if (ann.type === 'rect' || ann.type === 'mosaic') {
      onUpdateAnnotation(id, {
        x: node.x(),
        y: node.y(),
        width: Math.max(5, node.width() * scaleX),
        height: Math.max(5, node.height() * scaleY),
      });
    }
  }, [annotations, onUpdateAnnotation]);

  const handleTextEdit = useCallback((id: string, text: string) => {
    onUpdateAnnotation(id, { text });
    if (!text.trim()) {
      // Remove empty text annotations on blur
      // Note: caller should handle this via deleteAnnotation
    }
    setEditingTextId(null);
  }, [onUpdateAnnotation]);

  const renderAnnotation = (ann: Annotation) => {
    if (ann.type === 'rect') {
      const dashArray = ann.style === 'dashed' ? [10, 5] : undefined;
      const fill = ann.style === 'filled' ? `${ann.color}40` : undefined;
      return (
        <Rect
          key={ann.id}
          id={ann.id}
          x={ann.x}
          y={ann.y}
          width={ann.width}
          height={ann.height}
          stroke={ann.color}
          strokeWidth={ann.strokeWidth}
          dash={dashArray}
          fill={fill}
          draggable={activeTool === 'select'}
          onClick={() => handleShapeClick(ann.id)}
          onTap={() => handleShapeClick(ann.id)}
          onDragEnd={(e) => {
            onUpdateAnnotation(ann.id, { x: e.target.x(), y: e.target.y() });
          }}
          onTransformEnd={(e) => handleTransformEnd(ann.id, e.target)}
        />
      );
    }

    if (ann.type === 'mosaic') {
      return (
        <MosaicShape
          key={ann.id}
          annotation={ann}
          backgroundImage={image}
          activeTool={activeTool}
          onClick={() => handleShapeClick(ann.id)}
          onDragEnd={(x, y) => onUpdateAnnotation(ann.id, { x, y })}
          onTransformEnd={(w, h) => onUpdateAnnotation(ann.id, { width: w, height: h })}
        />
      );
    }

    if (ann.type === 'arrow') {
      const pointerLength = ann.style === 'thick' ? 15 : 10;
      const pointerWidth = ann.style === 'thick' ? 12 : 8;
      const sw = ann.style === 'thick' ? ann.strokeWidth * 2 : ann.strokeWidth;

      if (ann.style === 'double') {
        // Double-headed arrow using Line + custom pointers
        return (
          <Line
            key={ann.id}
            id={ann.id}
            points={ann.points}
            stroke={ann.color}
            strokeWidth={sw}
            lineCap="round"
            lineJoin="round"
            draggable={activeTool === 'select'}
            onClick={() => handleShapeClick(ann.id)}
            onTap={() => handleShapeClick(ann.id)}
            onDragEnd={(e) => {
              const dx = e.target.x();
              const dy = e.target.y();
              e.target.position({ x: 0, y: 0 });
              onUpdateAnnotation(ann.id, {
                points: [
                  ann.points[0] + dx,
                  ann.points[1] + dy,
                  ann.points[2] + dx,
                  ann.points[3] + dy,
                ],
              });
            }}
          />
        );
      }

      return (
        <Arrow
          key={ann.id}
          id={ann.id}
          points={ann.points}
          stroke={ann.color}
          fill={ann.color}
          strokeWidth={sw}
          pointerLength={pointerLength}
          pointerWidth={pointerWidth}
          lineCap="round"
          lineJoin="round"
          draggable={activeTool === 'select'}
          onClick={() => handleShapeClick(ann.id)}
          onTap={() => handleShapeClick(ann.id)}
          onDragEnd={(e) => {
            const dx = e.target.x();
            const dy = e.target.y();
            e.target.position({ x: 0, y: 0 });
            onUpdateAnnotation(ann.id, {
              points: [
                ann.points[0] + dx,
                ann.points[1] + dy,
                ann.points[2] + dx,
                ann.points[3] + dy,
              ],
            });
          }}
        />
      );
    }

    if (ann.type === 'text') {
      const isEditing = editingTextId === ann.id;
      return (
        <Text
          key={ann.id}
          id={ann.id}
          x={ann.x}
          y={ann.y}
          text={ann.text || (isEditing ? '' : '点击输入')}
          fontSize={ann.fontSize}
          fill={ann.color}
          draggable={activeTool === 'select' && !isEditing}
          onClick={() => {
            handleShapeClick(ann.id);
            if (activeTool === 'select') {
              setEditingTextId(ann.id);
            }
          }}
          onTap={() => handleShapeClick(ann.id)}
          onDragEnd={(e) => {
            onUpdateAnnotation(ann.id, { x: e.target.x(), y: e.target.y() });
          }}
          onDblClick={() => setEditingTextId(ann.id)}
          onDblTap={() => setEditingTextId(ann.id)}
          opacity={ann.text ? 1 : 0.5}
        />
      );
    }

    return null;
  };

  // Render current drawing annotation
  const renderDrawing = () => {
    if (!drawing.currentAnnotation) return null;
    return renderAnnotation(drawing.currentAnnotation);
  };

  // Text editing overlay
  const editingText = editingTextId ? annotations.find((a) => a.id === editingTextId && a.type === 'text') as TextAnnotation | undefined : null;

  return (
    <div
      className="annotation-canvas"
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height,
        zIndex: 15,
      }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Layer>
          {/* Background image */}
          {image && (
            <Image
              image={image}
              width={width}
              height={height}
              name="background"
            />
          )}
        </Layer>
        <Layer>
          {/* Annotations */}
          {annotations.map(renderAnnotation)}
          {renderDrawing()}

          {/* Transformer for selection */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit resize
              if (newBox.width < 5 || newBox.height < 5) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>

      {/* Text editing textarea overlay */}
      {editingText && (
        <textarea
          ref={textInputRef}
          className="annotation-text-input"
          style={{
            position: 'absolute',
            left: editingText.x,
            top: editingText.y,
            fontSize: editingText.fontSize,
            color: editingText.color,
            minWidth: 100,
            minHeight: editingText.fontSize + 8,
          }}
          defaultValue={editingText.text}
          autoFocus
          onBlur={(e) => handleTextEdit(editingText.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditingTextId(null);
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleTextEdit(editingText.id, e.currentTarget.value);
            }
          }}
        />
      )}
    </div>
  );
}

// Mosaic custom shape
interface MosaicShapeProps {
  annotation: MosaicAnnotation;
  backgroundImage: HTMLImageElement | null;
  activeTool: AnnotationTool;
  onClick: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (width: number, height: number) => void;
}

function MosaicShape({ annotation, backgroundImage, activeTool, onClick, onDragEnd, onTransformEnd: _onTransformEnd }: MosaicShapeProps) {
  const { id, x, y, width, height, style, blockSize } = annotation;

  if (!backgroundImage || width < 1 || height < 1) return null;

  return (
    <Shape
      id={id}
      x={x}
      y={y}
      width={width}
      height={height}
      draggable={activeTool === 'select'}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      sceneFunc={(ctx, shape) => {
        const w = shape.width();
        const h = shape.height();

        if (style === 'blur') {
          // Simple blur effect using multiple semi-transparent draws
          ctx.save();
          ctx.filter = 'blur(8px)';
          ctx.drawImage(
            backgroundImage,
            x, y, w, h,
            0, 0, w, h
          );
          ctx.restore();
        } else {
          // Pixelate effect
          const bs = blockSize;
          const cols = Math.ceil(w / bs);
          const rows = Math.ceil(h / bs);

          // Create offscreen canvas to sample pixels
          const offscreen = document.createElement('canvas');
          offscreen.width = backgroundImage.width;
          offscreen.height = backgroundImage.height;
          const offCtx = offscreen.getContext('2d');
          if (!offCtx) return;
          offCtx.drawImage(backgroundImage, 0, 0);

          const imgData = offCtx.getImageData(
            Math.floor(x),
            Math.floor(y),
            Math.ceil(w),
            Math.ceil(h)
          );

          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const px = col * bs;
              const py = row * bs;
              const bw = Math.min(bs, w - px);
              const bh = Math.min(bs, h - py);

              // Sample center pixel
              const sx = Math.floor(px + bw / 2);
              const sy = Math.floor(py + bh / 2);
              const idx = (sy * Math.ceil(w) + sx) * 4;

              if (idx >= 0 && idx < imgData.data.length - 3) {
                const r = imgData.data[idx];
                const g = imgData.data[idx + 1];
                const b = imgData.data[idx + 2];
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(px, py, bw, bh);
              }
            }
          }
        }

        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

export default AnnotationCanvas;
