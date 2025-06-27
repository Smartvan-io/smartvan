import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import get from "lodash.get";
import merge from "lodash.merge";

const filePath = path.join(process.cwd(), "/data", "settings.json");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    query: { key },
    method,
  } = req;

  if (method === "GET") {
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(200).json({});
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      if (!key) {
        res.status(200).json({});
      }

      res.status(200).json(get(data, key, {}));
    } catch (err) {
      console.error("Failed to read settings:", err);
      res.status(500).json({ error: "Failed to read settings" });
    }
  } else if (req.method === "PUT") {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const update = JSON.stringify(
        merge(data, {
          [key]: req.body,
        }),
        null,
        2
      );

      fs.writeFileSync(filePath, update, "utf-8");
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("Failed to save settings:", err);
      res.status(500).json({ error: "Failed to save settings" });
    }
  } else {
    res.status(405).end(); // Method Not Allowed
  }
}
