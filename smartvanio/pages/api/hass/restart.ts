import type { NextApiRequest, NextApiResponse } from "next";

const path = process.env.IS_HA
  ? "http://supervisor/core/restart"
  : `http://${process.env.HA_HOST}/core/restart`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const resp = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: err });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to restart Home Assistant" });
  }
}
