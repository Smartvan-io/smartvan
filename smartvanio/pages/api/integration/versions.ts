import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import { gte } from "semver";

interface Tag {
  name: string;
}

const versionPath = process.env.IS_HA
  ? "/config/.HA_VERSION"
  : "../config/.HA_VERSION";

const manifestPath = process.env.IS_HA
  ? "/config/custom_components/smartvanio/manifest.json"
  : "../config/custom_components/smartvanio/manifest.json";

const getCurrent = () => {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return manifest.version;
  } catch {
    return null;
  }
};

const getHomeAssistant = () => {
  try {
    return fs.readFileSync(versionPath, "utf-8");
  } catch {
    return null;
  }
};

export const getVersions = async () => {
  const homeassistant = getHomeAssistant();
  const current = getCurrent();
  const repo = "Smartvan-io/smartvanio-integration";

  if (!homeassistant) {
    throw "home assistant version not found";
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/tags`);

  if (!response.ok) {
    const payload = await response.json();
    throw payload;
  }

  const tags = (await response.json()) as Tag[];

  const manifests = await Promise.all(
    tags.map(async (tag: Tag) => {
      const manifestUrl = `https://raw.githubusercontent.com/${repo}/${tag.name}/hacs.json`;

      const res = await fetch(manifestUrl);
      const hacs = await res.json();

      return {
        tag: tag.name.split("v")[1],
        minHomeassistant: hacs.homeassistant,
      };
    })
  );

  const manifestsInRange = manifests.filter((manifest) =>
    gte(homeassistant, manifest.minHomeassistant)
  );

  const currentVersion = manifests.find(
    (manifest) => manifest.tag === current
  ) || {
    tag: null,
    minHomeassistant: null,
  };
  const latestVersion = manifests?.[0];
  const latestCompatibleVersion = manifestsInRange?.[0];

  return {
    latestVersion,
    latestCompatibleVersion,
    homeassistant,
    currentVersion,
  };
};

// pages/api/integration/latest.ts
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const versions = await getVersions();
    res.status(200).json(versions);
  } catch (e) {
    res.status(400).send(e);
  }
}
