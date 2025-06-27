import { Entity, FormPoint, States, Device } from "./types";

export const transformInterpolationPoints = (points: string): FormPoint[] => {
  try {
    const json = JSON.parse(points);

    return json.map((row: string[]) => ({
      measured: row[0],
      mapped: row[1],
    }));
  } catch {
    return [];
  }
};

export const transformInterpolationPointsToString = (
  points: FormPoint[]
): string =>
  `[${points
    .map((point) => `[${point.measured}, ${point.mapped}]`)
    .join(",")}]`;

export const getEntities = (entities: Entity[]): Record<string, Entity> => {
  return entities.reduce((acc, cur) => {
    const [mac] = cur.unique_id.split("-");
    const macEnd = `${mac.split(":").slice(3).join("")}`.toLowerCase();

    const [, entity] = cur.entity_id.split(`_${macEnd}_`);
    return {
      ...acc,
      [entity]: cur,
    };
  }, {});
};

export const getStates = (states: States, device: Device): States => {
  if (!device || !device.connections) {
    return {};
  }

  const [connection = []] = device.connections || [];
  const [, macAddress] = connection;
  const prefix = `${macAddress.split(":").slice(3).join("")}`.toLowerCase();

  return Object.entries(states).reduce((acc, cur) => {
    const [key, value] = cur;
    const [, entity] = key.split(`_${prefix}_`);

    if (key.includes("interpolation_points")) {
      return {
        ...acc,
        [entity || key]: {
          ...value,
          state: transformInterpolationPoints(value.state),
        },
      };
    }

    return {
      ...acc,
      [entity || key]: value,
    };
  }, {});
};

export const getDomain = (entityId: string): string => {
  return entityId.split(".")[0];
};
