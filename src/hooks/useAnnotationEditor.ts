import { useState, useCallback, useRef } from 'react';
import type {
  Annotation,
  AnnotationTool,
  AnnotationStyles,
  RectStyle,
  ArrowStyle,
  MosaicStyle,
} from '../types/annotation';
import { DEFAULT_STYLES, ANNOTATION_COLORS } from '../types/annotation';

const MAX_HISTORY = 50;

export function useAnnotationEditor() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value);
  const [activeStyles, setActiveStyles] = useState<AnnotationStyles>(DEFAULT_STYLES);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);

  // History for undo/redo
  const historyRef = useRef<Annotation[][]>([[]]);
  const historyIndexRef = useRef(0);

  const pushHistory = useCallback((newAnnotations: Annotation[]) => {
    const history = historyRef.current;
    const index = historyIndexRef.current;

    // Truncate future history
    const newHistory = history.slice(0, index + 1);
    newHistory.push(newAnnotations);

    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    } else {
      historyIndexRef.current = newHistory.length - 1;
    }

    historyRef.current = newHistory;
    setAnnotations(newAnnotations);
  }, []);

  const addAnnotation = useCallback((annotation: Annotation) => {
    const newAnnotations = [...annotations, annotation];
    pushHistory(newAnnotations);
  }, [annotations, pushHistory]);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    const newAnnotations = annotations.map((ann) =>
      ann.id === id ? { ...ann, ...updates } as Annotation : ann
    );
    pushHistory(newAnnotations);
  }, [annotations, pushHistory]);

  const deleteAnnotation = useCallback((id: string) => {
    const newAnnotations = annotations.filter((ann) => ann.id !== id);
    pushHistory(newAnnotations);
    if (selectedId === id) {
      setSelectedId(null);
    }
  }, [annotations, selectedId, pushHistory]);

  const deleteSelected = useCallback(() => {
    if (selectedId) {
      deleteAnnotation(selectedId);
    }
  }, [selectedId, deleteAnnotation]);

  const undo = useCallback(() => {
    const index = historyIndexRef.current;
    if (index > 0) {
      historyIndexRef.current = index - 1;
      setAnnotations(historyRef.current[index - 1]);
      setSelectedId(null);
    }
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;
    if (index < history.length - 1) {
      historyIndexRef.current = index + 1;
      setAnnotations(history[index + 1]);
      setSelectedId(null);
    }
  }, []);

  const setRectStyle = useCallback((style: RectStyle) => {
    setActiveStyles((prev) => ({ ...prev, rect: style }));
  }, []);

  const setArrowStyle = useCallback((style: ArrowStyle) => {
    setActiveStyles((prev) => ({ ...prev, arrow: style }));
  }, []);

  const setMosaicStyle = useCallback((style: MosaicStyle) => {
    setActiveStyles((prev) => ({ ...prev, mosaic: style }));
  }, []);

  const reset = useCallback(() => {
    setAnnotations([]);
    setSelectedId(null);
    setActiveTool('select');
    historyRef.current = [[]];
    historyIndexRef.current = 0;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  return {
    // State
    annotations,
    selectedId,
    activeTool,
    activeColor,
    activeStyles,
    strokeWidth,
    fontSize,
    canUndo,
    canRedo,

    // Setters
    setSelectedId,
    setActiveTool,
    setActiveColor,
    setStrokeWidth,
    setFontSize,
    setRectStyle,
    setArrowStyle,
    setMosaicStyle,

    // Actions
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    deleteSelected,
    undo,
    redo,
    reset,
  };
}

export type AnnotationEditor = ReturnType<typeof useAnnotationEditor>;
