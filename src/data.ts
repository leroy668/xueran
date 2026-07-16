import type { RoleDefinition } from "./types";

export type NightAction =
  | {
      kind: "role";
      id: string;
      name: string;
      order: number;
      role: RoleDefinition;
    }
  | {
      kind: "system";
      id: "dusk" | "minion-info" | "demon-info" | "dawn";
      name: string;
      order: number;
      reminder: string;
    };

const troubleBrewingRoleIds = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune-teller",
  "monk",
  "undertaker",
  "ravenkeeper",
  "virgin",
  "slayer",
  "soldier",
  "mayor",
  "recluse",
  "drunk",
  "butler",
  "saint",
  "poisoner",
  "scarlet-woman",
  "baron",
  "spy",
  "imp",
] as const;

const missingGodRoleIds = [
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
  "goon",
  "poisoner",
  "scarlet-woman",
  "godfather",
  "marionette",
  "imp",
  "pukka",
  "vigormortis",
  "nodashii",
] as const;

export const scripts = [
  {
    id: "trouble-brewing",
    name: "Trouble Brewing",
    subtitle: "新手友好的经典剧本",
    count: 22,
    description: "信息、误导与一点点混乱，适合第一次主持。",
    roleIds: troubleBrewingRoleIds,
  },
  {
    id: "missing-god",
    name: "上帝缺失",
    subtitle: "跨剧本角色组合",
    count: 25,
    description: "围绕中毒、伪装与夜间信息展开的进阶剧本。",
    roleIds: missingGodRoleIds,
  },
  {
    id: "custom",
    name: "自定义剧本",
    subtitle: "把你的角色组合放进来",
    count: 0,
    description: "使用下方角色库自由搭建今晚的剧本。",
    roleIds: [],
  },
] as const;

