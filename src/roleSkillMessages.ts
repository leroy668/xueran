const roleSkillMessagePrefix = "【角色技能】";

export const buildRoleSkillMessage = (body: string) =>
  `${roleSkillMessagePrefix}${body.trim()}`;

export const getRoleSkillMessage = (body: string) => {
  if (!body.startsWith(roleSkillMessagePrefix)) return null;
  return body.slice(roleSkillMessagePrefix.length).trim();
};

export const getNightMessageDisplayBody = (body: string) =>
  getRoleSkillMessage(body) ?? body;
