"use client"; // Mark as Client Component in Next.js 13+

import { useEffect, useRef, useState } from "react";
import { Heading } from "@/shared/components/heading";
import getConfig from "next/config";
import useWebSocket from "react-use-websocket";
import { Button } from "@/shared/components/button";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/shared/components/description-list";

const names = {
  "smartvanio-inclinometer-card.js": "Inclinometer Card",
  "smartvanio-resistive-sensor-card.js": "Resisitve Sensor Card",
};

const { publicRuntimeConfig } = getConfig();
const { basePath, websocketPath, token } = publicRuntimeConfig;
const socketUrl = basePath + websocketPath;

export default function Home() {
  const [cards, setCards] = useState([]);
  const [installedCards, setInstalledCards] = useState([]);
  const messages = useRef([]);

  useEffect(() => {
    fetch(basePath + "/api/hass/cards", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        }

        return Promise.reject(res);
      })
      .then((data) => setCards(data.cards))
      .catch(console.log);
  }, []);

  const { sendJsonMessage } = useWebSocket(socketUrl, {
    onMessage: (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "auth_ok") {
        sendJsonMessage({
          id: 1,
          type: "lovelace/resources",
        });
      }

      if (msg.id === 1) {
        setInstalledCards(
          msg.result.filter((card) => card.url.includes("/smartvanio/"))
        );
      }

      if (msg.success && msg.result === null) {
        const message =
          messages.current.find((message) => message.id === msg.id) || {};

        setInstalledCards((old) =>
          old.filter((card) => !card.url.includes(message.fileName))
        );
      }

      if (msg?.result?.url) {
        setInstalledCards((old) => [...old, msg.result]);
      }

      messages.current = messages.current.filter(
        (message) => message.id !== msg.id
      );
    },
  });

  const list = cards.map((card) => {
    const installed = installedCards.find((c) => c.url.includes(card)) || {};
    let fileName = card;

    if (installed.url) {
      fileName = installed.url.split("/").at(-1);
    }

    const name = names[fileName];

    return {
      fileName,
      ...installed,
      name,
    };
  });

  //[Log] {id: 1000, type: "result", success: true, result: {id: "8def11a094db4a1ea4ddb8c1fca8deaa", url: "/local/smartvanio/smartvanio-inclinometer-card.js", type: "module"}}

  return (
    <>
      <Heading>Settings</Heading>

      <div className="mt-14">
        <Heading>Custom cards</Heading>
        <DescriptionList className="w-full">
          {list.map((card, i) => {
            return (
              <>
                <DescriptionTerm className="w-96">
                  {card.name} / {card.fileName}
                </DescriptionTerm>
                <DescriptionDetails className="text-right">
                  <Button
                    key={i}
                    onClick={() => {
                      const id = Math.floor(Date.now());
                      if (card.url) {
                        const message = {
                          type: "lovelace/resources/delete",
                          resource_id: card.id,
                          id,
                        };
                        sendJsonMessage(message);
                        messages.current.push({
                          ...message,
                          fileName: card.fileName,
                        });
                      } else {
                        const message = {
                          type: "lovelace/resources/create",
                          url: "/local/smartvanio/" + card.fileName,
                          res_type: "module",
                          id,
                        };
                        sendJsonMessage(message);
                      }
                    }}
                  >
                    {card.url ? "Remove" : "Install"}
                  </Button>
                </DescriptionDetails>
              </>
            );
          })}
        </DescriptionList>
      </div>
    </>
  );
}
