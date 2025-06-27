import { useEffect, useState } from "react";
import { Heading } from "../heading";
import { eq, gt } from "semver";
import { Versions } from "./types";
import { Button } from "../button";
import getConfig from "next/config";
import Image from "next/image";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "../dialog";

const { publicRuntimeConfig } = getConfig();
const { basePath } = publicRuntimeConfig;

enum Statuses {
  "UP_TO_DATE" = "UP_TO_DATE",
  "UPDATE_REQUIRES_HOMEASSISTANT_UPDATE" = "UPDATE_REQUIRES_HOMEASSISTANT_UPDATE",
  "UPDATE_AVAILABLE" = "UPDATE_AVAILABLE",
  "NOT_INSTALLED" = "NOT_INSTALLED",
  "LOADING" = "LOADING",
}

const statuses = {
  [Statuses.UP_TO_DATE]: "Your integration is up to date",
  [Statuses.UPDATE_REQUIRES_HOMEASSISTANT_UPDATE]:
    "Update available but its requires an update to Home Assistant",
  [Statuses.UPDATE_AVAILABLE]: "Update available",
  [Statuses.NOT_INSTALLED]: "The integration is not currently installed",
  [Statuses.LOADING]: "-",
};

const getStatus = (versions: Versions) => {
  if (versions.currentVersion.tag === "-") {
    return Statuses.LOADING;
  }

  if (versions.currentVersion.tag === null) {
    return Statuses.NOT_INSTALLED;
  }

  if (eq(versions.latestVersion.tag, versions.currentVersion.tag)) {
    return Statuses.UP_TO_DATE;
  }

  if (gt(versions.latestVersion.tag, versions.latestCompatibleVersion.tag)) {
    return Statuses.UPDATE_REQUIRES_HOMEASSISTANT_UPDATE;
  }

  return Statuses.UPDATE_AVAILABLE;
};

interface IMessageProps {
  versions: Versions;
  onUpdate: () => void;
}

const Message = ({ versions, onUpdate }: IMessageProps) => {
  const status = getStatus(versions);

  if (versions.error) {
    return (
      <div className="rounded-md bg-red-100 p-4">
        <div className="text-sm text-red-700 font-bold">
          <p>There has been a problem</p>
        </div>
      </div>
    );
  }

  if (status === Statuses.NOT_INSTALLED) {
    return (
      <Button className="mt-2 w-full" color="red" onClick={() => onUpdate()}>
        Install
      </Button>
    );
  }

  if (status === Statuses.UPDATE_AVAILABLE) {
    return (
      <Button className="mt-2 w-full" color="red" onClick={() => onUpdate()}>
        Update
      </Button>
    );
  }

  if (status === Statuses.UPDATE_REQUIRES_HOMEASSISTANT_UPDATE) {
    return (
      <div className="rounded-md bg-blue-100 p-4">
        <div className="flex">
          <div>
            <div className="text-sm text-blue-700 font-bold">
              <p>{statuses[Statuses.UPDATE_REQUIRES_HOMEASSISTANT_UPDATE]}</p>
            </div>
            <div className="mt-4">
              <Button
                href="/config/updates"
                type="button"
                color="blue"
                className="cursor-pointer "
              >
                View status
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-green-100 p-4" onClick={() => onUpdate()}>
      <div className="text-sm text-green-700 font-bold">
        <p>{statuses[Statuses.UP_TO_DATE]}</p>
      </div>
    </div>
  );
};

export const IntegrationCard = () => {
  const [versions, setVersions] = useState<Versions>({
    latestVersion: {
      tag: "-",
      minHomeassistant: "-",
    },
    latestCompatibleVersion: {
      tag: "-",
      minHomeassistant: "-",
    },
    homeassistant: "-",
    currentVersion: {
      tag: "-",
      minHomeassistant: "-",
    },
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const getVersions = async () => {
      try {
        const response = await fetch(basePath + "/api/integration/versions");
        const data = await response.json();

        if (response.ok) {
          return setVersions(data);
        } else {
          return setVersions((old) => ({ ...old, error: `${data.message}` }));
        }
      } catch (e) {
        return setVersions((old) => ({ ...old, error: `${e}` }));
      }
    };

    const fn = async () => {
      await getVersions();
    };

    fn();
  }, []);

  const list = [
    {
      name: "Installed Version",
      value: versions.currentVersion.tag,
      // subtext: `requires ${versions.currentVersion.minHomeassistant} core`,
    },
    {
      name: "Integration Latest Version",
      value: versions.latestVersion.tag,
      subtext: `requires ${versions.latestVersion.minHomeassistant} core`,
    },
    {
      name: "Integration Latest Compatible Version",
      value: versions.latestCompatibleVersion.tag,
      subtext: `requires ${versions.latestVersion.minHomeassistant} core`,
    },
    { name: "Home Assistant Core", value: versions.homeassistant },
  ];

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700">
      <Heading className="p-6">Integration</Heading>
      <div className="flex justify-center">
        <Image
          width={256}
          height={256}
          alt="smartvan.io"
          src="https://brands.home-assistant.io/smartvanio/dark_icon.png"
          className="size-24 margin-auto flex-none rounded-lg bg-white object-cover ring-1 ring-zinc-900/10 dark:bg-zinc-900 dark:ring-white/10"
        />
      </div>
      {list.length ? (
        <dl className="-my-3 divide-y divide-zinc-100 px-6 py-4 text-sm/6 dark:divide-zinc-700">
          {list.map((item) => (
            <div key={item.name} className="flex justify-between gap-x-4 py-3">
              <dt className="text-zinc-500 dark:text-zinc-400">
                <div>{item.name}</div>
                {item.subtext && item.subtext !== null ? (
                  <div className="text-xs text-zinc-100">({item.subtext})</div>
                ) : null}
              </dt>
              <dd className="flex items-start gap-x-2">
                <div className="font-medium text-zinc-900 dark:text-white">
                  {item.value}
                </div>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="p-6 pt-0">
        <Message
          versions={versions}
          onUpdate={async () => {
            const response = await fetch(basePath + "/api/integration/install");
            const { currentVersion } = await response.json();

            if (response.ok) {
              setVersions((old) => ({ ...old, currentVersion }));
              setIsOpen(true);
            }
          }}
        />
      </div>
      <Dialog open={isOpen} onClose={setIsOpen}>
        <DialogTitle>Restart needed</DialogTitle>
        <DialogDescription>
          In order to complete the install, Home Assistant needs to be restarted
        </DialogDescription>
        <DialogActions>
          <Button
            color="red"
            onClick={() => {
              fetch(basePath + "/api/hass/restart", {
                method: "POST",
              }).then(() => {
                setIsOpen(false);
              });
            }}
          >
            Restart
          </Button>
          <Button onClick={() => setIsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
