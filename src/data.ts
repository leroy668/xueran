import { getPhilosopherAbilityState } from "./philosopher";
import { parsePlayerNotes } from "./playerNotes";
import type { RoleDefinition } from "./types";

export const vigormortisRetainedAbilityNoteId =
  "system:vigormortis-retained-ability";
export const nodashiiPoisonNotePrefix = "system:nodashii-poison:";
export const grandmotherGrandchildNotePrefix =
  "system:grandmother-grandchild:";
export const barberDeathNotePrefix = "system:barber-death:";

export const hasVigormortisRetainedAbility = (notes = "") =>
  parsePlayerNotes(notes).some(
    (note) =>
      note.id.startsWith(vigormortisRetainedAbilityNoteId) && !note.resolved,
  );

const getVigormortisRetainedAbilitySourceId = (notes = "") => {
  const note = parsePlayerNotes(notes).find(
    (entry) =>
      entry.id.startsWith(vigormortisRetainedAbilityNoteId) &&
      !entry.resolved,
  );
  if (!note) return "";
  return note.id.startsWith(`${vigormortisRetainedAbilityNoteId}:`)
    ? note.id.slice(vigormortisRetainedAbilityNoteId.length + 1)
    : "";
};

export const getGrandmotherGrandchildPlayerId = (notes = "") => {
  const marker = parsePlayerNotes(notes).find((note) =>
    note.id.startsWith(grandmotherGrandchildNotePrefix),
  );
  return marker?.id.slice(grandmotherGrandchildNotePrefix.length) ?? "";
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
  "klutz",
  "poisoner",
  "scarlet-woman",
  "godfather",
  "marionette",
  "imp",
  "pukka",
  "vigormortis",
  "nodashii",
] as const;

const ramsayStreetRoleIds = [
  "town-crier",
  "gossip",
  "investigator",
  "seamstress",
  "chef",
  "tea-lady",
  "grandmother",
  "ravenkeeper",
  "empath",
  "magician",
  "chambermaid",
  "minstrel",
  "monk",
  "drunk",
  "recluse",
  "lunatic",
  "barber",
  "godfather",
  "marionette",
  "poisoner",
  "devils-advocate",
  "imp",
  "nodashii",
  "vigormortis",
  "vortox",
] as const;

