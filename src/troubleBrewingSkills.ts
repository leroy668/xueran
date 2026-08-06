import type { Team } from "./types";

export type SkillPhase = "首夜" | "夜晚" | "白天" | "被动" | "设置";

export type PlayerChoiceSpec = {
  kind: "single" | "pair" | "role" | "single-role" | "juggler";
  title: string;
  help: string;
  submitLabel: string;
  summaryPrefix: string;
  phase: "day" | "night";
  allowFirstNight: boolean;
  excludeSelf: boolean;
  aliveOnly: boolean;
  onlyWhenDead?: boolean;
  oneUse?: boolean;
  firstDayOnly?: boolean;
  publicDeclaration?: boolean;
  roleTeams?: Team[];
  roleLabel?: string;
};

export type TroubleBrewingSkill = {
  roleId: string;
  phase: SkillPhase;
  interaction: string;
  hostHint: string;
  playerChoice?: PlayerChoiceSpec;
  trackerOptions?: string[];
};

export const triggeredAbilityNotices = {
  ravenkeeper: "你已在夜晚死亡，请发动守鸦人能力并选择一名玩家查验。",
  moonchild: "你已死亡，请发动月之子能力并公开选择一名存活玩家。",
  klutz: "你已死亡，请发动呆瓜能力并公开选择一名存活玩家。",
  godfather: "今天有外来者死亡，你可以发动教父能力选择一名玩家。",
} as const;

export const ravenkeeperDeathNotice = triggeredAbilityNotices.ravenkeeper;

export const getDeathTriggeredAbilityNotice = (roleId: string) =>
  roleId === "ravenkeeper" || roleId === "moonchild" || roleId === "klutz"
    ? triggeredAbilityNotices[roleId]
    : null;

export const isTriggeredAbilityNotice = (body: string) =>
  Object.values(triggeredAbilityNotices).some((notice) => notice === body);

