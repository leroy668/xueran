export type SkillPhase = "首夜" | "夜晚" | "白天" | "被动" | "设置";

export type PlayerChoiceSpec = {
  kind: "single" | "pair";
  title: string;
  help: string;
  submitLabel: string;
  summaryPrefix: string;
  phase: "day" | "night";
  allowFirstNight: boolean;
  excludeSelf: boolean;
  aliveOnly: boolean;
  onlyWhenDead?: boolean;
};

export type TroubleBrewingSkill = {
  roleId: string;
  phase: SkillPhase;
  interaction: string;
  hostHint: string;
  playerChoice?: PlayerChoiceSpec;
  trackerOptions?: string[];
};

const skills: TroubleBrewingSkill[] = [
  { roleId: "washerwoman", phase: "首夜", interaction: "系统生成两名玩家与一张镇民身份，上帝可重随或修改后发送", hostHint: "保证两名玩家中至少一人的真实身份与展示身份相符。" },
  { roleId: "librarian", phase: "首夜", interaction: "系统生成两名玩家与一张外来者身份，或发送场上没有外来者", hostHint: "没有外来者时直接发送零外来者信息。" },
  { roleId: "investigator", phase: "首夜", interaction: "系统生成两名玩家与一张爪牙身份，上帝可重随或修改后发送", hostHint: "陌客与间谍可能改变应展示的信息。" },
  { roleId: "chef", phase: "首夜", interaction: "系统计算相邻邪恶玩家对数，上帝确认或修正后发送", hostHint: "首尾座位也互相相邻；陌客与间谍可能改变结果。" },
  { roleId: "empath", phase: "夜晚", interaction: "上帝查看两名存活邻座并发送 0、1 或 2", hostHint: "跳过死亡玩家寻找最近的两名存活邻座。" },
  {
    roleId: "fortune-teller", phase: "夜晚", interaction: "玩家选择两人，上帝根据恶魔与宿敌发送有或没有", hostHint: "宿敌始终被视为恶魔；中毒或醉酒时可给出错误信息。",
    playerChoice: { kind: "pair", title: "本晚占卜", help: "选择两名玩家，上帝只会回复有恶魔或没有恶魔", submitLabel: "提交查验", summaryPrefix: "占卜师选择", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: false },
  },
  {
    roleId: "monk", phase: "夜晚", interaction: "玩家选择一名其他玩家，上帝确认本晚保护目标", hostHint: "首夜不能使用；保护只阻止恶魔能力造成的负面效果。",
    playerChoice: { kind: "single", title: "本晚保护", help: "选择一名其他存活玩家，使其免受恶魔能力影响", submitLabel: "提交保护", summaryPrefix: "僧侣保护", phase: "night", allowFirstNight: false, excludeSelf: true, aliveOnly: true },
  },
  { roleId: "undertaker", phase: "夜晚", interaction: "上帝选择当天被处决者，并发送其角色", hostHint: "仅在当天确有玩家被处决时发送。" },
  {
    roleId: "ravenkeeper", phase: "夜晚", interaction: "守鸦人夜间死亡后选择一人，上帝发送一个角色", hostHint: "只有夜间死亡才触发；中毒或醉酒时可展示错误角色。",
    playerChoice: { kind: "single", title: "守鸦人查验", help: "你在夜晚死亡后，选择一名玩家查看角色", submitLabel: "提交查验", summaryPrefix: "守鸦人查验", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: false, onlyWhenDead: true },
  },
  { roleId: "virgin", phase: "白天", interaction: "记录首次提名者及能力是否触发", hostHint: "首次被镇民提名时，提名者立即被处决并结束白天。", trackerOptions: ["能力未触发", "被非镇民首次提名", "已触发并处决提名者"] },
  {
    roleId: "slayer", phase: "白天", interaction: "玩家选择射击目标，上帝记录命中或未命中", hostHint: "每局只能使用一次；只有目标被视为恶魔时才死亡。",
    playerChoice: { kind: "single", title: "杀手射击", help: "公开选择一名玩家作为本局唯一的射击目标", submitLabel: "提交目标", summaryPrefix: "杀手射击", phase: "day", allowFirstNight: false, excludeSelf: false, aliveOnly: true },
    trackerOptions: ["能力未使用", "已使用 · 未命中", "已使用 · 命中恶魔"],
  },
  { roleId: "soldier", phase: "被动", interaction: "记录恶魔攻击是否被士兵能力挡下", hostHint: "只免疫恶魔能力的负面效果，不免疫处决或其他角色能力。", trackerOptions: ["能力正常", "本晚挡下恶魔攻击", "中毒或醉酒 · 能力失效"] },
  { roleId: "mayor", phase: "被动", interaction: "记录恶魔攻击转移与三人终局胜利条件", hostHint: "三人存活且白天无人被处决时善良获胜；攻击可能转移。", trackerOptions: ["能力正常", "恶魔攻击已转移", "三人存活 · 等待无人处决"] },
  { roleId: "recluse", phase: "被动", interaction: "记录本次判定中陌客被视为什么阵营或角色类型", hostHint: "可被视为邪恶、爪牙或恶魔，即使已经死亡。", trackerOptions: ["按善良判定", "本次视为邪恶", "本次视为爪牙", "本次视为恶魔"] },
  { roleId: "drunk", phase: "设置", interaction: "上帝设置玩家看到的镇民身份，真实身份仅上帝可见", hostHint: "酒鬼没有展示身份的能力，但上帝应模拟该镇民的行动。", trackerOptions: ["尚未受错误信息影响", "本次给予错误信息", "本次给予正确信息"] },
  {
    roleId: "butler", phase: "夜晚", interaction: "玩家每晚选择一名主人，座位卡持续展示本晚主人", hostHint: "管家只能在主人投票时举手投票。",
    playerChoice: { kind: "single", title: "选择主人", help: "本轮你只能在主人投票时投票", submitLabel: "提交主人", summaryPrefix: "管家主人", phase: "night", allowFirstNight: true, excludeSelf: true, aliveOnly: true },
  },
  { roleId: "saint", phase: "被动", interaction: "记录圣徒是否被处决以及游戏结束状态", hostHint: "圣徒被处决时，邪恶阵营立即获胜。", trackerOptions: ["能力正常", "处决风险已提醒", "已被处决 · 邪恶胜利"] },
  {
    roleId: "poisoner", phase: "夜晚", interaction: "玩家选择中毒目标，上帝确认并在座位卡记录", hostHint: "效果持续到下个夜晚开始；中毒玩家的能力可能失效或得到错误信息。",
    playerChoice: { kind: "single", title: "选择中毒目标", help: "选择一名玩家，使其能力中毒至下个夜晚", submitLabel: "提交目标", summaryPrefix: "投毒者选择", phase: "night", allowFirstNight: true, excludeSelf: false, aliveOnly: true },
  },
  { roleId: "scarlet-woman", phase: "被动", interaction: "记录恶魔死亡时是否满足继承条件", hostHint: "恶魔死亡且仍有至少五名玩家存活时，红唇女郎成为该恶魔。", trackerOptions: ["等待触发", "条件不足 · 未继承", "已继承小恶魔"] },
  { roleId: "baron", phase: "设置", interaction: "确认角色分配已经增加两名外来者", hostHint: "男爵没有主动行动，但必须在开局人数配置中应用 +2 外来者。", trackerOptions: ["已应用 +2 外来者", "需要检查人数配置"] },
  { roleId: "spy", phase: "夜晚", interaction: "上帝一键向间谍发送当前完整魔典快照", hostHint: "展示后仍可在其他能力中把间谍视为善良、镇民或外来者。" },
  {
    roleId: "imp", phase: "夜晚", interaction: "玩家选择攻击目标，上帝确认；自杀时提醒恶魔传承", hostHint: "首夜不能攻击；选择自己时，一名存活爪牙会成为小恶魔。",
    playerChoice: { kind: "single", title: "选择攻击目标", help: "选择一名玩家；选择自己时可能把恶魔身份传给爪牙", submitLabel: "提交攻击", summaryPrefix: "小恶魔攻击", phase: "night", allowFirstNight: false, excludeSelf: false, aliveOnly: true },
  },
];

export const troubleBrewingSkillMap = new Map(skills.map((skill) => [skill.roleId, skill]));

export const getTroubleBrewingSkill = (roleId: string) =>
  troubleBrewingSkillMap.get(roleId) ?? null;

export const troubleBrewingSkills = skills;
