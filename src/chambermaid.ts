export type ChambermaidWakeStatus = "woke" | "asleep" | "conditional";

export type ChambermaidWakeAssessment = {
  status: ChambermaidWakeStatus;
  reason: string;
};

type ChambermaidWakeInput = {
  trueRoleId: string;
  abilityRoleId?: string;
  alive: boolean;
  round: number;
  hasCurrentRoundActivity: boolean;
  hasPreviousActivity: boolean;
  philosopherUsedThisRound: boolean;
};

const firstNightWakeRoleIds = new Set([
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune-teller",
  "grandmother",
  "chambermaid",
  "butler",
  "poisoner",
  "spy",
  "godfather",
  "pukka",
]);

const otherNightWakeRoleIds = new Set([
  "empath",
  "fortune-teller",
  "monk",
  "gambler",
  "chambermaid",
  "oracle",
  "butler",
  "poisoner",
  "spy",
  "imp",
  "pukka",
  "vigormortis",
  "nodashii",
]);

const conditionalOtherNightRoles = new Map([
  ["undertaker", "仅在当天有人被处决时因自身能力醒来"],
  ["godfather", "仅在白天有外来者死亡时因自身能力醒来"],
]);

export const assessChambermaidWake = ({
  trueRoleId,
  abilityRoleId = trueRoleId,
  alive,
  round,
  hasCurrentRoundActivity,
  hasPreviousActivity,
  philosopherUsedThisRound,
}: ChambermaidWakeInput): ChambermaidWakeAssessment => {
  if (!alive) {
    return {
      status: "asleep",
      reason: "当前已死亡，不是侍女可选择的存活目标",
    };
  }

  if (trueRoleId === "drunk" || trueRoleId === "marionette") {
    return {
      status: "asleep",
      reason: "展示身份不是真实能力，不计为因自身能力醒来",
    };
  }

  if (trueRoleId === "philosopher" && philosopherUsedThisRound) {
    return {
      status: "woke",
      reason: "本晚已因哲学家能力醒来",
    };
  }

  if (abilityRoleId === "philosopher") {
    return {
      status: "woke",
      reason: "尚未获得其他能力，本晚会因哲学家能力醒来",
    };
  }

  if (abilityRoleId === "nightwatchman") {
    if (hasCurrentRoundActivity) {
      return {
        status: "woke",
        reason: "本晚已发动守夜人能力",
      };
    }
    if (hasPreviousActivity) {
      return {
        status: "asleep",
        reason: "守夜人能力此前已经使用，本晚不会再因该能力醒来",
      };
    }
    return {
      status: "woke",
      reason: "守夜人能力尚未使用，本晚会被唤醒询问是否发动",
    };
  }

  if (round <= 1) {
    return firstNightWakeRoleIds.has(abilityRoleId)
      ? {
          status: "woke",
          reason: "首夜会因自身能力醒来",
        }
      : {
          status: "asleep",
          reason: "首夜不会因自身能力醒来",
        };
  }

  if (abilityRoleId === "juggler") {
    return round === 2
      ? {
          status: "woke",
          reason: "首日后的夜晚会因自身能力醒来",
        }
      : {
          status: "asleep",
          reason: "只有首日后的夜晚会因自身能力醒来",
        };
  }

  if (otherNightWakeRoleIds.has(abilityRoleId)) {
    return {
      status: "woke",
      reason: "本晚会因自身能力醒来",
    };
  }

  const conditionalReason = conditionalOtherNightRoles.get(abilityRoleId);
  if (conditionalReason) {
    return hasCurrentRoundActivity
      ? {
          status: "woke",
          reason: "本晚已有对应能力行动记录，确定因自身能力醒来",
        }
      : {
          status: "conditional",
          reason: conditionalReason,
        };
  }

  return {
    status: "asleep",
    reason: "本晚不会因自身能力醒来",
  };
};