const skills: TroubleBrewingSkill[] = [
  { roleId: "washerwoman", phase: "首夜", interaction: "系统生成两名玩家与一张镇民身份，上帝可重随或修改后发送", hostHint: "保证两名玩家中至少一人的真实身份与展示身份相符。" },
  { roleId: "librarian", phase: "首夜", interaction: "系统生成两名玩家与一张外来者身份，或发送场上没有外来者", hostHint: "没有外来者时直接发送零外来者信息。" },
  { roleId: "investigator", phase: "首夜", interaction: "系统生成两名玩家与一张爪牙身份，或发送场上没有爪牙", hostHint: "没有爪牙时发送零爪牙信息；陌客与间谍可能改变应展示的信息。" },
  { roleId: "chef", phase: "首夜", interaction: "系统计算相邻邪恶玩家对数，上帝确认或修正后发送", hostHint: "首尾座位也互相相邻；陌客与间谍可能改变结果。" },
  { roleId: "empath", phase: "夜晚", interaction: "上帝查看两名存活邻座并发送 0、1 或 2", hostHint: "跳过死亡玩家寻找最近的两名存活邻座。" },
  {
    roleId: "fortune-teller", phase: "夜晚", interaction: "玩家选择两人，上帝根据恶魔与宿敌发送有或没有", hostHint: "宿敌始终被视为恶魔；中毒或醉酒时可给出错误信息。",
    playerChoice: { kind: "pair", title: "本晚占卜", help: "选择两名玩家，上帝只会回复有恶魔或没有恶魔", submitLabel: "提交查验", summaryPrefix: "占卜师选择", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: false },
  },
  {
    roleId: "monk", phase: "夜晚", interaction: "玩家选择一名其他玩家（可含死亡玩家），上帝确认本晚保护目标", hostHint: "首夜不能使用；保护只阻止恶魔能力造成的负面效果。",
    playerChoice: { kind: "single", title: "本晚保护", help: "选择一名其他玩家，使其免受恶魔能力影响", submitLabel: "提交保护", summaryPrefix: "僧侣保护", phase: "night", allowFirstNight: false, excludeSelf: true, aliveOnly: false },
  },
  { roleId: "undertaker", phase: "夜晚", interaction: "上帝选择当天被处决者，并发送其角色", hostHint: "仅在当天确有玩家被处决时发送。" },
  {
    roleId: "ravenkeeper", phase: "夜晚", interaction: "上帝确认守鸦人夜间死亡并通知，等待玩家选择后发送一个角色", hostHint: "必须先发送死亡通知；收到玩家选择后再回复角色。中毒或醉酒时可展示错误角色。",
    playerChoice: { kind: "single", title: "守鸦人查验", help: "你在夜晚死亡后，选择一名玩家查看角色", submitLabel: "提交查验", summaryPrefix: "守鸦人查验", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false, onlyWhenDead: true, oneUse: true },
  },
  { roleId: "virgin", phase: "白天", interaction: "记录首次提名者及能力是否触发", hostHint: "首次被镇民提名时，提名者立即被处决并结束白天；间谍可登记为镇民并触发。", trackerOptions: ["能力未触发", "被非镇民首次提名", "已触发并处决提名者"] },
  {
    roleId: "slayer", phase: "白天", interaction: "玩家选择射击目标，上帝记录命中或未命中", hostHint: "每局只能使用一次；真实恶魔必定命中，陌客可登记为恶魔并被命中。",
    playerChoice: { kind: "single", title: "杀手射击", help: "公开选择一名玩家作为本局唯一的射击目标", submitLabel: "确认公开目标", summaryPrefix: "杀手射击", phase: "day", allowFirstNight: false, excludeSelf: false, aliveOnly: false, oneUse: true, publicDeclaration: true },
    trackerOptions: ["能力未使用"],
  },
  { roleId: "soldier", phase: "被动", interaction: "记录恶魔攻击是否被士兵能力挡下", hostHint: "只免疫恶魔能力的负面效果，不免疫处决或其他角色能力。", trackerOptions: ["能力正常", "本晚挡下恶魔攻击", "中毒或醉酒 · 能力失效"] },
  { roleId: "mayor", phase: "被动", interaction: "记录夜晚死亡转移与三人终局胜利条件", hostHint: "三人存活且白天无人被处决时善良获胜；你在夜晚死亡时，可能改为另一名玩家死亡。", trackerOptions: ["能力正常", "夜晚死亡已转移", "三人存活 · 等待无人处决"] },
  { roleId: "recluse", phase: "被动", interaction: "记录本次判定中陌客被视为什么阵营或角色类型", hostHint: "可被视为邪恶、爪牙或恶魔，即使已经死亡。", trackerOptions: ["按善良判定", "本次视为邪恶", "本次视为爪牙", "本次视为恶魔"] },
  { roleId: "drunk", phase: "设置", interaction: "上帝设置玩家看到的镇民身份，真实身份仅上帝可见", hostHint: "酒鬼没有展示身份的能力，但上帝应模拟该镇民的行动。", trackerOptions: ["尚未受错误信息影响", "本次给予错误信息", "本次给予正确信息"] },
  {
    roleId: "butler", phase: "夜晚", interaction: "玩家每晚选择一名主人，座位卡持续展示本晚主人", hostHint: "管家只能在主人投票时举手投票。",
    playerChoice: { kind: "single", title: "选择主人", help: "本轮你只能在主人投票时投票", submitLabel: "提交主人", summaryPrefix: "管家主人", phase: "night", allowFirstNight: true, excludeSelf: true, aliveOnly: false },
  },
  { roleId: "saint", phase: "被动", interaction: "记录圣徒是否因处决死亡以及游戏结束状态", hostHint: "只有仍存活且能力有效的圣徒因处决死亡时，其阵营才立即落败；处决已经死亡的圣徒不触发。", trackerOptions: ["能力正常", "处决风险已提醒", "死于处决 · 阵营落败"] },
  {
    roleId: "poisoner", phase: "夜晚", interaction: "玩家选择中毒目标，上帝确认并在座位卡记录", hostHint: "效果持续到下个夜晚开始；中毒玩家的能力可能失效或得到错误信息。",
    playerChoice: { kind: "single", title: "选择中毒目标", help: "选择一名玩家，使其能力中毒至下个夜晚", submitLabel: "提交目标", summaryPrefix: "投毒者选择", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: false },
  },
  { roleId: "scarlet-woman", phase: "被动", interaction: "记录恶魔死亡时是否满足继承条件", hostHint: "恶魔死亡前至少五名玩家存活（死亡后至少四名）时，红唇女郎成为该恶魔。", trackerOptions: ["等待触发", "条件不足 · 未继承", "已继承恶魔"] },
  { roleId: "baron", phase: "设置", interaction: "确认角色分配已经增加两名外来者", hostHint: "男爵没有主动行动，但必须在开局人数配置中应用 +2 外来者。", trackerOptions: ["已应用 +2 外来者", "需要检查人数配置"] },
  { roleId: "spy", phase: "夜晚", interaction: "上帝一键向间谍发送当前完整魔典快照及本晚行动信息", hostHint: "展示后仍可在其他能力中把间谍视为善良、镇民或外来者。" },
  {
    roleId: "imp", phase: "夜晚", interaction: "首夜接收不在场身份；之后选择攻击目标，自杀时同时选择继承玩家", hostHint: "首夜不能攻击；可攻击死亡玩家。选择自己时，只能由一名存活爪牙继承小恶魔。",
    playerChoice: { kind: "single", title: "选择攻击目标", help: "选择自己表示自杀；由上帝决定哪名存活爪牙继承小恶魔", submitLabel: "提交攻击", summaryPrefix: "小恶魔攻击", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false },
  },
  { roleId: "grandmother", phase: "首夜", interaction: "上帝选择一名善良玩家作为孙辈并发送其角色；后续记录孙辈是否被恶魔杀死", hostHint: "孙辈可以是祖母本人；孙辈被恶魔杀死时，祖母也会死亡。", trackerOptions: ["孙辈存活", "孙辈非恶魔死亡", "孙辈被恶魔杀死 · 祖母死亡"] },
  {
    roleId: "gambler", phase: "夜晚", interaction: "玩家选择一名玩家并猜测其角色，上帝判定正确或错误", hostHint: "首夜不能使用；猜错时赌徒死亡。",
    playerChoice: { kind: "single-role", title: "本晚赌博", help: "选择一名玩家并猜测他的角色", submitLabel: "提交猜测", summaryPrefix: "赌徒猜测", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false, roleLabel: "猜测角色" },
  },
  {
    roleId: "chambermaid", phase: "夜晚", interaction: "玩家选择两名其他存活玩家，上帝发送因自身能力醒来的人数", hostHint: "中毒、醉酒以及按展示身份模拟行动的玩家仍计入；被其他角色唤醒的不计入。",
    playerChoice: { kind: "pair", title: "侍女查验", help: "选择两名其他存活玩家", submitLabel: "提交查验", summaryPrefix: "侍女选择", phase: "night", allowFirstNight: true, excludeSelf: true, aliveOnly: true },
  },
  {
    roleId: "philosopher", phase: "夜晚", interaction: "玩家每局一次选择一个善良角色并获得其能力", hostHint: "若该角色在场，该角色醉酒；随后按获得的能力处理。",
    playerChoice: { kind: "role", title: "哲学家选角", help: "每局一次，选择要获得能力的善良角色", submitLabel: "提交角色", summaryPrefix: "哲学家选择", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: false, oneUse: true, roleTeams: ["镇民", "外来者"], roleLabel: "获得能力" },
  },
  {
    roleId: "juggler",
    phase: "夜晚",
    interaction: "玩家在首日提交至多五组玩家与角色猜测，上帝在当晚自动核对并发送猜对数量",
    hostHint: "系统按真实角色自动计算基准；中毒、醉酒或角色错误登记时仍可改发其他数字。",
    playerChoice: { kind: "juggler", title: "首日杂耍猜测", help: "记录你已公开说出的至多五组“玩家 + 角色”猜测", submitLabel: "确认公开猜测", summaryPrefix: "杂耍猜测", phase: "day", allowFirstNight: false, excludeSelf: false, aliveOnly: false, oneUse: true, firstDayOnly: true, publicDeclaration: true },
  },
  { roleId: "oracle", phase: "夜晚", interaction: "上帝统计死亡玩家中的邪恶人数并发送结果", hostHint: "陌客可能被视为邪恶；中毒或醉酒时可发送错误信息。" },
  {
    roleId: "nightwatchman", phase: "夜晚", interaction: "玩家每局一次选择一名玩家，上帝向目标确认守夜人身份", hostHint: "需要同时给守夜人发送确认，并向目标玩家发送身份通知。",
    playerChoice: { kind: "single", title: "守夜人通知", help: "每局一次，选择一名玩家得知你是守夜人", submitLabel: "提交目标", summaryPrefix: "守夜人选择", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: false, oneUse: true },
  },
  {
    roleId: "moonchild", phase: "白天", interaction: "月之子得知死亡后选择一名存活玩家，上帝判定其是否善良", hostHint: "目标为善良时，该玩家在当晚死亡。",
    playerChoice: { kind: "single", title: "月之子选择", help: "得知死亡后，公开选择一名存活玩家", submitLabel: "确认公开目标", summaryPrefix: "月之子选择", phase: "day", allowFirstNight: false, excludeSelf: true, aliveOnly: true, onlyWhenDead: true, oneUse: true, publicDeclaration: true }, trackerOptions: ["等待公开选择", "目标善良 · 今晚死亡", "目标非善良 · 不死亡"],
  },
  {
    roleId: "klutz", phase: "白天", interaction: "呆瓜得知死亡后选择一名存活玩家，上帝判定游戏继续或阵营落败", hostHint: "若目标是邪恶玩家，呆瓜所属阵营立即落败。",
    playerChoice: { kind: "single", title: "呆瓜选择", help: "得知死亡后，公开选择一名存活玩家", submitLabel: "确认公开目标", summaryPrefix: "呆瓜选择", phase: "day", allowFirstNight: false, excludeSelf: true, aliveOnly: true, onlyWhenDead: true, oneUse: true, publicDeclaration: true }, trackerOptions: ["等待公开选择", "目标善良 · 游戏继续", "目标邪恶 · 阵营落败"],
  },
  { roleId: "godfather", phase: "夜晚", interaction: "首夜展示在场外来者；白天有外来者死亡后，上帝通知教父选择击杀目标", hostHint: "必须先确认白天有外来者死亡并发送通知，再等待教父选择目标；首夜外来者信息可考虑间谍登记。", playerChoice: { kind: "single", title: "教父复仇", help: "收到上帝的外来者死亡通知后，选择一名玩家死亡", submitLabel: "提交目标", summaryPrefix: "教父攻击", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false } },
  { roleId: "marionette", phase: "设置", interaction: "上帝设置玩家看到的善良身份，并在首夜单独告知恶魔提线木偶座位", hostHint: "绝不能向提线木偶本人透露真实身份。", trackerOptions: ["伪装身份已设置", "恶魔已获知提线木偶", "等待告知恶魔"] },
  { roleId: "pukka", phase: "夜晚", interaction: "玩家先选择新的中毒目标，再结算此前的中毒者死亡并恢复健康", hostHint: "顺序必须是先放置新中毒，再让旧中毒者死亡并恢复；若两者是同一人，该玩家最终恢复健康。", playerChoice: { kind: "single", title: "普卡下毒", help: "先选择新中毒目标；随后上一名中毒者死亡并恢复", submitLabel: "提交目标", summaryPrefix: "普卡下毒", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: false } },
  { roleId: "vigormortis", phase: "夜晚", interaction: "玩家选择击杀目标；若击杀爪牙，上帝记录保留能力与邻近镇民中毒", hostHint: "首夜不能击杀；爪牙必须确实被亡骨魔杀死才保留能力，并从其两侧最近镇民中选择一名中毒。", playerChoice: { kind: "single", title: "亡骨魔攻击", help: "选择一名玩家死亡", submitLabel: "提交攻击", summaryPrefix: "亡骨魔攻击", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false } },
  { roleId: "nodashii", phase: "夜晚", interaction: "首夜只确认两侧最近镇民中毒；之后玩家选择击杀目标并持续核对中毒邻座", hostHint: "首夜不进行击杀；顺、逆时针最近的镇民均中毒，死亡镇民仍计入，间谍可按登记规则改变邻接判定。", playerChoice: { kind: "single", title: "诺-达鲷攻击", help: "首夜后选择一名玩家死亡", submitLabel: "提交攻击", summaryPrefix: "诺-达鲷攻击", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false } },
];

export const troubleBrewingSkillMap = new Map(skills.map((skill) => [skill.roleId, skill]));

export const getTroubleBrewingSkill = (roleId: string) =>
  troubleBrewingSkillMap.get(roleId) ?? null;

export const troubleBrewingSkills = skills;
