// pages/api/devices.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = process.env.SUPERVISOR_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "Missing SUPERVISOR_TOKEN" });
  }

  try {
    const response = await fetch("http://supervisor/core/api/states", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("Failed to fetch devices:", err);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
}
