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
  reset(instant?: boolean): void;
  dispose(): void;
}
