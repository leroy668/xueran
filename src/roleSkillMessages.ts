import { roles } from "./data";

const roleSkillMessagePrefix = "【角色技能】";
const pairInfoRoleIds = new Set([
  "washerwoman",
  "librarian",
  "investigator",
]);

const hidePairTargetRoles = (body: string) => {
  const resultMarker = "中，有一人是";
  const markerIndex = body.indexOf(resultMarker);
  if (markerIndex < 0) return body;

  const targets = roles.reduce(
    (current, role) => current.replaceAll(` · ${role.name}`, ""),
    body.slice(0, markerIndex),
  );
  const spacedTargets = targets
    .replace(/\s*和(?=\d+号)/g, " 和 ")
    .trimEnd();
  return `${spacedTargets} ${body.slice(markerIndex)}`;
};

export const buildRoleSkillMessage = (body: string) =>
  `${roleSkillMessagePrefix}${body.trim()}`;

export const getRoleSkillMessage = (body: string) => {
  if (!body.startsWith(roleSkillMessagePrefix)) return null;
  return body.slice(roleSkillMessagePrefix.length).trim();
};

export const getNightMessageDisplayBody = (body: string) =>
  getRoleSkillMessage(body) ?? body;

export const getPlayerNightMessageDisplayBody = (
  body: string,
  roleId?: string,
) => {
  const displayBody = getNightMessageDisplayBody(body);
  if (roleId && pairInfoRoleIds.has(roleId)) {
    return hidePairTargetRoles(displayBody);
  }
  if (roleId !== "fortune-teller" || !displayBody.startsWith("本晚查验")) {
    return displayBody;
  }

  const seats = Array.from(
    new Set(displayBody.match(/\d+号/g) ?? []),
  ).slice(0, 2);
  const result =
    displayBody.includes("没有恶魔") ||
    displayBody.includes("无恶魔") ||
    displayBody.includes("否，两人都未被视为恶魔")
      ? "没有恶魔"
      : displayBody.includes("有恶魔") ||
          displayBody.includes("是，其中一人被视为恶魔")
        ? "有恶魔"
        : "";

  if (!result) return displayBody;
  return seats.length
    ? `本晚查验${seats.join("和")}：${result}`
    : `本晚查验结果：${result}`;
};
