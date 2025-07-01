import { useRouter } from "next/router";
import useWebSocket from "react-use-websocket";
import { useEffect, useState } from "react";
import getConfig from "next/config";
import { Heading } from "@/shared/components/heading";
import { Select } from "@/shared/components/select";
import { Field, Label } from "@/shared/components/fieldset";
import { Input } from "@/shared/components/input";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/shared/components/button";
import { TrashIcon, PlusIcon } from "@heroicons/react/16/solid";
import {
  Navbar,
  NavbarItem,
  NavbarSection,
  NavbarSpacer,
} from "@/shared/components/navbar";
import {
  getDomain,
  getEntities,
  getStates,
  transformInterpolationPointsToString,
} from "@/shared/utils";
import { Device as IDevice, FormPoint } from "@/shared/types";
import { updateEntity, updateEntityInConfig } from "@/shared/data/mutation";
import {
  fetchConfigEntityStates,
  fetchEntityStates,
} from "@/shared/data/query";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";

const { publicRuntimeConfig } = getConfig();
const { basePath, websocketPath } = publicRuntimeConfig;

const socketUrl = basePath + websocketPath;

const presetInterpolationPoints = [
  {
    measured: 0,
    mapped: 0,
  },
  {
    measured: 1.29,
    mapped: 25,
  },
  {
    measured: 2.05,
    mapped: 50,
  },
  {
    measured: 2.55,
    mapped: 75,
  },
  {
    measured: 2.8,
    mapped: 95,
  },
];

