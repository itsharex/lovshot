export type AnnotationTool = 'select' | 'rect' | 'mosaic' | 'arrow' | 'text';

export type RectStyle = 'solid' | 'dashed' | 'filled';
export type ArrowStyle = 'single' | 'double' | 'thick';
export type MosaicStyle = 'pixelate' | 'blur';

export interface AnnotationColor {
  name: string;
  value: string;
}

// Warm Academic 主题色系
export const ANNOTATION_COLORS: AnnotationColor[] = [
  { name: 'clay', value: '#CC785C' },     // 主题色 (陶土)
  { name: 'red', value: '#D9534F' },
  { name: 'yellow', value: '#F0AD4E' },
  { name: 'green', value: '#5CB85C' },
  { name: 'blue', value: '#5BC0DE' },
  { name: 'white', value: '#FFFFFF' },
  { name: 'black', value: '#181818' },
];

interface BaseAnnotation {
  id: string;
  type: AnnotationTool;
}

export interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  style: RectStyle;
  color: string;
  strokeWidth: number;
}

export interface MosaicAnnotation extends BaseAnnotation {
  type: 'mosaic';
  x: number;
  y: number;
  width: number;
  height: number;
  style: MosaicStyle;
  blockSize: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  points: [number, number, number, number]; // [x1, y1, x2, y2]
  style: ArrowStyle;
  color: string;
  strokeWidth: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export type Annotation = RectAnnotation | MosaicAnnotation | ArrowAnnotation | TextAnnotation;

export interface AnnotationStyles {
  rect: RectStyle;
  arrow: ArrowStyle;
  mosaic: MosaicStyle;
}

export const DEFAULT_STYLES: AnnotationStyles = {
  rect: 'solid',
  arrow: 'single',
  mosaic: 'pixelate',
};

export const STYLE_OPTIONS = {
  rect: [
    { value: 'solid', label: '实线', icon: '━' },
    { value: 'dashed', label: '虚线', icon: '┅' },
    { value: 'filled', label: '填充', icon: '■' },
  ],
  arrow: [
    { value: 'single', label: '单向', icon: '→' },
    { value: 'double', label: '双向', icon: '↔' },
    { value: 'thick', label: '粗箭头', icon: '➔' },
  ],
  mosaic: [
    { value: 'pixelate', label: '像素化', icon: '▦' },
    { value: 'blur', label: '模糊', icon: '◎' },
  ],
} as const;
