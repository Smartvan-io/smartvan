import getConfig from "next/config";
import { Device, Entity, State } from "../types";

const { publicRuntimeConfig } = getConfig();
const { token, basePath } = publicRuntimeConfig;

export const fetchEntityStates = async (entities: Entity[]) => {
  const ids = Object.values(entities).map((entity) => entity.entity_id);

  const res = await fetch(`${basePath}/api/hass/states`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    console.error("Failed to fetch states");
    return [];
  }

  const data = (await res.json()) as State[];

  const filtered = data.filter((state) => ids.includes(state.entity_id));

  const statesOnDevice = filtered.reduce((acc, cur) => {
    return {
      ...acc,
      [cur.entity_id]: cur,
    };
  }, {});

  return statesOnDevice;
};

export const fetchConfigEntityStates = async (device: Device) => {
  const res = await fetch(`${basePath}/api/settings`);

  if (!res.ok) {
    console.error("Failed to fetch config states");
    return [];
  }

  const data = await res.json();

  if (!data[device.id]) {
    return {};
  }

  return Object.entries(data[device.id]).reduce((acc, entry) => {
    const [key, state] = entry;
    return {
      ...acc,
      [`config.${key}`]: {
        entity_id: `config.${key}`,
        state,
      },
    };
  }, {});
};