export default function Device() {
  const { query } = useRouter();

  const [deviceId, sensor = 1] = query.sensor || [];
  const { reset, control, getValues } = useForm({});

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: `sensor_${sensor}_interpolation_points`,
  });

  const [device, setDevice] = useState<IDevice>({} as IDevice);
  const [entities, setEntities] = useState([]);
  const [entityStates, setEntityStates] = useState({});
  const entitiesOnDevice = getEntities(entities);
  const [interpolationPoints, setInterpolationPoints] = useState({
    sensor_1_interpolation_points: null,
    sensor_2_interpolation_points: null,
  });

  const { sendJsonMessage } = useWebSocket(socketUrl, {
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
  });

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

  if (!Object.keys(device).length) return <p>Loading device...</p>;

  const stats = [
    {
      name: "Raw value",
      value: states[`sensor_${sensor}_raw`]?.state,
    },
    {
      name: "Interpolated value",
      value: states[`sensor_${sensor}_interpolated_value`]?.state,
    },
  ];

  return (
    <div>
      <Heading>Resistive Sensor</Heading>
      <Heading level={4} className="mb-8">
        {device.name}
      </Heading>

      <form className="space-y-12">
        <Navbar className="bg-zinc-800 p-4 mt-auto sticky top-0">
          <NavbarSection>
            <NavbarItem
              current={sensor === "1"}
              href={`/device/resistive_sensor/${deviceId}/1`}
            >
              Sensor 1
            </NavbarItem>
            <NavbarItem
              current={sensor === "2"}
              href={`/device/resistive_sensor/${deviceId}/2`}
            >
              Sensor 2
            </NavbarItem>
          </NavbarSection>
          <NavbarSpacer />
          <ConfirmDialog
            color="red"
            triggerLabel="Factory reset"
            text="This will reset the device to factory settings and will require you to add the device to HomeAssistant again!"
            title="Are you sure?"
            onConfirm={() => {
              updateEntity(entitiesOnDevice.factory_reset.entity_id);
            }}
          />
        </Navbar>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-zinc-800 pb-12 md:grid-cols-3">
          <div>
            <Heading className="mb-4">Config</Heading>

            <div className="grid grid-cols-1 gap-px bg-white/5 sm:grid-cols-2  rounded-lg bg-zinc-800">
              <div className=" px-4 py-6 sm:px-6 lg:px-8">
                <p className="text-sm/6 font-medium text-slate-400">
                  Internal resistance
                </p>
                <p className="mt-2 flex items-baseline gap-x-2">
                  <span className="text-4xl font-semibold tracking-tight text-white">
                    {states[`sensor_${sensor}_internal_resistor_value`]?.state}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="col-span-2 max-w-128">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field>
                <Label>Min Resistance</Label>
                <Controller
                  control={control}
                  name={`sensor_${sensor}_min_resistance`}
                  render={({ field }) => (
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);

                        updateEntity(
                          entitiesOnDevice[`sensor_${sensor}_min_resistance`]
                            ?.entity_id,
                          e.target.value
                        );
                      }}
                    />
                  )}
                />
              </Field>
              <Field>
                <Label>Max Resistance</Label>
                <Controller
                  control={control}
                  name={`sensor_${sensor}_max_resistance`}
                  render={({ field }) => (
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);

                        updateEntity(
                          entitiesOnDevice[`sensor_${sensor}_max_resistance`]
                            ?.entity_id,
                          e.target.value
                        );
                      }}
                    />
                  )}
                />
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

              <Controller
                control={control}
                name={`sensor_${sensor}_interpolation_kind`}
                render={({ field }) => (
                  <Select
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);

                      updateEntity(
                        entitiesOnDevice[`sensor_${sensor}_interpolation_kind`]
                          ?.entity_id,
                        e.target.value
                      );
                    }}
                  >
                    <option value="linear">Linear</option>
                    <option value="cubic">Cubic</option>
                    <option value="quadratic">Quadratic</option>
                    <option value="slinear">Slinear</option>
                  </Select>
                )}
              />
            </Field>

            {/* <Field className="mb-4">
              <Label>Sensor Type</Label>
              <Select {...register(`config.sensor_${sensor}_sensorType`)}>
                <option value="active">waterp</option>
                <option value="paused">Paused</option>
                <option value="delayed">Delayed</option>
                <option value="canceled">Canceled</option>
              </Select>
            </Field> */}

            {/* Probe Length */}
            {/* <Field className="mb-4">
              <Label>Probe Length</Label>
              <Select {...register(`config.sensor_${sensor}_probeLength`)}>
                <option value="110">110mm</option>
                <option value="120">120mm</option>
                <option value="150">150mm</option>
                <option value="180">180mm</option>
              </Select>
            </Field> */}

            <Field className="mb-4">
              <div className="grid grid-cols-2">
                <Label>Interpolation points</Label>
                <div className="text-right">
                  <Button
                    outline
                    className="sm mr-2"
                    onClick={() => {
                      if (
                        interpolationPoints[
                          `sensor_${sensor}_interpolation_points`
                        ]
                      ) {
                        replace(
                          interpolationPoints[
                            `sensor_${sensor}_interpolation_points`
                          ]
                        );
                        setInterpolationPoints((old) => ({
                          ...old,
                          [`sensor_${sensor}_interpolation_points`]: null,
                        }));
                      } else {
                        replace(presetInterpolationPoints);
                        setInterpolationPoints((old) => ({
                          ...old,
                          [`sensor_${sensor}_interpolation_points`]: fields,
                        }));
                      }
                    }}
                  >
                    {interpolationPoints[
                      `sensor_${sensor}_interpolation_points`
                    ]
                      ? "Revert"
                      : "Apply default values"}
                  </Button>
                  <Button
                    color="green"
                    onClick={() => {
                      updateEntity(
                        entitiesOnDevice[
                          `sensor_${sensor}_interpolation_points`
                        ]?.entity_id,
                        transformInterpolationPointsToString(
                          getValues(
                            `sensor_${sensor}_interpolation_points`
                          ) as FormPoint[]
                        )
                      );
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-5 gap-4 mb-4">
                    <div className="col-span-2">
                      <Controller
                        control={control}
                        name={`sensor_${sensor}_interpolation_points.${index}.measured`}
                        rules={{
                          required: "A measured value is required",
                        }}
                        render={({ field, fieldState }) => (
                          <>
                            <Input
                              {...field}
                              step=".01"
                              type="number"
                              placeholder="Measured"
                              onChange={(e) => {
                                field.onChange(e);
                              }}
                            />
                            {fieldState.error ? (
                              <p className="text-red-500 text-sm mt-2">
                                {fieldState.error.message}
                              </p>
                            ) : null}
                          </>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <Controller
                        control={control}
                        name={`sensor_${sensor}_interpolation_points.${index}.mapped`}
                        rules={{
                          required: "A mapped value is required",
                        }}
                        render={({ field, fieldState }) => (
                          <>
                            <Input
                              {...field}
                              step=".01"
                              type="number"
                              onChange={(e) => {
                                field.onChange(e);
                              }}
                              placeholder="Mapped"
                            />
                            {fieldState.error ? (
                              <p className="text-red-500 text-sm mt-2">
                                {fieldState.error.message}
                              </p>
                            ) : null}
                          </>
                        )}
                      />
                    </div>
                    <Button type="button" onClick={() => remove(index)}>
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
                <div className="flex space-x-2 align-middle">
                  <Button
                    disabled={!(fields.length < 8)}
                    type="button"
                    onClick={() => append({})}
                  >
                    <PlusIcon />
                  </Button>
                  <span className="text-sm opacity-50 align-middle">
                    {fields.length === 8 ? "Limit reached" : null}
                  </span>
                </div>
              </div>
            </Field>
          </div>
        </div>
      </form>
    </div>
  );
}
