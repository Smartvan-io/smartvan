// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

const path = process.env.IS_HA
  ? "http://supervisor/core/api/states"
  : `http://${process.env.HA_HOST}/core/api/states`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const response = await fetch(path, {
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const rawText = await response.text();

    // Try JSON parsing if status is 200
    if (response.ok) {
      const data = JSON.parse(rawText);
      res.status(200).json(data);
    } else {
      res.status(response.status).send(rawText);
    }
  } catch (e) {
    console.error("HA fetch error", e);
    res.status(500).json({ error: "Internal error fetching HA states" });
  }
}
