import type { SyntheticEvent } from "react";

const roleIconAliases: Record<string, string> = {
  "fortune-teller": "fortuneteller",
  "scarlet-woman": "scarletwoman",
};

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
  const fileName = roleIconAliases[roleId] ?? roleId;
  const renderedSize = Math.round(size * 1.7);

  return (
    <img
      src={`${iconBaseUrl}${fileName}.webp`}
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
