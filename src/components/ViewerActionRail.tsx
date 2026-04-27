import { HideIsolateEmphasizeManager, UiFramework, WidgetState } from "@itwin/appui-react";
import { ColorDef } from "@itwin/core-common";
import { IModelApp, type Viewport } from "@itwin/core-frontend";
import { PropertyGridWidgetId } from "@itwin/property-grid-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type ViewerBackgroundMode = "black" | "gray" | "white";

const backgroundModes: ViewerBackgroundMode[] = ["black", "gray", "white"];

const backgroundColors: Record<ViewerBackgroundMode, ColorDef> = {
  black: ColorDef.fromString("#111111"),
  gray: ColorDef.fromString("#60656f"),
  white: ColorDef.fromString("#f4f4f4"),
};

function getBackgroundModeFromColor(color: ColorDef): ViewerBackgroundMode {
  const { r, g, b } = color.colors;
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  if (luminance < 90) {
    return "black";
  }

  if (luminance > 190) {
    return "white";
  }

  return "gray";
}

interface RailButtonProps {
  label: string;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function RailButton({ label, title, disabled, active, onClick, children }: RailButtonProps) {
  return (
    <button
      type="button"
      className="viewer-action-button"
      aria-label={label}
      title={title}
      disabled={disabled}
      data-active={active ? "true" : "false"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function actionIsDisabled(viewport: Viewport | undefined, selectionCount: number) {
  return !viewport || selectionCount === 0;
}

function IconEmphasize() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 13.8 8.2 18.5 10 13.8 11.8 12 16.5 10.2 11.8 5.5 10 10.2 8.2Z" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function IconIsolate() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2.5V5" />
      <path d="M21.5 12H19" />
      <path d="M12 21.5V19" />
      <path d="M2.5 12H5" />
    </svg>
  );
}

function IconHide() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5Z" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M4 4 20 20" />
    </svg>
  );
}

function IconClear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M8.5 7 10 4.5h4L15.5 7" />
      <path d="M7.5 7 8.5 18a2 2 0 0 0 2 1.8h3a2 2 0 0 0 2-1.8L16.5 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function IconBackground() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z" />
      <path d="M4.5 13h15" />
      <path d="M12 4.5v15" />
    </svg>
  );
}

function IconProperties() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6.5h5" />
      <path d="M6 12h12" />
      <path d="M6 17.5h8" />
      <circle cx="15.5" cy="6.5" r="1.8" />
      <circle cx="12" cy="17.5" r="1.8" />
    </svg>
  );
}

