# OData-Explorer

OData-Explorer is a Vite + React iTwin application for browsing Insights OData reports with model context.

## Features

- Authenticate with iTwin platform using OIDC configuration from environment variables.
- Browse available Grouping & Mapping mappings for the active iModel.
- Resolve linked Insights reports and load OData feed metadata.
- Select entity tables and inspect rows in a compact in-app table view.

### Viewer Interaction Rail

The 3D viewer uses a compact floating icon rail for interaction tasks:

- Emphasize selected elements
- Isolate selected elements
- Hide selected elements
- Clear emphasize/isolate/hide overrides
- Cycle or select background mode
- Toggle properties panel visibility

The rail includes a background mode toggle with black, gray, and white presets. UI styling adapts to the active mode so controls remain readable on both dark and light model backdrops.

In addition to the custom rail, standard viewer/navigation controls are now styled to follow the same rounded visual language and background-aware contrast behavior.

Measurement display is configured to use the metric unit system when an iModel is connected.

## Tech Stack

- React 18 + TypeScript
- Vite 7
- iTwin Web Viewer and App UI packages
- Insights OData + Reports clients

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Create a local `.env` file (or copy `.env.example`) and fill in the values:

```env
# ---- Authorization Client Settings ----
IMJS_AUTH_CLIENT_CLIENT_ID=""
IMJS_AUTH_CLIENT_REDIRECT_URI=""
IMJS_AUTH_CLIENT_LOGOUT_URI=""
IMJS_AUTH_CLIENT_SCOPES="itwin-platform"

# ---- Test ids ----
IMJS_ITWIN_ID=""
IMJS_IMODEL_ID=""

# ---- Optional ----
IMJS_BING_MAPS_KEY=""
```

### 3) Start development server

```bash
npm start
```

The app runs at http://localhost:3000.

## Scripts

- `npm start` - Run local dev server.
- `npm run build` - Type-check and build production assets.
- `npm run preview` - Preview the production build locally.
- `npm run lint` - Run ESLint.

## Recent UI Changes

### 2026-04-27

- Added metric unit activation for measurement display when an iModel connects.
- Added a custom viewer interaction rail with actions for emphasize, isolate, hide, clear, background mode, and properties visibility.
- Added background mode presets (black, gray, white) with mode-aware styling updates.
- Updated standard viewer/navigation controls to follow the rounded interaction style and adaptive contrast behavior.
- Refined viewer control theming to use shared CSS variables for consistent runtime tuning.

## Screenshots

Add screenshots to this section before publishing your repository publicly.

Suggested captures:

- Mapping selection panel with loaded mappings
- Entity table selection drop-down
- Loaded OData rows table

## Deployment

Build the app:

```bash
npm run build
```

Then deploy the `dist` folder using your preferred static hosting provider.

## License

MIT. See [LICENSE](LICENSE).

## Helpful Links

- [iTwin Web Viewer package](https://www.npmjs.com/package/@itwin/web-viewer-react)
- [iTwin Developer docs](https://developer.bentley.com/)
