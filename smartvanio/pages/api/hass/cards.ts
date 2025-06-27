import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const cardsDir = "/config/www/smartvanio";

  if (process.env.IS_HA !== "true" || !process.env.IS_HA) {
    return res.status(200).json({
      cards: [
        "smartvanio-inclinometer-card.js",
        "smartvanio-resistive-sensor-card.js",
      ],
    });
  }

  try {
    const files = fs
      .readdirSync(cardsDir)
      .filter((file) => file.endsWith(".js"));

    res.status(200).json({ cards: files });
  } catch (error) {
    console.error("Failed to read card files:", error);
    res.status(500).json({ error: "Failed to read custom cards" });
  }
}
