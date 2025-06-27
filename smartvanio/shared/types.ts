export interface FormPoint {
  mapped: string;
  measured: string;
  id: string;
}

export interface Device {
  name: string;
  connections: string[][];
  id: string;
  manufacturer: string;
  model: string;
}

export interface DiscoveredDevice {
  id: string;
  flowId: string;
  name: string;
}

interface Attributes {
  icon: string;
  friendly_name: string;
}

export interface State {
  attributes: Attributes;
  context: {
    id: string;
  };
  entity_id: string;
  last_changed: string;
  last_reported: string;
  last_updated: string;
  state: string;
}

export interface States {
  [key: string]: State;
}

export interface Entity {
  id: string;
  device_id: string;
  entity_id: string;
  name: string;
  unique_id: string;
}
