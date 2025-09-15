# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a browser extension built with React and TypeScript, using Vite with the `vite-plugin-web-extension` plugin. The extension supports both Chrome (Manifest v3) and Firefox (Manifest v2) through conditional manifest generation.

## Common Commands

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build extension for production (runs TypeScript compilation followed by Vite build)

### Package Management
- Uses `pnpm` as the package manager (pnpm-lock.yaml present)

## Architecture

### Extension Structure
- **Entry Points**: 
  - `src/popup.tsx` - Main popup entry point that renders the React app
  - `src/background.ts` - Background script with basic extension lifecycle logging
- **Components**: React components in `src/pages/` directory (currently `Popup.tsx`)
- **Manifest**: Dynamic manifest generation via `src/manifest.json` template with browser-specific conditionals

### Build System
- **Vite Configuration**: `vite.config.ts` uses `vite-plugin-web-extension` to handle browser extension specifics
- **TypeScript**: Strict TypeScript configuration with ESNext target and React JSX transform
- **Manifest Generation**: Combines `package.json` metadata with `src/manifest.json` template for cross-browser compatibility

### Browser Extension Features
- Cross-browser support through webextension-polyfill
- Popup interface with React components
- Background script for extension lifecycle management
- Icon assets in multiple sizes (16, 32, 48, 96, 128px)

### File Structure
```
src/
├── background.ts          # Background service worker/script
├── popup.tsx             # Popup entry point
├── popup.html            # Popup HTML template
├── popup.css             # Popup styles
├── manifest.json         # Extension manifest template
├── vite-env.d.ts         # Vite TypeScript definitions
└── pages/
    ├── Popup.tsx         # Main popup component
    └── Popup.css         # Popup component styles
```