import type { RoleDefinition } from "./types";

const chineseWikiTitleByRoleId: Record<string, string> = {
  undertaker: "送葬者",
  virgin: "贞洁者",
  slayer: "猎手",
};

export const getRoleDetailsUrl = (
  role: Pick<RoleDefinition, "id" | "name">,
) => {
  const chineseWikiTitle = chineseWikiTitleByRoleId[role.id] ?? role.name;
  return `https://clocktower-wiki.gstonegames.com/index.php?title=${encodeURIComponent(chineseWikiTitle)}`;
};
