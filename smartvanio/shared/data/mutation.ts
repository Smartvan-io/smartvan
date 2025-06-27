import getConfig from "next/config";
import { Device } from "../types";
import { getDomain } from "../utils";

const { publicRuntimeConfig } = getConfig();
const token = publicRuntimeConfig.token;

const updateServiceMap: Record<string, { service: string; field: string }> = {
  input_number: { service: "input_number/set_value", field: "value" },
  number: { service: "number/set_value", field: "value" },
  input_select: { service: "input_select/select_option", field: "option" },
  input_text: { service: "input_text/set_value", field: "value" },
  text: { service: "text/set_value", field: "value" }, // New `text` helper platform
};

export const updateEntity = async (
  entityId: string,
  newValue: string | number
) => {
  const domain = getDomain(entityId);
  const config = updateServiceMap[domain];

  if (!config) {
    return;
  }

  const { service, field } = config;

  const url = `/api/services/${service}`;
  const payload = {
    entity_id: entityId,
    [field]: newValue,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Failed to update ${entityId}`);
  }
};

export const updateEntityInConfig = async (payload, device: Device) => {
  const res = await fetch(`/api/settings/${device.id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Failed to update`);
  }
};
