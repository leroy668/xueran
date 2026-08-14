import type { SyntheticEvent } from "react";

const roleIconAliases: Record<string, string> = {
  "fortune-teller": "fortuneteller",
  "scarlet-woman": "scarletwoman",
  "town-crier": "towncrier",
  "tea-lady": "tealady",
  "devils-advocate": "devilsadvocate",
};

const pngRoleIds = new Set([
  "washerwoman",
  "librarian",
  "investigator",
  "fortune-teller",
  "monk",
  "ravenkeeper",
  "grandmother",
  "gambler",
  "chambermaid",
  "philosopher",
  "juggler",
  "oracle",
  "nightwatchman",
  "recluse",
  "drunk",
  "moonchild",
  "klutz",
  "poisoner",
  "scarlet-woman",
  "godfather",
  "marionette",
  "imp",
  "pukka",
  "vigormortis",
  "nodashii",
]);

const iconBaseUrl = `${import.meta.env.BASE_URL}role-icons/`;
const fallbackIconUrl = `${iconBaseUrl}custom.webp`;

function handleIconError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;

  if (!image.src.endsWith("/custom.webp")) {
    image.src = fallbackIconUrl;
  }
}

export function RoleIcon({
  roleId,
  size = 18,
  className,
}: {
  roleId: string;
  size?: number;
  className?: string;
}) {
  const normalizedRoleId = roleIconAliases[roleId] ?? roleId;
  const fileName = `${normalizedRoleId}.${
    pngRoleIds.has(roleId) ? "png" : "webp"
  }`;
  const renderedSize = Math.round(size * 1.7);

  return (
    <img
      src={`${iconBaseUrl}${fileName}`}
      width={renderedSize}
      height={renderedSize}
      className={["role-icon-image", className].filter(Boolean).join(" ")}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      onError={handleIconError}
    />
  );
}
