import { roleMap } from "./data";

const demonBluffPrefix = "__xueran_demon_bluffs_v1__:";

export const buildDemonBluffMessage = (roleIds: string[]) => {
  const normalizedRoleIds = roleIds.map((roleId) => roleId.trim());
  if (!isValidDemonBluffRoleIds(normalizedRoleIds)) {
    throw new Error("请选择 3 个不重复的善良角色");
  }
  return `${demonBluffPrefix}${normalizedRoleIds.join(",")}`;
};

export const parseDemonBluffMessage = (body: string) => {
  if (!body.startsWith(demonBluffPrefix)) return null;
  const roleIds = body.slice(demonBluffPrefix.length).split(",");
  return isValidDemonBluffRoleIds(roleIds) ? roleIds : null;
};

export const getDemonBluffSignature = (roleIds: string[]) =>
  [...roleIds].sort().join(",");

const isValidDemonBluffRoleIds = (roleIds: string[]) => {
  if (roleIds.length !== 3 || new Set(roleIds).size !== 3) return false;
  return roleIds.every((roleId) => {
    const role = roleMap.get(roleId);
    return role?.team === "镇民" || role?.team === "外来者";
  });
};
