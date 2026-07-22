const playerSkillChoicePrefix = "【技能选择】";

export type PlayerSkillGuess = {
  playerId: string;
  roleId: string;
};

export type PlayerSkillChoice = {
  version: 1;
  roleId: string;
  playerIds: string[];
  roleIdChoice?: string;
  guesses?: PlayerSkillGuess[];
  summary: string;
};

export const buildPlayerSkillChoiceMessage = (
  choice: Omit<PlayerSkillChoice, "version">,
) =>
  `${playerSkillChoicePrefix}${JSON.stringify({
    version: 1,
    ...choice,
  } satisfies PlayerSkillChoice)}`;

export const parsePlayerSkillChoiceMessage = (
  body: string,
): PlayerSkillChoice | null => {
  if (!body.startsWith(playerSkillChoicePrefix)) return null;
  try {
    const parsed = JSON.parse(
      body.slice(playerSkillChoicePrefix.length),
    ) as Partial<PlayerSkillChoice>;
    if (
      parsed.version !== 1 ||
      typeof parsed.roleId !== "string" ||
      !Array.isArray(parsed.playerIds) ||
      !parsed.playerIds.every((playerId) => typeof playerId === "string") ||
      (parsed.roleIdChoice !== undefined &&
        typeof parsed.roleIdChoice !== "string") ||
      (parsed.guesses !== undefined &&
        (!Array.isArray(parsed.guesses) ||
          parsed.guesses.length > 5 ||
          !parsed.guesses.every(
            (guess) =>
              typeof guess === "object" &&
              guess !== null &&
              typeof (guess as PlayerSkillGuess).playerId === "string" &&
              typeof (guess as PlayerSkillGuess).roleId === "string",
          ))) ||
      typeof parsed.summary !== "string"
    ) {
      return null;
    }
    return parsed as PlayerSkillChoice;
  } catch {
    return null;
  }
};

export const getPlayerMessageDisplayBody = (body: string) =>
  parsePlayerSkillChoiceMessage(body)?.summary ?? body;
