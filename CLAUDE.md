# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**lovshot** - A GIF/screenshot capture desktop application built with Tauri 2 + React 19 + TypeScript + Vite. Supports region-based screenshot and GIF recording with global hotkey activation.

## Development Commands

```bash
pnpm tauri dev      # Run desktop app with hot reload (preferred)
pnpm dev            # Frontend only (port 1420)
pnpm tauri build    # Production build
pnpm build          # Type check (tsc && vite build)
```

## Architecture

### Multi-Window Design
- **Main window** (`src/App.tsx`): GIF 编辑器界面，录制完成后显示
- **Selector window** (`selector.html` → `src/Selector.tsx`): 全屏透明覆盖层，区域选择
- **Recording overlay** (`overlay.html` → `src/RecordingOverlay.tsx`): 录制时的四角闪烁边框

### Core Flow
1. Global hotkey `⌥ A` triggers selector window
2. User drags to select region, chooses mode (screenshot/GIF)
3. Rust backend captures via `screenshots` crate
4. Screenshots save to clipboard + `~/Pictures/lovshot/`
5. GIF: recording overlay appears, frames captured in background thread
6. Stop recording → main window shows editor for trimming/exporting

### Rust Backend (`src-tauri/src/lib.rs`)
- `AppState` holds recording state, frames buffer, region, FPS settings
- Commands: `get_screens`, `capture_screenshot`, `open_selector`, `set_region`, `start_recording`, `stop_recording`, `export_gif`, `get_recording_info`, `get_filmstrip`
- Events: `recording-state`, `recording-stopped`, `export-progress`, `export-complete`
- macOS: Uses `objc` crate to set window level and activation policy (accessory mode)

### Key Dependencies
- **Rust**: `screenshots` (screen capture), `gif` (encoding), `image` (processing), `tauri-plugin-clipboard-manager`
- **Frontend**: `@tauri-apps/api` for IPC, `@tauri-apps/plugin-global-shortcut`

## Key Patterns

- **Tauri Commands**: Define with `#[tauri::command]`, register in `invoke_handler`
- **Frontend-Backend IPC**: `invoke()` for commands, `listen()` for events
- **Coordinate System**: Selector passes logical pixels; Rust uses them directly with `capture_area`
- **Multi-page Vite**: `vite.config.ts` defines multiple HTML entry points (main, selector, overlay)
- **Accessory App**: `LSUIElement` in Info.plist + runtime `setActivationPolicy` for menu bar mode

## Bundle Identifier

`app.lovpen.shot`

## Project Info

- **Developer**: Lovstudio
- **Website**: https://lovstudio.vercel.app/app/lovshot
