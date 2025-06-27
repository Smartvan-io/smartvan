import { DiscoveredDevice } from "@/shared/types";
import { Button } from "../button";

interface IDiscoveredDevice {
  device: DiscoveredDevice;
  onInstall: () => void;
}
export const DiscoveredDeviceCard = ({
  device,
  onInstall,
}: IDiscoveredDevice) => {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-x-4 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <div>
          <h2 className="text-sm/6 font-medium text-zinc-900 dark:text-white">
            {device.name}
          </h2>
        </div>
        <div className="ml-auto">
          <Button
            onClick={() => {
              onInstall();
            }}
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  );
};