export const roles: RoleDefinition[] = [
  { id: "washerwoman", name: "洗衣妇", team: "镇民", icon: "洗", short: "首夜得知两名玩家和一个镇民角色，其中一人是该角色", firstNightOrder: 53, otherNightOrder: 0, reminder: "给出两名玩家，其中一人是指定镇民角色。" },
  { id: "librarian", name: "图书管理员", team: "镇民", icon: "图", short: "首夜得知两名玩家和一个外来者角色，其中一人是该角色；或得知场上没有外来者", firstNightOrder: 54, otherNightOrder: 0, reminder: "若有外来者，给出两名玩家和一张外来者角色。" },
  { id: "investigator", name: "调查员", team: "镇民", icon: "查", short: "首夜得知两名玩家和一个爪牙角色，其中一人是该角色", firstNightOrder: 55, otherNightOrder: 0, reminder: "给出两名玩家，其中一人是指定爪牙角色。" },
  { id: "chef", name: "厨师", team: "镇民", icon: "厨", short: "首夜得知相邻邪恶玩家共有多少对", firstNightOrder: 56, otherNightOrder: 0, reminder: "环桌计算相邻的邪恶玩家对数。" },
  { id: "empath", name: "共情者", team: "镇民", icon: "感", short: "每晚得知两名存活邻座中有多少名邪恶玩家", firstNightOrder: 57, otherNightOrder: 75, reminder: "询问共情者左右相邻的存活玩家。" },
  { id: "fortune-teller", name: "占卜师", team: "镇民", icon: "卜", short: "每晚选择两名玩家，得知其中是否有恶魔", firstNightOrder: 58, otherNightOrder: 76, reminder: "占卜师选择两人，告知是否包含恶魔；红鲱鱼也会算作是。" },
  { id: "monk", name: "僧侣", team: "镇民", icon: "僧", short: "每个夜晚*保护一名其他玩家免受恶魔负面能力影响", firstNightOrder: 0, otherNightOrder: 26, reminder: "僧侣选择一名其他玩家进行保护。" },
  { id: "undertaker", name: "掘墓人", team: "镇民", icon: "墓", short: "每个夜晚*得知今天被处决玩家的角色", firstNightOrder: 0, otherNightOrder: 77, reminder: "告诉掘墓人白天处决玩家的角色。" },
  { id: "ravenkeeper", name: "守鸦人", team: "镇民", icon: "鸦", short: "若在夜晚死亡，选择一名玩家并得知他的角色", firstNightOrder: 0, otherNightOrder: 74, reminder: "若守鸦人当晚死亡，让其选择一名玩家并展示角色。" },
  { id: "virgin", name: "处女", team: "镇民", icon: "处", short: "首次被镇民提名时，该镇民可能立即被处决", firstNightOrder: 0, otherNightOrder: 0, reminder: "若首次提名处女的是镇民，立即处决该镇民并结束白天。" },
  { id: "slayer", name: "杀手", team: "镇民", icon: "杀", short: "每局一次公开选择一名玩家，若其是恶魔则死亡", firstNightOrder: 0, otherNightOrder: 0, reminder: "杀手使用能力后记录已使用；命中恶魔时恶魔死亡。" },
  { id: "soldier", name: "士兵", team: "镇民", icon: "兵", short: "免疫恶魔的负面能力", firstNightOrder: 0, otherNightOrder: 0, reminder: "恶魔选择士兵时，标记攻击无效。" },
  { id: "mayor", name: "镇长", team: "镇民", icon: "镇", short: "三人存活且白天无人被处决时善良获胜；恶魔攻击可能转移", firstNightOrder: 0, otherNightOrder: 0, reminder: "若只剩三名存活且无僧侣保护，可考虑转移攻击。" },
  { id: "grandmother", name: "祖母", team: "镇民", icon: "祖", short: "首夜得知一名善良玩家及其角色；若恶魔杀死他，你也死亡", firstNightOrder: 60, otherNightOrder: 72, reminder: "首夜展示孙辈及其角色；若孙辈被恶魔杀死，祖母同时死亡。" },
  { id: "gambler", name: "赌徒", team: "镇民", icon: "赌", short: "每个夜晚*选择一名玩家并猜测其角色，猜错则死亡", firstNightOrder: 0, otherNightOrder: 23, reminder: "赌徒选择玩家和角色；若猜测错误，赌徒死亡。" },
  { id: "chambermaid", name: "侍女", team: "镇民", icon: "侍", short: "每晚选择两名其他存活玩家，得知其中有多少人因自身能力醒来", firstNightOrder: 77, otherNightOrder: 93, reminder: "侍女选择两名其他存活玩家，告知因自身能力醒来的人数。" },
  { id: "philosopher", name: "哲学家", team: "镇民", icon: "哲", short: "每局一次，在夜晚获得一个善良角色的能力；若该角色在场，他醉酒", firstNightOrder: 14, otherNightOrder: 10, reminder: "哲学家可选择一个善良角色并获得其能力；必要时替换角色标记。" },
  { id: "juggler", name: "杂耍艺人", team: "镇民", icon: "耍", short: "首日公开猜测至多五名玩家的角色，当晚得知猜对数量", firstNightOrder: 0, otherNightOrder: 83, reminder: "在首日后的夜晚，告知杂耍艺人猜对的角色数量。" },
  { id: "oracle", name: "神谕者", team: "镇民", icon: "谕", short: "每个夜晚*得知死亡玩家中有多少名是邪恶的", firstNightOrder: 0, otherNightOrder: 81, reminder: "告知死亡玩家中邪恶玩家的数量。" },
  { id: "nightwatchman", name: "守夜人", team: "镇民", icon: "夜", short: "每局一次，在夜晚选择一名玩家，他会得知你是守夜人", firstNightOrder: 70, otherNightOrder: 87, reminder: "守夜人可选择一名玩家；随后唤醒目标并告知守夜人的身份。" },
  { id: "recluse", name: "陌客", team: "外来者", icon: "陌", short: "可能会被当作邪恶、爪牙或恶魔，即使已经死亡", firstNightOrder: 0, otherNightOrder: 0, reminder: "在需要时可被视为邪恶、爪牙或恶魔。" },
  { id: "drunk", name: "酒鬼", team: "外来者", icon: "醉", short: "不知道自己是酒鬼，并以为自己是一个镇民角色", firstNightOrder: 0, otherNightOrder: 0, reminder: "为酒鬼准备一张虚假的镇民角色标记。" },
  { id: "butler", name: "管家", team: "外来者", icon: "管", short: "每晚选择一名主人，只能在主人投票时投票", firstNightOrder: 59, otherNightOrder: 89, reminder: "管家选择一名存活玩家作为主人。" },
  { id: "saint", name: "圣徒", team: "外来者", icon: "圣", short: "若被处决，善良阵营立即落败", firstNightOrder: 0, otherNightOrder: 0, reminder: "处决圣徒会触发邪恶阵营胜利。" },
  { id: "moonchild", name: "月之子", team: "外来者", icon: "月", short: "得知死亡时公开选择一名存活玩家；若其善良，他在当晚死亡", firstNightOrder: 0, otherNightOrder: 71, reminder: "若月之子选择了善良玩家，该玩家在当晚死亡。" },
  { id: "goon", name: "呆瓜", team: "外来者", icon: "呆", short: "每晚首个用能力选择你的玩家醉酒至黄昏，你变为他的阵营", firstNightOrder: 0, otherNightOrder: 0, reminder: "记录每晚第一个选择呆瓜的玩家，并改变呆瓜阵营。" },
  { id: "poisoner", name: "投毒者", team: "爪牙", icon: "毒", short: "每晚选择一名玩家，使其中毒至下个夜晚", firstNightOrder: 33, otherNightOrder: 18, reminder: "投毒者选择一名玩家，直到下次夜晚开始前中毒。" },
  { id: "scarlet-woman", name: "红唇女郎", team: "爪牙", icon: "唇", short: "五名或更多玩家存活时恶魔死亡，你变成该恶魔", firstNightOrder: 0, otherNightOrder: 34, reminder: "当恶魔死亡且存活玩家不少于五人时，红唇女郎接替恶魔。" },
  { id: "baron", name: "男爵", team: "爪牙", icon: "爵", short: "剧本中增加两名外来者", firstNightOrder: 0, otherNightOrder: 0, reminder: "确认本局外来者数量因为男爵增加。" },
  { id: "spy", name: "间谍", team: "爪牙", icon: "谍", short: "每晚查看魔典，且可能被当作善良角色检测", firstNightOrder: 73, otherNightOrder: 90, reminder: "向间谍展示完整魔典；其可能被视为善良、镇民或外来者。" },
  { id: "godfather", name: "教父", team: "爪牙", icon: "父", short: "首夜得知在场外来者；若白天有外来者死亡，当晚选择一名玩家死亡", firstNightOrder: 38, otherNightOrder: 57, reminder: "首夜展示在场外来者；若今天有外来者死亡，教父选择一名玩家死亡。[-1或+1外来者]" },
  { id: "marionette", name: "提线木偶", team: "爪牙", icon: "偶", short: "以为自己是善良角色，但其实不是；恶魔知道你且你与恶魔邻座", firstNightOrder: 27, otherNightOrder: 0, reminder: "让提线木偶看到一个善良身份；首夜告知恶魔谁是提线木偶。" },
  { id: "imp", name: "小恶魔", team: "恶魔", icon: "魔", short: "每个夜晚*选择一名玩家死亡；选择自己时可将恶魔传给爪牙", firstNightOrder: 0, otherNightOrder: 41, reminder: "恶魔选择一名玩家攻击；若选择自己，传递恶魔角色。" },
  { id: "pukka", name: "普卡", team: "恶魔", icon: "普", short: "每晚选择一名玩家中毒；上个被你中毒的玩家死亡并恢复健康", firstNightOrder: 48, otherNightOrder: 43, reminder: "普卡选择一名玩家中毒；此前中毒的玩家死亡并恢复健康。" },
  { id: "vigormortis", name: "亡骨魔", team: "恶魔", icon: "骨", short: "每个夜晚*选择一名玩家死亡；被你杀死的爪牙保留能力并使邻近镇民中毒", firstNightOrder: 0, otherNightOrder: 50, reminder: "亡骨魔选择一名玩家死亡；若是爪牙，保留其能力并使一名邻近镇民中毒。[-1外来者]" },
  { id: "nodashii", name: "诺-达鲷", team: "恶魔", icon: "鲷", short: "每个夜晚*选择一名玩家死亡；与你邻近的两名镇民中毒", firstNightOrder: 0, otherNightOrder: 47, reminder: "诺-达鲷选择一名玩家死亡，并确认其两名镇民邻座处于中毒状态。" },
];

