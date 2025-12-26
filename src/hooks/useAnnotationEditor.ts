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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value);
  const [activeStyles, setActiveStyles] = useState<AnnotationStyles>(DEFAULT_STYLES);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);

  // History state - both as state for reactivity
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Current annotations derived from history
  const annotations = history[historyIndex] ?? [];

  // Use ref to track selectedId for stable callbacks
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Push new state to history
  const pushHistory = useCallback((newAnnotations: Annotation[]) => {
    setHistory(prev => {
      // Truncate future history and add new state
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newAnnotations);

      // Limit history size
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  // Stable callbacks
  const addAnnotation = useCallback((annotation: Annotation) => {
    pushHistory([...annotations, annotation]);
  }, [pushHistory, annotations]);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    pushHistory(annotations.map(ann =>
      ann.id === id ? { ...ann, ...updates } as Annotation : ann
    ));
  }, [pushHistory, annotations]);

  const deleteAnnotation = useCallback((id: string) => {
    pushHistory(annotations.filter(ann => ann.id !== id));
    if (selectedIdRef.current === id) {
      setSelectedId(null);
    }
  }, [pushHistory, annotations]);

  const deleteSelected = useCallback(() => {
    if (selectedIdRef.current) {
      deleteAnnotation(selectedIdRef.current);
    }
  }, [deleteAnnotation]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSelectedId(null);
    }
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSelectedId(null);
    }
  }, [historyIndex, history.length]);

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
    setSelectedId(null);
    setActiveTool('select');
    setHistory([[]]);
    setHistoryIndex(0);
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

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
