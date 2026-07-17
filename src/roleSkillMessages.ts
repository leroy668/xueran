const roleSkillMessagePrefix = "【角色技能】";

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
