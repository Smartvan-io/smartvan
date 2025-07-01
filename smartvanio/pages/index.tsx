"use client"; // Mark as Client Component in Next.js 13+

import { useState } from "react";
import { Heading } from "@/shared/components/heading";
import getConfig from "next/config";
import useWebSocket from "react-use-websocket";
import { DiscoveredDevice, Entity, Device as IDevice } from "../shared/types";
import { IntegrationCard } from "@/shared/components/integration-card";
import { Device } from "@/shared/components/device-card";
import { DiscoveredDeviceCard } from "@/shared/components/discovered-device-card";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

const { publicRuntimeConfig } = getConfig();
const { basePath, websocketPath } = publicRuntimeConfig;
const socketUrl = basePath + websocketPath;

enum Message {
  devices = 1,
  entries = 2,
  state_change = 4,
  states = 8,
  flow_subscribe = 16,
}

const waitFor = (time: number) => new Promise((res) => setTimeout(res, time));

export default function Home() {
  const [devices, setDevices] = useState<{ result: IDevice[]; status: string }>(
    { result: [], status: "" }
  );
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [states, setStates] = useState({});
  const [url, setUrl] = useState(socketUrl + `?cacheBust=${Date.now()}`);

  const { sendJsonMessage } = useWebSocket(url, {
    onMessage: (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "auth_ok") {
        // Request device list
        sendJsonMessage({
          id: Message.devices,
          type: "config/device_registry/list",
        });
      }

      if (msg.type === "result" && msg.id === Message.devices) {
        sendJsonMessage({
          id: Message.entries,
          type: "config/entity_registry/list",
        });

        setDevices({
          result: msg.result.filter(
            (device: IDevice) => device.manufacturer === "smartvanio"
          ),
          status: "loaded",
        });
      }

      if (msg.type === "result" && msg.id === Message.entries) {
        sendJsonMessage({
          id: Message.state_change,
          type: "subscribe_events",
          event_type: "state_changed",
        });

        sendJsonMessage({
          id: Message.states,
          type: "get_states",
        });

        sendJsonMessage({
          id: Message.flow_subscribe,
          type: "config_entries/flow/progress",
        });

        const deviceIds = devices.map((device) => device.id);

        setEntities(
          msg.result.filter((entity) => deviceIds.includes(entity.device_id))
        );
      }

      if (msg.type === "result" && msg.id === Message.states) {
        const entityIds = entities.map((entity) => entity.entity_id);

        setStates(
          msg.result
            .filter((e) => entityIds.includes(e.entity_id))
            .reduce((acc, cur) => ({ ...acc, [cur.entity_id]: cur }), {})
        );
      }

      if (msg.type === "result" && msg.id === Message.flow_subscribe) {
        setDiscovered(
          msg.result.map((device) => ({
            context: device.context,
            id: device.context.unique_id,
            flowId: device.flow_id,
            stepId: device.step_id,
            name: device.context?.title_placeholders?.name,
          }))
        );
      }

      if (
        msg.type === "event" &&
        msg.event.event_type === "state_changed" &&
        entities.length
      ) {
        const { entity_id, new_state } = msg.event.data;
        const ids = entities.map((entity) => entity.entity_id);

        if (!ids.includes(entity_id)) {
          return;
        }

        setStates((prev) => ({ ...prev, [entity_id]: new_state }));
      }
    },
  });

  const smartvanDeviceIds = devices.result.map((device) => device.id);

  const smartvanEntities = entities.filter((entity) =>
    smartvanDeviceIds.includes(entity.device_id)
  );

  return (
    <>
      <div className="mt-4 md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6">
        <div className="sm:col-span-1 mb-8">
          <IntegrationCard />
        </div>
        <div className="sm:col-span-1 lg:col-span-2">
          {discovered.length ? (
            <div className="mb-8 pb-8 border-b border-b-zinc-700">
              <Heading className="mb-4">Discovered Devices</Heading>
              <ul
                role="list"
                className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-8 xl:gap-x-8"
              >
                {discovered.map((device) => (
                  <DiscoveredDeviceCard
                    key={device.id}
                    device={device}
                    onInstall={async () => {
                      try {
                        const response = await fetch(
                          basePath + "/api/hass/install-device",
                          {
                            method: "POST",
                            body: JSON.stringify({ id: device.flowId }),
                          }
                        );
                        const data = await response.json();

                        await waitFor(300);
                        setUrl(
                          (old) =>
                            `${old.split("?")[0]}?cacheBust=${Date.now()}`
                        );
                      } catch (e) {
                        console.log(e);
                      }
                    }}
                  />
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Heading className="mb-4">Installed Devices</Heading>

            {!devices.result.length && devices.status === "loaded" && (
              <div className="rounded-md bg-blue-50 p-4">
                <div className="flex">
                  <div className="shrink-0">
                    <InformationCircleIcon
                      aria-hidden="true"
                      className="size-5 text-blue-400"
                    />
                  </div>
                  <div className="ml-3 flex-1 md:flex md:justify-between">
                    <p className="text-sm text-blue-700">
                      There are currently no devices installed, make sure the
                      integration is installed and the devices are connected to
                      the same network as HomeAssistant
                    </p>
                  </div>
                </div>
              </div>
            )}

            <ul
              role="list"
              className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-8 xl:gap-x-8"
            >
              {devices.result.map((device) => (
                <li key={device.id}>
                  <Device
                    device={device}
                    entities={smartvanEntities}
                    states={states}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
