import type { RoleDefinition } from "./types";

export const scripts = [
  {
    id: "trouble-brewing",
    name: "Trouble Brewing",
    subtitle: "新手友好的经典剧本",
    count: 22,
    description: "信息、误导与一点点混乱，适合第一次主持。",
  },
  {
    id: "custom",
    name: "自定义剧本",
    subtitle: "把你的角色组合放进来",
    count: 0,
    description: "使用下方角色库自由搭建今晚的剧本。",
  },
] as const;

export const roles: RoleDefinition[] = [
  { id: "washerwoman", name: "洗衣妇", team: "镇民", icon: "洗", short: "开局得知两名玩家中有一名镇民", nightOrder: 10, reminder: "给出两名玩家，其中一人是指定镇民角色。" },
  { id: "librarian", name: "图书管理员", team: "镇民", icon: "图", short: "开局得知一名外来者，或得知没有外来者", nightOrder: 20, reminder: "若有外来者，给出两名玩家和一张外来者角色。" },
  { id: "investigator", name: "调查员", team: "镇民", icon: "查", short: "开局得知一名爪牙，及两名嫌疑人", nightOrder: 30, reminder: "给出两名玩家，其中一人是指定爪牙角色。" },
  { id: "chef", name: "厨师", team: "镇民", icon: "厨", short: "开局得知邪恶阵营相邻的对数", nightOrder: 40, reminder: "环桌计算相邻的邪恶玩家对数。" },
  { id: "empath", name: "共情者", team: "镇民", icon: "感", short: "每晚得知身边邪恶玩家的数量", nightOrder: 100, reminder: "询问共情者左右相邻的存活玩家。" },
  { id: "fortune-teller", name: "占卜师", team: "镇民", icon: "卜", short: "每晚查验两名玩家，其中一名可能是恶魔", nightOrder: 110, reminder: "占卜师选择两人，告知是否包含恶魔；红鲱鱼也会算作是。" },
  { id: "monk", name: "僧侣", team: "镇民", icon: "僧", short: "每晚保护一名玩家免受恶魔攻击", nightOrder: 120, reminder: "僧侣选择一名其他玩家进行保护。" },
  { id: "undertaker", name: "掘墓人", team: "镇民", icon: "墓", short: "每晚得知白天被处决者的角色", nightOrder: 130, reminder: "告诉掘墓人白天处决玩家的角色。" },
  { id: "ravenkeeper", name: "守鸦人", team: "镇民", icon: "鸦", short: "死亡当晚查验一名玩家的角色", nightOrder: 140, reminder: "若守鸦人当晚死亡，让其选择一名玩家并展示角色。" },
  { id: "soldier", name: "士兵", team: "镇民", icon: "兵", short: "免疫恶魔的攻击", nightOrder: 0, reminder: "恶魔选择士兵时，标记攻击无效。" },
  { id: "mayor", name: "镇长", team: "镇民", icon: "镇", short: "三人存活时，可能由恶魔攻击转移", nightOrder: 0, reminder: "若只剩三名存活且无僧侣保护，可考虑转移攻击。" },
  { id: "recluse", name: "隐士", team: "外来者", icon: "隐", short: "可能被当作邪恶角色或爪牙检测", nightOrder: 0, reminder: "在需要时可被视为邪恶、爪牙或恶魔。" },
  { id: "drunk", name: "酒鬼", team: "外来者", icon: "醉", short: "认为自己是一个镇民，但其实不是", nightOrder: 0, reminder: "为酒鬼准备一张虚假的镇民角色标记。" },
  { id: "butler", name: "管家", team: "外来者", icon: "管", short: "每晚选择一名主人，只能在主人同意时投票", nightOrder: 90, reminder: "管家选择一名存活玩家作为主人。" },
  { id: "saint", name: "圣徒", team: "外来者", icon: "圣", short: "若被处决，镇民立即输掉游戏", nightOrder: 0, reminder: "处决圣徒会触发邪恶阵营胜利。" },
  { id: "poisoner", name: "投毒者", team: "爪牙", icon: "毒", short: "每晚使一名玩家中毒", nightOrder: 50, reminder: "投毒者选择一名其他玩家，直到下次夜晚开始前中毒。" },
  { id: "scarlet-woman", name: "猩红女郎", team: "爪牙", icon: "猩", short: "恶魔死亡且存活人数足够时接替恶魔", nightOrder: 60, reminder: "当恶魔死亡且存活玩家不少于五人时，可接替恶魔。" },
  { id: "baron", name: "男爵", team: "爪牙", icon: "爵", short: "剧本中增加两名外来者", nightOrder: 0, reminder: "确认本局外来者数量因为男爵增加。" },
  { id: "imp", name: "小恶魔", team: "恶魔", icon: "魔", short: "每晚杀死一名玩家，也可以自杀传递恶魔", nightOrder: 150, reminder: "恶魔选择一名玩家攻击；若选择自己，传递恶魔角色。" },
];

export const roleMap = new Map(roles.map((role) => [role.id, role]));

export const getRole = (roleId: string) =>
  roleMap.get(roleId) ?? roles[0];

export const getNightRoles = (players: { roleId: string; alive: boolean }[]) =>
  players
    .filter((player) => player.alive && getRole(player.roleId).nightOrder > 0)
    .map((player) => getRole(player.roleId))
    .sort((a, b) => a.nightOrder - b.nightOrder);
