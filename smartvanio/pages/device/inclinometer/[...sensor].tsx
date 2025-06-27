import { useRouter } from "next/router";
import useWebSocket from "react-use-websocket";
import { useEffect, useState } from "react";
import getConfig from "next/config";
import { Heading } from "@/shared/components/heading";
import { Select } from "@/shared/components/select";
import { Field, Label } from "@/shared/components/fieldset";
import { Input } from "@/shared/components/input";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/components/button";
import {
  Navbar,
  NavbarSection,
  NavbarSpacer,
} from "@/shared/components/navbar";
import { getDomain, getEntities, getStates } from "@/shared/utils";
import { Device as IDevice, FormPoint } from "@/shared/types";
import { updateEntity, updateEntityInConfig } from "@/shared/data/mutation";
import {
  fetchConfigEntityStates,
  fetchEntityStates,
} from "@/shared/data/query";

const { publicRuntimeConfig } = getConfig();
const token = publicRuntimeConfig.token;
const host = publicRuntimeConfig.host;
const socketUrl = `ws://${host}/api/websocket`;

export default function Device() {
  const { query } = useRouter();

  const [deviceId, sensor = 1] = query.sensor || [];
  const { register, reset, control, handleSubmit } = useForm({});

  const [device, setDevice] = useState<IDevice>({} as IDevice);
  const [entities, setEntities] = useState([]);
  const [entityStates, setEntityStates] = useState({});
  const entitiesOnDevice = getEntities(entities);

  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(
    socketUrl,
    {
      onOpen: () => {
        sendJsonMessage({
          type: "auth",
          access_token: token,
        });
      },
      onMessage: (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "auth_ok") {
          sendJsonMessage({ id: 1, type: "config/device_registry/list" });
          sendJsonMessage({ id: 2, type: "config/entity_registry/list" });
        }

        if (msg.type === "result") {
          if (msg.id === 1) {
            const found = msg.result.find((d) => d.id === deviceId);
            setDevice(found);
          }

          if (msg.id === 2) {
            setEntities(msg.result.filter((e) => e.device_id === deviceId));

            sendJsonMessage({
              id: 4,
              type: "subscribe_events",
              event_type: "state_changed",
            });
          }
        }

        if (
          msg.type === "event" &&
          msg.event.event_type === "state_changed" &&
          entities.length
        ) {
          const { entity_id, new_state } = msg.event.data;
          const ids = Object.values(entities).map((entity) => entity.entity_id);

          if (!ids.includes(entity_id)) {
            return;
          }

          setEntityStates((prev) => ({ ...prev, [entity_id]: new_state }));
        }
      },
      shouldReconnect: () => true,
    }
  );

  useEffect(() => {
    if (entities.length && device) {
      const fn = async () => {
        const entityStates = await fetchEntityStates(entities);
        const configStates = await fetchConfigEntityStates(device);

        const states = {
          ...entityStates,
          ...configStates,
        };

        setEntityStates(states);

        const values = Object.entries(getStates(states, device)).reduce(
          (acc, cur) => ({
            ...acc,
            [cur[0]]: cur[1].state,
          }),
          {}
        );

        reset(values);
      };
      fn();
    }
  }, [entities, device, sensor]);

  const states = getStates(entityStates, device);

  const onSubmit = (model: Record<string, string | FormPoint>) => {
    const values = Object.entries<unknown>(model);

    const promises = values
      .filter(([key]) => getDomain(key) !== "config")
      .map((entry) => {
        const [key, value] = entry;
        const entity = entitiesOnDevice[key];

        return updateEntity(entity.entity_id, value as string);
      });

    if (model.config) {
      promises.push(updateEntityInConfig(model.config, device));
    }

    return Promise.all(promises);
  };

  if (!Object.keys(device).length) return <p>Loading device...</p>;

  const stats = [
    {
      name: "Adjusted Pitch",
      value: states[`adjusted_pitch_angle`]?.state,
    },
    {
      name: "Adjusted Roll",
      value: states[`adjusted_roll_angle`]?.state,
    },
  ];

  return (
    <div>
      <Heading>Inclinometer Sensor</Heading>
      <Heading level={4} className="mb-8">
        {device.name}
      </Heading>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-12">
        <Navbar className="bg-zinc-800 p-4 mt-auto sticky top-0">
          <NavbarSpacer />
          <NavbarSection>
            <Button
              type="submit"
              color="indigo"
              className="px-6 py-2 bg-blue-600 text-white rounded transition-colors"
            >
              Save
            </Button>
          </NavbarSection>
        </Navbar>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-zinc-800 pb-12 md:grid-cols-3">
          <Heading>Config</Heading>

          <div className="col-span-2 max-w-128">
            <Field className="mb-4">
              <Label>Name</Label>
              <Input {...register(`config.sensor_${sensor}_name`)} />
            </Field>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field>
                <Label>Min Resistance</Label>
                {/* <Input {...register(`sensor_${sensor}_min_resistance`)} /> */}
              </Field>
              <Field>
                <Label>Max Resistance</Label>
                {/* <Input {...register(`sensor_${sensor}_max_resistance`)} /> */}
              </Field>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-3">
          <div>
            <Heading className="mb-4">Interpolation Points</Heading>

            <div className="grid grid-cols-1 gap-px bg-white/5 sm:grid-cols-2  rounded-lg bg-zinc-800">
              {stats.map((stat) => (
                <div key={stat.name} className=" px-4 py-6 sm:px-6 lg:px-8">
                  <p className="text-sm/6 font-medium text-slate-400">
                    {stat.name}
                  </p>
                  <p className="mt-2 flex items-baseline gap-x-2">
                    <span className="text-4xl font-semibold tracking-tight text-white">
                      {stat.value}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2 max-w-128">
            {/* Interpolation Kind */}
            <Field className="mb-4">
              <Label>Interpolation kind</Label>
              <Select {...register(`sensor_${sensor}_interpolation_kind`)}>
                <option value="linear">Linear</option>
                <option value="cubic">Cubic</option>
                <option value="quadratic">Quadratic</option>
                <option value="slinear">Slinear</option>
              </Select>
            </Field>

            <Field className="mb-4">
              <Label>Sensor Type</Label>
              <Select {...register(`config.sensor_${sensor}_sensorType`)}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="delayed">Delayed</option>
                <option value="canceled">Canceled</option>
              </Select>
            </Field>

            {/* Probe Length */}
            <Field className="mb-4">
              <Label>Probe Length</Label>
              <Select {...register(`config.sensor_${sensor}_probeLength`)}>
                <option value="110">110mm</option>
                <option value="120">120mm</option>
                <option value="150">150mm</option>
                <option value="180">180mm</option>
              </Select>
            </Field>
          </div>
        </div>
      </form>
    </div>
  );
}
