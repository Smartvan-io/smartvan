import { Button } from "../button";
import { EyeIcon } from "@heroicons/react/24/outline";
import { Entity, Device as IDevice, States } from "../../types";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "../description-list";
import { Text } from "../text";

export const Device = ({
  device,
  entities,
  states,
}: {
  device: IDevice;
  entities: Entity[];
  states: States;
}) => {
  const [, mac] = device.connections[0];
  const entitiesOnDevice = entities
    .filter((entity) => entity.device_id === device.id)
    .reduce((acc, cur) => {
      const macEnd = mac.split(":").slice(3).join("");
      const [, entity] = cur.entity_id.split(`_${macEnd}_`);

      return {
        ...acc,
        [entity]: {
          ...cur,
          state: states[cur.entity_id]?.state,
        },
      };
    }, {});

  const arr = Object.values<Entity & { state?: string }>(entitiesOnDevice);
  const offline =
    arr.length && arr.every((entity) => entity.state === "unavailable");

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-x-4 border-b border-zinc-900/5 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <div>
          <h2 className="text-sm/6 font-medium text-zinc-900 dark:text-white">
            {device.name}
          </h2>
          <small className="block text-zinc-900 dark:text-zinc-500">
            <span>{device.model}</span>
            {offline ? (
              <span className="inline-flex items-center rounded-md ml-2 bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                Offline
              </span>
            ) : null}
          </small>
        </div>
        <div className="ml-auto">
          <Button href={`/device/${device.model}/${device.id}/1`}>
            <EyeIcon />
          </Button>
        </div>
      </div>
      <dl className="-my-3 divide-y divide-zinc-100 px-6 py-4 text-sm/6 dark:divide-zinc-700">
        <div className="flex justify-between gap-x-4 py-3">
          <dt className="text-zinc-500 dark:text-zinc-400">
            <Text>Entities</Text>
          </dt>
          <dd className="flex items-start gap-x-2">
            <div className="font-medium text-zinc-900 dark:text-white">
              <Text>{arr.length}</Text>
            </div>
          </dd>
        </div>
      </dl>
    </div>
  );
};