export function ViewerActionRail() {
  const [viewport, setViewport] = useState<Viewport | undefined>(() => IModelApp.viewManager.selectedView);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [selectionCount, setSelectionCount] = useState(0);
  const [propertiesVisible, setPropertiesVisible] = useState(true);
  const [backgroundMode, setBackgroundMode] = useState<ViewerBackgroundMode>("gray");

  useEffect(() => {
    const resolvePortalHost = () => {
      const toolbarHost = document.querySelector<HTMLElement>(".nz-widget-navigationArea > .nz-vertical-toolbar-container");
      setPortalHost(toolbarHost ?? document.getElementById("uifw-contentlayout-div"));
    };

    resolvePortalHost();

    const observer = new MutationObserver(resolvePortalHost);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setViewport(IModelApp.viewManager.selectedView);

    return IModelApp.viewManager.onSelectedViewportChanged.addListener(({ current }) => {
      setViewport(current);
    });
  }, []);

  useEffect(() => {
    const iModel = viewport?.iModel;
    if (!iModel) {
      setSelectionCount(0);
      return;
    }

    const updateSelectionCount = () => {
      setSelectionCount(iModel.selectionSet.size);
    };

    updateSelectionCount();
    return iModel.selectionSet.onChanged.addListener(updateSelectionCount);
  }, [viewport]);

  useEffect(() => {
    if (!viewport) {
      return;
    }

    setBackgroundMode(getBackgroundModeFromColor(viewport.view.displayStyle.backgroundColor));
  }, [viewport]);

  useEffect(() => {
    document.documentElement.setAttribute("data-viewer-bg-mode", backgroundMode);
  }, [backgroundMode]);

  useEffect(() => {
    const widget = UiFramework.frontstages.findWidget(PropertyGridWidgetId);
    if (!widget) {
      return;
    }

    setPropertiesVisible(widget.state !== WidgetState.Hidden && widget.state !== WidgetState.Unloaded);
  }, []);

  const applyBackgroundMode = useCallback((mode: ViewerBackgroundMode) => {
    if (!viewport) {
      return;
    }

    viewport.view.displayStyle.backgroundColor = backgroundColors[mode];
    viewport.synchWithView();
    viewport.invalidateScene();
    setBackgroundMode(mode);
  }, [viewport]);

  const cycleBackgroundMode = useCallback(() => {
    const currentIndex = backgroundModes.findIndex((mode) => mode === backgroundMode);
    const nextMode = backgroundModes[(currentIndex + 1) % backgroundModes.length];
    applyBackgroundMode(nextMode);
  }, [applyBackgroundMode, backgroundMode]);

  const togglePropertyGridVisibility = useCallback(() => {
    const nextVisibleState = !propertiesVisible;
    const nextWidgetState = nextVisibleState ? WidgetState.Open : WidgetState.Hidden;

    UiFramework.frontstages.setWidgetState(PropertyGridWidgetId, nextWidgetState);
    setPropertiesVisible(nextVisibleState);
  }, [propertiesVisible]);

  const actionDisabled = useMemo(
    () => actionIsDisabled(viewport, selectionCount),
    [selectionCount, viewport],
  );

  if (!portalHost) {
    return null;
  }

  return createPortal(
    <div className="viewer-action-rail" data-bg-mode={backgroundMode}>
      <RailButton
        label="Emphasize selected"
        title="Emphasize selected"
        disabled={actionDisabled}
        onClick={() => {
          if (!viewport) {
            return;
          }

          void HideIsolateEmphasizeManager.emphasizeSelected(viewport);
        }}
      >
        <IconEmphasize />
      </RailButton>

      <RailButton
        label="Isolate selected"
        title="Isolate selected"
        disabled={actionDisabled}
        onClick={() => {
          if (!viewport) {
            return;
          }

          HideIsolateEmphasizeManager.isolateSelected(viewport);
          viewport.invalidateScene();
        }}
      >
        <IconIsolate />
      </RailButton>

      <RailButton
        label="Hide selected"
        title="Hide selected"
        disabled={actionDisabled}
        onClick={() => {
          if (!viewport) {
            return;
          }

          void HideIsolateEmphasizeManager.hideCommand(viewport);
        }}
      >
        <IconHide />
      </RailButton>

      <RailButton
        label="Clear emphasize, isolate and hide"
        title="Clear emphasize, isolate and hide"
        disabled={!viewport}
        onClick={() => {
          if (!viewport) {
            return;
          }

          HideIsolateEmphasizeManager.clearEmphasize(viewport);
          HideIsolateEmphasizeManager.clearOverrideModels(viewport);
          HideIsolateEmphasizeManager.clearOverrideCategories(viewport);
          viewport.invalidateScene();
        }}
      >
        <IconClear />
      </RailButton>

      <RailButton
        label="Toggle background mode"
        title="Toggle background mode"
        disabled={!viewport}
        onClick={cycleBackgroundMode}
      >
        <IconBackground />
      </RailButton>

      <RailButton
        label="Toggle properties visibility"
        title="Toggle properties visibility"
        disabled={false}
        active={propertiesVisible}
        onClick={togglePropertyGridVisibility}
      >
        <IconProperties />
      </RailButton>

      <div className="viewer-background-switch" role="group" aria-label="Background color">
        {backgroundModes.map((mode) => (
          <button
            key={mode}
            type="button"
            className="viewer-background-swatch"
            data-mode={mode}
            data-active={backgroundMode === mode ? "true" : "false"}
            aria-label={`Set ${mode} background`}
            title={`Set ${mode} background`}
            onClick={() => applyBackgroundMode(mode)}
          />
        ))}
      </div>
    </div>,
    portalHost,
  );
}