export const roleMap = new Map(roles.map((role) => [role.id, role]));

export const getRole = (roleId: string) =>
  roleMap.get(roleId) ?? roles[0];

export const getScriptRoles = (scriptId: string) => {
  const script = scripts.find((item) => item.id === scriptId);
  if (!script || script.roleIds.length === 0) return roles;
  const roleIds = new Set<string>(script.roleIds);
  return roles.filter((role) => roleIds.has(role.id));
};

const missingGodSystemActions: NightAction[] = [
  {
    kind: "system",
    id: "dusk",
    name: "黄昏",
    order: 0,
    reminder: "确认所有玩家闭眼，处理持续至黄昏的效果，准备开始夜间行动。",
  },
  {
    kind: "system",
    id: "minion-info",
    name: "爪牙信息",
    order: 25,
    reminder: "若本局有七名或更多玩家，唤醒爪牙，让他们确认彼此并得知恶魔。",
  },
  {
    kind: "system",
    id: "demon-info",
    name: "恶魔信息",
    order: 26,
    reminder: "若本局有七名或更多玩家，向恶魔展示爪牙，并准备三个不在场的善良角色。",
  },
  {
    kind: "system",
    id: "dawn",
    name: "拂晓",
    order: 100,
    reminder: "确认夜间死亡和状态变化，随后唤醒所有玩家并进入白天。",
  },
];

const actsAfterDeathRoleIds = new Set(["ravenkeeper", "moonchild"]);

export const getNightActions = (
  players: { roleId: string; alive: boolean }[],
  firstNight: boolean,
  scriptId: string,
) => {
  const scriptRoleIds = new Set(
    getScriptRoles(scriptId).map((role) => role.id),
  );
  const roleActions: NightAction[] = players
    .filter((player) => {
      if (!scriptRoleIds.has(player.roleId)) return false;
      const role = getRole(player.roleId);
      const order = firstNight
        ? role.firstNightOrder
        : role.otherNightOrder;
      return (
        order > 0 &&
        (player.alive || actsAfterDeathRoleIds.has(player.roleId))
      );
    })
    .map((player) => {
      const role = getRole(player.roleId);
      return {
        kind: "role",
        id: role.id,
        name: role.name,
        order: firstNight ? role.firstNightOrder : role.otherNightOrder,
        role,
      };
    });

  const systemActions =
    scriptId === "missing-god"
      ? missingGodSystemActions.filter(
          (action) =>
            action.kind === "system" &&
            (firstNight ||
              (action.id !== "minion-info" && action.id !== "demon-info")),
        )
      : [];

  return [...systemActions, ...roleActions].sort(
    (left, right) => left.order - right.order,
  );
};
