export interface ResponseModelNode {
  id: string;
  label: string;
  kind?: string;
  state?: string;
}

export interface ResponseModelLink {
  id: string;
  from: string;
  to: string;
  enabled?: boolean;
  verified?: boolean;
  label?: string;
}

export interface ResponseScene {
  setMotion(enabled: boolean): void;
  setInstant(enabled: boolean): void;
  setVisible(visible: boolean): void;
  select(id?: string): void;
  rotate(direction: number, instant?: boolean): void;
  zoomBy(factor: number, instant?: boolean): void;
  pan(x: number, y: number, instant?: boolean): void;
  focus(id: string, instant?: boolean): void;
  setGestures(enabled: boolean): void;
  getView(): ResponseCameraView;
  restoreView(view: ResponseCameraView): void;
  reset(instant?: boolean): void;
  dispose(): void;
}

export interface ResponseCameraView {
  zoom: number;
  yaw: number;
  center: [number, number, number];
}
