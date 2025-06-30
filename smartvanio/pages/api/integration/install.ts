// pages/api/integration/install.ts
import { exec } from "child_process";
import { NextApiRequest, NextApiResponse } from "next";
import { getVersions } from "./versions";

const path = process.env.IS_HA
  ? "/addons/smartvanio/install-integration.sh"
  : "./install-integration.sh";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { latestCompatibleVersion } = await getVersions();
    const { tag } = latestCompatibleVersion;
    const cmd = `${path} ${tag}`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: stderr });
      }

      res.status(200).json({ currentVersion: latestCompatibleVersion });
    });
  } catch (e) {
    res.status(400).send(e);
  }
}