export const scripts = [
  {
    id: "trouble-brewing",
    name: "暗流涌动",
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
    id: "ramsay-street",
    name: "蓝榭街区",
    subtitle: "从暗流涌动迈向进阶剧本",
    count: 25,
    description: "围绕中毒、错误信息与有限的额外死亡展开的经典混合剧本。",
    roleIds: ramsayStreetRoleIds,
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
  { id: "investigator", name: "调查员", team: "镇民", icon: "查", short: "首夜得知两名玩家和一个爪牙角色，其中一人是该角色；或得知场上没有爪牙", firstNightOrder: 55, otherNightOrder: 0, reminder: "若有爪牙，给出两名玩家和一张爪牙角色；否则告知没有爪牙在场。" },
  { id: "chef", name: "厨师", team: "镇民", icon: "厨", short: "首夜得知相邻邪恶玩家共有多少对", firstNightOrder: 56, otherNightOrder: 0, reminder: "环桌计算相邻的邪恶玩家对数。" },
  { id: "empath", name: "共情者", team: "镇民", icon: "感", short: "每晚得知两名存活邻座中有多少名邪恶玩家", firstNightOrder: 57, otherNightOrder: 75, reminder: "询问共情者左右相邻的存活玩家。" },
  { id: "fortune-teller", name: "占卜师", team: "镇民", icon: "卜", short: "每晚选择两名玩家，得知其中是否有恶魔", firstNightOrder: 58, otherNightOrder: 76, reminder: "占卜师选择两人，告知是否包含恶魔；宿敌也会算作是。" },
  { id: "monk", name: "僧侣", team: "镇民", icon: "僧", short: "每个夜晚*保护一名其他玩家免受恶魔负面能力影响", firstNightOrder: 0, otherNightOrder: 26, reminder: "僧侣选择一名其他玩家进行保护。" },
  { id: "undertaker", name: "掘墓人", team: "镇民", icon: "墓", short: "每个夜晚*得知今天被处决玩家的角色", firstNightOrder: 0, otherNightOrder: 77, reminder: "告诉掘墓人白天处决玩家的角色。" },
  { id: "ravenkeeper", name: "守鸦人", team: "镇民", icon: "鸦", short: "若在夜晚死亡，选择一名玩家并得知他的角色", firstNightOrder: 0, otherNightOrder: 74, reminder: "若守鸦人当晚死亡，让其选择一名玩家并展示角色。" },
  { id: "virgin", name: "处女", team: "镇民", icon: "处", short: "首次被镇民提名时，该镇民可能立即被处决", firstNightOrder: 0, otherNightOrder: 0, reminder: "若首次提名处女的是镇民，立即处决该镇民并结束白天。" },
  { id: "slayer", name: "杀手", team: "镇民", icon: "杀", short: "每局一次公开选择一名玩家，若其是恶魔则死亡", firstNightOrder: 0, otherNightOrder: 0, reminder: "杀手使用能力后记录已使用；命中恶魔时恶魔死亡。" },
  { id: "soldier", name: "士兵", team: "镇民", icon: "兵", short: "免疫恶魔的负面能力", firstNightOrder: 0, otherNightOrder: 52, reminder: "恶魔选择士兵时，标记攻击无效。" },
  { id: "mayor", name: "镇长", team: "镇民", icon: "镇", short: "三人存活且白天无人被处决时善良获胜；夜晚死亡可能转移", firstNightOrder: 0, otherNightOrder: 73, reminder: "若镇长在夜晚将要死亡，可改为另一名玩家死亡；三人终局胜利在白天结算。" },
  { id: "grandmother", name: "祖母", team: "镇民", icon: "祖", short: "首夜得知一名善良玩家及其角色；若恶魔杀死他，你也死亡", firstNightOrder: 60, otherNightOrder: 72, reminder: "首夜展示孙辈及其角色；若孙辈被恶魔杀死，祖母同时死亡。" },
  { id: "gambler", name: "赌徒", team: "镇民", icon: "赌", short: "每个夜晚*选择一名玩家并猜测其角色，猜错则死亡", firstNightOrder: 0, otherNightOrder: 23, reminder: "赌徒选择玩家和角色；若猜测错误，赌徒死亡。" },
  { id: "chambermaid", name: "侍女", team: "镇民", icon: "侍", short: "每晚选择两名其他存活玩家，得知其中有多少人因自身能力醒来", firstNightOrder: 77, otherNightOrder: 93, reminder: "侍女选择两名其他存活玩家，告知因自身能力醒来的人数。" },
  { id: "philosopher", name: "哲学家", team: "镇民", icon: "哲", short: "每局一次，在夜晚获得一个善良角色的能力；若该角色在场，他醉酒", firstNightOrder: 14, otherNightOrder: 10, reminder: "哲学家可选择一个善良角色并获得其能力；必要时替换角色标记。" },
  { id: "juggler", name: "杂耍艺人", team: "镇民", icon: "耍", short: "首日公开猜测玩家角色最多五次，当晚得知猜对数量", firstNightOrder: 0, otherNightOrder: 83, reminder: "在首日后的夜晚，告知杂耍艺人猜对的角色数量；同一玩家可以被猜测多次。" },
  { id: "oracle", name: "神谕者", team: "镇民", icon: "谕", short: "每个夜晚*得知死亡玩家中有多少名是邪恶的", firstNightOrder: 0, otherNightOrder: 81, reminder: "告知死亡玩家中邪恶玩家的数量。" },
  { id: "nightwatchman", name: "守夜人", team: "镇民", icon: "夜", short: "每局一次，在夜晚选择一名玩家，他会得知你是守夜人", firstNightOrder: 70, otherNightOrder: 87, reminder: "守夜人可选择一名玩家；随后唤醒目标并告知守夜人的身份。" },
  { id: "town-crier", name: "城镇公告员", team: "镇民", icon: "告", short: "每个夜晚*得知今天是否有爪牙发起提名", firstNightOrder: 0, otherNightOrder: 58, reminder: "告知城镇公告员今天是否有爪牙发起提名。" },
  { id: "gossip", name: "造谣者", team: "镇民", icon: "谣", short: "每天可以公开发表一个声明；若该声明为真，当晚会有一名玩家死亡", firstNightOrder: 0, otherNightOrder: 38, reminder: "若造谣者今天公开发表的声明为真，选择一名未受死亡保护的玩家死亡。" },
  { id: "seamstress", name: "女裁缝", team: "镇民", icon: "裁", short: "每局一次，在夜晚选择两名其他玩家，得知他们阵营是否相同", firstNightOrder: 43, otherNightOrder: 60, reminder: "若能力尚未使用，让女裁缝选择两名其他玩家，并告知他们阵营是否相同。" },
  { id: "tea-lady", name: "茶艺师", team: "镇民", icon: "茶", short: "若你的两名存活邻座都是善良玩家，他们不会死亡", firstNightOrder: 0, otherNightOrder: 0, reminder: "当两名存活邻座均为善良时，阻止他们死亡。" },
  { id: "magician", name: "魔术师", team: "镇民", icon: "术", short: "恶魔以为你是爪牙，爪牙以为你是恶魔", firstNightOrder: 0, otherNightOrder: 0, reminder: "首夜向恶魔与爪牙提供阵营信息时，将魔术师加入相应的候选身份。" },
  { id: "minstrel", name: "吟游诗人", team: "镇民", icon: "吟", short: "当爪牙死于处决时，除旅行者外的其他玩家醉酒至明天黄昏", firstNightOrder: 0, otherNightOrder: 0, reminder: "爪牙死于处决后，标记除吟游诗人和旅行者外的所有玩家醉酒至次日黄昏。" },
  { id: "recluse", name: "陌客", team: "外来者", icon: "陌", short: "可能会被当作邪恶、爪牙或恶魔，即使已经死亡", firstNightOrder: 0, otherNightOrder: 0, reminder: "在需要时可被视为邪恶、爪牙或恶魔。" },
  { id: "drunk", name: "酒鬼", team: "外来者", icon: "醉", short: "不知道自己是酒鬼，并以为自己是一个镇民角色", firstNightOrder: 0, otherNightOrder: 0, reminder: "为酒鬼准备一张虚假的镇民角色标记。" },
  { id: "butler", name: "管家", team: "外来者", icon: "管", short: "每晚选择一名其他玩家作为主人，次日只能在主人投票时投票", firstNightOrder: 59, otherNightOrder: 89, reminder: "管家选择除自己外的任意玩家作为主人，目标可以已经死亡。" },
  { id: "saint", name: "圣徒", team: "外来者", icon: "圣", short: "若你死于处决，你的阵营立即落败", firstNightOrder: 0, otherNightOrder: 0, reminder: "只有仍存活的圣徒因处决死亡时才触发其阵营落败。" },
  { id: "moonchild", name: "月之子", team: "外来者", icon: "月", short: "得知死亡时公开选择一名存活玩家；若其善良，他在当晚死亡", firstNightOrder: 0, otherNightOrder: 71, reminder: "若月之子选择了善良玩家，该玩家在当晚死亡。" },
  { id: "klutz", name: "呆瓜", team: "外来者", icon: "呆", short: "当你得知你死亡时，公开选择一名存活玩家；如果他是邪恶的，你的阵营落败", firstNightOrder: 0, otherNightOrder: 0, reminder: "呆瓜得知自己死亡时，须公开选择一名存活玩家；若目标是邪恶玩家，呆瓜的阵营落败。" },
  { id: "lunatic", name: "疯子", team: "外来者", icon: "疯", short: "你以为自己是恶魔，但其实不是；恶魔知道你是谁以及你每晚选择了谁", firstNightOrder: 0, otherNightOrder: 0, reminder: "让疯子看到一张恶魔身份并按该恶魔行动；随后将疯子的选择告知真正的恶魔。" },
  { id: "barber", name: "理发师", team: "外来者", icon: "理", short: "若你在今天或今晚死亡，恶魔可以选择两名玩家交换角色（不能选择另一名恶魔）", firstNightOrder: 0, otherNightOrder: 96, reminder: "理发师死亡后唤醒恶魔；恶魔可以选择两名非其他恶魔玩家交换角色。" },
  { id: "poisoner", name: "投毒者", team: "爪牙", icon: "毒", short: "每晚选择一名玩家，使其中毒至下个夜晚", firstNightOrder: 33, otherNightOrder: 18, reminder: "投毒者选择一名玩家，直到下次夜晚开始前中毒。" },
  { id: "scarlet-woman", name: "红唇女郎", team: "爪牙", icon: "唇", short: "五名或更多玩家存活时恶魔死亡，你变成该恶魔", firstNightOrder: 0, otherNightOrder: 34, reminder: "恶魔死亡前至少五名玩家存活（死亡后至少四名）时，红唇女郎接替恶魔。" },
  { id: "baron", name: "男爵", team: "爪牙", icon: "爵", short: "剧本中增加两名外来者", firstNightOrder: 0, otherNightOrder: 0, reminder: "确认本局外来者数量因为男爵增加。" },
  { id: "spy", name: "间谍", team: "爪牙", icon: "谍", short: "每晚查看魔典；可能被当作善良、镇民或外来者，即使已经死亡", firstNightOrder: 73, otherNightOrder: 90, reminder: "向间谍展示完整魔典；其可能被视为善良、镇民或外来者，即使已经死亡。" },
  { id: "godfather", name: "教父", team: "爪牙", icon: "父", short: "首夜得知在场外来者；若白天有外来者死亡，当晚选择一名玩家死亡", firstNightOrder: 38, otherNightOrder: 57, reminder: "首夜展示在场外来者；若今天有外来者死亡，教父选择一名玩家死亡。[-1或+1外来者]" },
  { id: "marionette", name: "提线木偶", team: "爪牙", icon: "偶", short: "以为自己是善良角色，但其实不是；恶魔知道你且你与恶魔邻座", firstNightOrder: 27, otherNightOrder: 0, reminder: "让提线木偶看到一个不在场的善良身份；首夜告知恶魔谁是提线木偶。" },
  { id: "devils-advocate", name: "魔鬼代言人", team: "爪牙", icon: "代", short: "每晚选择一名存活玩家（与上晚不同）；若其明天被处决，他不会死亡", firstNightOrder: 22, otherNightOrder: 13, reminder: "魔鬼代言人选择一名与上晚不同的存活玩家；该玩家明天被处决时不会死亡。" },
  { id: "imp", name: "小恶魔", team: "恶魔", icon: "魔", short: "首夜得知三张不在场身份；之后每晚选择一名玩家死亡，自杀时由上帝选择一名存活爪牙继承", firstNightOrder: 42, otherNightOrder: 41, reminder: "首夜发送三张不在场身份；之后选择攻击目标，若选择自己，由上帝决定哪名存活爪牙成为小恶魔。" },
  { id: "pukka", name: "普卡", team: "恶魔", icon: "普", short: "每晚选择一名玩家中毒；上个被你中毒的玩家死亡并恢复健康", firstNightOrder: 48, otherNightOrder: 43, reminder: "普卡选择一名玩家中毒；此前中毒的玩家死亡并恢复健康。" },
  { id: "vigormortis", name: "亡骨魔", team: "恶魔", icon: "骨", short: "每个夜晚*选择一名玩家死亡；被你杀死的爪牙保留能力并使邻近镇民中毒", firstNightOrder: 0, otherNightOrder: 50, reminder: "亡骨魔选择一名玩家死亡；若是爪牙，保留其能力并使一名邻近镇民中毒。[-1外来者]" },
  { id: "nodashii", name: "诺-达鲷", team: "恶魔", icon: "鲷", short: "每个夜晚*选择一名玩家死亡；与你邻近的两名镇民中毒", firstNightOrder: 49, otherNightOrder: 47, reminder: "首夜确认两名邻近镇民中毒；之后选择一名玩家死亡，并再次确认邻近镇民的中毒状态。" },
  { id: "vortox", name: "涡流", team: "恶魔", icon: "涡", short: "每个夜晚*选择一名玩家死亡；镇民能力都会获得错误信息；若白天无人被处决，邪恶获胜", firstNightOrder: 0, otherNightOrder: 31, reminder: "涡流选择一名玩家死亡；确保所有镇民能力产生的信息均为错误，并检查当天是否有人被处决。" },
];

export const roleMap = new Map(roles.map((role) => [role.id, role]));

export const normalizeRoleId = (roleId: string) =>
  roleId === "goon" ? "klutz" : roleId;

export const getPlayerVisibleRoleId = (
  roleId: string,
  drunkRoleId = "",
) =>
  (roleId === "drunk" || roleId === "marionette" || roleId === "lunatic") && drunkRoleId
    ? normalizeRoleId(drunkRoleId)
    : normalizeRoleId(roleId);

export const getRole = (roleId: string) =>
  roleMap.get(normalizeRoleId(roleId)) ?? roles[0];

export const hasActiveVigormortisRetainedAbility = (
  player: { id?: string; roleId: string; alive: boolean; notes?: string },
  players: { id?: string; roleId: string; alive: boolean }[],
) => {
  if (
    player.alive ||
    getRole(player.roleId).team !== "爪牙" ||
    !hasVigormortisRetainedAbility(player.notes)
  ) return false;
  const sourcePlayerId = getVigormortisRetainedAbilitySourceId(player.notes);
  return players.some(
    (candidate) =>
      candidate.alive &&
      getRole(candidate.roleId).id === "vigormortis" &&
      (!sourcePlayerId || candidate.id === sourcePlayerId),
  );
};

export const getScriptRoles = (scriptId: string) => {
  const script = scripts.find((item) => item.id === scriptId);
  if (!script || script.roleIds.length === 0) return roles;
  return script.roleIds
    .map((roleId) => roleMap.get(roleId))
    .filter((role): role is RoleDefinition => Boolean(role));
};

const actsAfterDeathRoleIds = new Set(["ravenkeeper", "moonchild", "barber"]);

const troubleBrewingFirstNightRoleIds = [
  "poisoner",
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune-teller",
  "butler",
  "spy",
] as const;

const troubleBrewingOtherNightRoleIds = [
  "poisoner",
  "monk",
  "scarlet-woman",
  "imp",
  "soldier",
  "ravenkeeper",
  "mayor",
  "empath",
  "fortune-teller",
  "butler",
  "undertaker",
  "spy",
] as const;

const createNightOrderMap = (roleIds: readonly string[]): Map<string, number> =>
  new Map(roleIds.map((roleId, index) => [roleId, index + 1]));

const troubleBrewingFirstNightOrder = createNightOrderMap(
  troubleBrewingFirstNightRoleIds,
);
const troubleBrewingOtherNightOrder = createNightOrderMap(
  troubleBrewingOtherNightRoleIds,
);

const getNightStageLabel = (round: number) => {
  if (round <= 1) return "首夜";
  const value = Math.max(1, round - 1);
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const label =
    value < 10
      ? digits[value]
      : value < 20
        ? `十${value === 10 ? "" : digits[value - 10]}`
        : value < 100
          ? `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ""}`
          : String(value);
  return `第${label}晚`;
};

export const getNightActions = (
  players: {
    id?: string;
    seat?: number;
    roleId: string;
    drunkRoleId?: string;
    notes?: string;
    alive: boolean;
  }[],
  firstNight: boolean,
  scriptId: string,
  round = firstNight ? 1 : 2,
  context: {
    executedPlayerId?: string | null;
    activeDeathTriggeredPlayerIds?: ReadonlySet<string>;
    demonKilledPlayerIds?: ReadonlySet<string>;
  } = {},
) => {
  const scriptRoleIds = new Set(
    getScriptRoles(scriptId).map((role) => role.id),
  );
  const troubleBrewingOrder =
    scriptId === "trouble-brewing"
      ? firstNight
        ? troubleBrewingFirstNightOrder
        : troubleBrewingOtherNightOrder
      : null;
  const getActionRole = (player: { roleId: string; drunkRoleId?: string }) =>
    getRole(getPlayerVisibleRoleId(player.roleId, player.drunkRoleId));
  const firstMinionPlayerId = [...players]
    .sort((left, right) => (left.seat ?? 0) - (right.seat ?? 0))
    .find(
      (player) =>
        player.roleId !== "marionette" &&
        getRole(player.roleId).team === "爪牙",
    )?.id;
  const sharesEvilTeamInfo = firstNight && players.length >= 7;
  return players
    .flatMap((player) => {
      const philosopherAbility = player.notes
        ? getPhilosopherAbilityState({
            roleId: player.roleId,
            notes: player.notes,
          })
        : null;
      const visibleRole = philosopherAbility?.hasAbilityEffect
        ? getRole(philosopherAbility.roleId)
        : getActionRole(player);
      const actualRole = getRole(player.roleId);
      const actionRoles = [visibleRole];
      if (
        firstNight &&
        player.roleId === "marionette" &&
        visibleRole.id !== "marionette"
      ) {
        actionRoles.push(getRole("marionette"));
      }
      return actionRoles.flatMap((role) => {
        if (!scriptRoleIds.has(role.id)) return [];
        if (role.id === "juggler" && !firstNight && round !== 2) return [];
        if (role.id === "undertaker" && !context.executedPlayerId) return [];
        const acquiredThisNight = Boolean(
          philosopherAbility?.hasAbilityEffect &&
            philosopherAbility.note.stage === getNightStageLabel(round),
        );
        if (
          role.id === "grandmother" &&
          !firstNight &&
          !acquiredThisNight &&
          !context.demonKilledPlayerIds?.has(
            getGrandmotherGrandchildPlayerId(player.notes),
          )
        ) return [];
        if (role.id === "scarlet-woman" && !firstNight) {
          const hasDeadDemon = players.some(
            (candidate) =>
              !candidate.alive && getRole(candidate.roleId).team === "恶魔",
          );
          const hasLivingDemon = players.some(
            (candidate) =>
              candidate.alive && getRole(candidate.roleId).team === "恶魔",
          );
          const livingPlayerCount = players.filter(
            (candidate) => candidate.alive,
          ).length;
          // The dead Demon was the fifth living player immediately before dying.
          if (!hasDeadDemon || hasLivingDemon || livingPlayerCount < 4) return [];
        }
        if (
          actsAfterDeathRoleIds.has(role.id) &&
          !context.activeDeathTriggeredPlayerIds?.has(player.id ?? "")
        ) return [];
        const isMinionInfo = Boolean(
          sharesEvilTeamInfo &&
          player.id === firstMinionPlayerId &&
          role.id === player.roleId,
        );
        const isTroubleBrewingDemonInfo = Boolean(
          sharesEvilTeamInfo && troubleBrewingOrder && role.id === "imp",
        );
        const isGenericDemonInfo = Boolean(
          sharesEvilTeamInfo && !troubleBrewingOrder && role.team === "恶魔",
        );
        const configuredOrder = troubleBrewingOrder
          ? troubleBrewingOrder.get(role.id) ?? 0
          : firstNight
            ? role.firstNightOrder
            : role.otherNightOrder;
        const normalOrder =
          !firstNight &&
          acquiredThisNight &&
          configuredOrder <= 0 &&
          role.firstNightOrder > 0
            ? role.firstNightOrder
            : configuredOrder;
        const philosopherOrder = troubleBrewingOrder
          ? troubleBrewingOrder.get("philosopher") ?? 0
          : firstNight
            ? getRole("philosopher").firstNightOrder
            : getRole("philosopher").otherNightOrder;
        const order =
          acquiredThisNight && normalOrder <= philosopherOrder
            ? philosopherOrder + 0.01
            : normalOrder;
        const retainsVigormortisAbility =
          hasActiveVigormortisRetainedAbility(player, players);
        const canAct =
          player.alive ||
          actsAfterDeathRoleIds.has(role.id) ||
          retainsVigormortisAbility;
        const makeAction = (
          id: string,
          name: string,
          actionOrder: number,
          actionCanAct = canAct,
          setupOnly = false,
        ) => ({
          kind: "role" as const,
          id,
          name,
          order: actionOrder,
          role,
          actualRole,
          isDisguised: role.id !== actualRole.id,
          isPhilosopherAbility: Boolean(philosopherAbility?.hasAbilityEffect),
          playerId: player.id,
          seat: player.seat,
          alive: player.alive,
          canAct: actionCanAct,
          setupOnly,
        });
        const actions = [];
        if (isMinionInfo) {
          actions.push(
            makeAction(
              "minion-info",
              "爪牙信息",
              troubleBrewingOrder ? -1 : 20,
              player.alive,
            ),
          );
        }
        if (isTroubleBrewingDemonInfo) {
          actions.push(makeAction("demon-info", "恶魔信息", 0));
        } else if (isGenericDemonInfo) {
          actions.push(makeAction("demon-info", "恶魔信息", 25, player.alive));
        }
        if (
          normalOrder > 0 &&
          !isTroubleBrewingDemonInfo &&
          !(firstNight && role.id === "imp") &&
          !(firstNight && actualRole.id === "lunatic" && role.id === "nodashii")
        ) {
          const setupOnly = firstNight && role.id === "nodashii";
          const actionName = setupOnly
            ? `${role.name} · 邻位中毒设置`
            : role.name;
          actions.push(makeAction(role.id, actionName, order, canAct, setupOnly));
        }
        return actions;
      });
    })
    .sort(
      (left, right) => left.order - right.order,
    );
};
