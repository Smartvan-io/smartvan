import { useRouter } from "next/router";
import useWebSocket from "react-use-websocket";
import { useEffect, useState } from "react";
import getConfig from "next/config";
import { Heading, Subheading } from "@/shared/components/heading";
import { Select } from "@/shared/components/select";
import {
  Description,
  Field,
  FieldGroup,
  Label,
} from "@/shared/components/fieldset";
import { Input } from "@/shared/components/input";
import { Controller, useForm } from "react-hook-form";
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
import { Switch, SwitchField } from "@/shared/components/switch";
import Image from "next/image";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { InclinometerIndicator } from "@/shared/components/level-indicator";

const { publicRuntimeConfig } = getConfig();
const { basePath, websocketPath } = publicRuntimeConfig;
const socketUrl = basePath + websocketPath;

export default function Device() {
  const { query } = useRouter();

  const [deviceId, sensor = 1] = query.sensor || [];
  const { reset, control, handleSubmit, setValue } = useForm({});

  const [device, setDevice] = useState<IDevice>({} as IDevice);
  const [entities, setEntities] = useState([]);
  const [entityStates, setEntityStates] = useState({});
  const entitiesOnDevice = getEntities(entities);

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
        updateEntity(entitiesOnDevice.toggle_inclinometer?.entity_id, true);
      };
      fn();
    }
  }, [entities, device, sensor, reset]);

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

  const pitch = [
    {
      name: "Adjusted pitch angle",
      value: states[`adjusted_pitch_angle`]?.state,
    },
    {
      name: "Actual pitch angle",
      value: states[`actual_pitch_angle`]?.state,
    },
  ];

  const roll = [
    {
      name: "Adjusted roll angle",
      value: states[`adjusted_roll_angle`]?.state,
    },
    {
      name: "Actual roll angle",
      value: states[`actual_roll_angle`]?.state,
    },
  ];

  const orientations = [
    {
      name: "Option 1",
      title: "Flat",
      src: basePath + "/flat.jpg",
    },
    {
      name: "Option 2",
      title: "Upright",
      src: basePath + "/upright.jpg",
    },
    {
      name: "Option 3",
      title: "Upright Sideways",
      src: basePath + "/upright_sideways.jpg",
    },
    {
      name: "Option 4",
      title: "Flat Sideways ",
      src: basePath + "/flat_sideways.jpg",
    },
  ];

  const orientation = states.orientation?.state;

  return (
    <div>
      <Heading>Inclinometer Sensor</Heading>
      <Heading level={4} className="mb-8">
        {device.name}
      </Heading>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-12">
        <Navbar className="bg-zinc-800 p-4 mt-auto sticky top-0">
          <NavbarSection>
            <SwitchField>
              <Label>Enable inclinometer</Label>
              <Switch
                checked={states.toggle_inclinometer?.state === "on"}
                name="allow_embedding"
                onChange={(value) => {
                  updateEntity(
                    entitiesOnDevice.toggle_inclinometer.entity_id,
                    value
                  );
                }}
              />
            </SwitchField>
          </NavbarSection>
          <NavbarSpacer />
          <NavbarSection>
            <ConfirmDialog
              color="red"
              triggerLabel="Factory reset"
              text="This will reset the device to factory settings and will require you to add the device to HomeAssistant again!"
              title="Are you sure?"
              onConfirm={() => {
                updateEntity(entitiesOnDevice.factory_reset.entity_id);
              }}
            />
          </NavbarSection>
        </Navbar>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-zinc-800 pb-12">
          <div>
            <Heading className="mb-4">Orientation</Heading>

            <div className="grid grid-cols-4 gap-8 rounded-lg">
              {orientations.map((thumb) => (
                <div
                  key={thumb.title}
                  className="cursor-pointer"
                  onClick={() => {
                    updateEntity(
                      entitiesOnDevice.orientation.entity_id,
                      thumb.name
                    );
                  }}
                >
                  <Subheading level={6} className="mb-2 text-sm">
                    {thumb.title}
                  </Subheading>
                  <div
                    className={`rounded-lg overflow-hidden ${
                      orientation === thumb.name ? "ring-4 ring-yellow-300" : ""
                    }`}
                  >
                    <Image
                      height={1000}
                      width={1000}
                      alt={thumb.title}
                      src={thumb.src}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-2">
          <div>
            <Heading className="mb-4">Pitch</Heading>

            <div className="grid grid-cols-1 gap-px bg-white/5 sm:grid-cols-2 mb-4 rounded-lg bg-zinc-800">
              {pitch.map((stat) => (
                <div
                  key={stat.name}
                  className=" px-4 py-6 sm:px-6 lg:px-8 text-center"
                >
                  <InclinometerIndicator
                    angle={Number(stat.value)}
                    name={stat.name}
                    labels={["Front", "Back"]}
                  />
                </div>
              ))}
            </div>

            <FieldGroup>
              <Field>
                <Label>Calibration offset</Label>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-6 sm:gap-4 pt-2">
                  <div className="sm:col-span-4">
                    <Controller
                      name="pitch_adjustment_angle"
                      control={control}
                      render={({ field, fieldState }) => {
                        return (
                          <Input
                            {...field}
                            type="number"
                            step={0.1}
                            onChange={(e) => {
                              const { value } = e.target;
                              field.onChange(e);

                              if (fieldState.error) {
                                return;
                              }

                              updateEntity(
                                entitiesOnDevice.pitch_adjustment_angle
                                  .entity_id,
                                value
                              );
                            }}
                          />
                        );
                      }}
                    />
                  </div>

                  <Button
                    onClick={() => {
                      setValue(
                        "pitch_adjustment_angle",
                        states.actual_pitch_angle?.state || 0
                      );
                      updateEntity(entitiesOnDevice.calibrate_pitch.entity_id);
                    }}
                  >
                    Calibrate
                  </Button>
                  <Button
                    onClick={() => {
                      setValue("pitch_adjustment_angle", 0);
                      updateEntity(
                        entitiesOnDevice.reset_pitch_calibration.entity_id
                      );
                    }}
                    color="red"
                  >
                    Reset
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </div>

          <div>
            <Heading className="mb-4">Roll</Heading>

            <div className="grid grid-cols-1 gap-px bg-white/5 sm:grid-cols-2 mb-4 rounded-lg bg-zinc-800">
              {roll.map((stat) => (
                <div
                  key={stat.name}
                  className="px-4 py-6 sm:px-6 lg:px-8 text-center"
                >
                  <InclinometerIndicator
                    angle={Number(stat.value)}
                    name={stat.name}
                    labels={["Left", "Right"]}
                  />
                </div>
              ))}
            </div>

            <FieldGroup>
              <Field>
                <Label>Calibration offset</Label>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-6 sm:gap-4 pt-2">
                  <div className="sm:col-span-4">
                    <Controller
                      name="roll_adjustment_angle"
                      control={control}
                      render={({ field }) => {
                        return (
                          <Input
                            {...field}
                            // value={states.roll_adjustment_angle?.state || 0}
                            type="number"
                            step={0.1}
                            onChange={(e) => {
                              const { value } = e.target;
                              field.onChange(e);
                              updateEntity(
                                entitiesOnDevice.roll_adjustment_angle
                                  .entity_id,
                                value
                              );
                            }}
                          />
                        );
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      setValue(
                        "roll_adjustment_angle",
                        states.actual_roll_angle?.state || 0
                      );
                      updateEntity(entitiesOnDevice.calibrate_roll.entity_id);
                    }}
                  >
                    Calibrate
                  </Button>
                  <Button
                    onClick={() => {
                      setValue("roll_adjustment_angle", 0);
                      updateEntity(
                        entitiesOnDevice.reset_roll_calibration.entity_id
                      );
                    }}
                    color="red"
                  >
                    Reset
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </div>
        </div>
      </form>
    </div>
  );
}
