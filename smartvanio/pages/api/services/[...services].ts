// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

const path = process.env.IS_HA
  ? "http://supervisor/core/api"
  : `http://${process.env.HA_HOST}/core/api`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const service = req.url?.split("/api")[1];

  console.log(service);

  if (!service) {
    return res.status(400);
  }

  const endpoint = path + service;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
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
