import React from "react";
import clsx from "clsx";
import { Heading, Subheading } from "../heading";
import { Text } from "../text";

interface InclinometerProps {
  angle: number;
  name?: string;
  inverted?: boolean;
  labels?: string[];
}

const isLevel = (angle: number, tolerance = 1) => Math.abs(angle) <= tolerance;

export const InclinometerIndicator: React.FC<InclinometerProps> = ({
  angle = 0,
  name = "",
  inverted = false,
  labels = [],
}) => {
  const safeAngle = isNaN(Number(angle)) ? "-" : `${Math.abs(Number(angle))}°`;
  const barAngle = inverted ? -angle : angle;
  const adjustedLabels = inverted ? [...labels].reverse() : labels;

  return (
    <div className="flex-1 text-center opacity-80">
      <Heading className="font-semibold">{safeAngle}</Heading>
      <Subheading className="text-sm text-zinc-500 dark:text-zinc-400">
        {name}
      </Subheading>
      <div className="relative flex items-center justify-center h-36 mt-2">
        {adjustedLabels.map((label, index) => (
          <span
            key={index}
            className={clsx(
              "absolute top-0 text-sm transition-colors",
              index === 0 ? "-translate-x-10" : "translate-x-10",
              (index === 0 && barAngle < 0) || (index === 1 && barAngle > 0)
                ? "text-green-500"
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            {label}
          </span>
        ))}

        <div
          className={clsx(
            "absolute bottom-2/5 h-2 rounded bg-zinc-800 dark:bg-zinc-300 transition-all duration-100 ease-in-out",
            isLevel(angle) && "bg-green-500"
          )}
          style={{
            transform: `rotate(${barAngle}deg)`,
            width: "calc(100% - 32px)",
            minWidth: "50px",
            maxWidth: "100px",
          }}
        />
      </div>
    </div>
  );
};
