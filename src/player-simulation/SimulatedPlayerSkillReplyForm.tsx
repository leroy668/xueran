import {
  Check,
  ChevronDown,
  LoaderCircle,
  MessageSquareText,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CompactSelect } from "../CompactSelect";
import { getPlayerVisibleRoleId, getRole, getScriptRoles } from "../data";
import {
  buildPlayerSkillChoiceMessage,
  parsePlayerSkillChoiceMessage,
} from "../playerSkillChoices";
import {
  getPlayerNightMessageDisplayBody,
  getRoleSkillMessage,
} from "../roleSkillMessages";
import { RoleIcon } from "../RoleIcon";
import {
  getTroubleBrewingSkill,
  isTriggeredAbilityNotice,
  triggeredAbilityNotices,
} from "../troubleBrewingSkills";
import type {
  NightMessage,
  PlayerMessage,
  PublicRoomPlayer,
} from "../room";
import { formatSeat } from "../seat";
import type { Phase, Player } from "../types";

type SimulationPlayerOption = {
  id: string;
  seat: number;
  name: string;
  roleId: string;
  roleName: string;
  visibleRoleName: string;
};

function SimulationPlayerPicker({
  label,
  value,
  options,
  disabledIds = [],
  disabled,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  options: SimulationPlayerOption[];
  disabledIds?: string[];
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (playerId: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  const disabledIdSet = new Set(disabledIds.filter(Boolean));

  return (
    <div className="simulation-player-picker">
      <span className="simulation-player-picker-label">{label}</span>
      <button
        className={
          open
            ? "simulation-player-current open"
            : "simulation-player-current"
        }
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={onToggle}
      >
        {selected ? (
          <>
            <span className="simulation-player-role-icon">
              <RoleIcon roleId={selected.roleId} size={20} />
            </span>
            <span className="simulation-player-copy">
              <span className="simulation-player-title">
                <b>{formatSeat(selected.seat)}</b>
                <strong>{selected.roleName}</strong>
              </span>
              <small>{selected.name}</small>
              {selected.visibleRoleName ? (
                <em>玩家视角：{selected.visibleRoleName}</em>
              ) : null}
            </span>
          </>
        ) : (
          <span className="simulation-player-empty">请选择玩家</span>
        )}
        <ChevronDown className="simulation-player-chevron" size={15} />
      </button>

      {open ? (
        <div
          className="simulation-player-options"
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const active = option.id === value;
            const optionDisabled = disabledIdSet.has(option.id);

            return (
              <button
                className={
                  active
                    ? "simulation-player-option active"
                    : "simulation-player-option"
                }
                type="button"
                role="option"
                aria-selected={active}
                disabled={optionDisabled}
                key={option.id}
                onClick={() => onChange(option.id)}
              >
                <span className="simulation-player-role-icon">
                  <RoleIcon roleId={option.roleId} size={19} />
                </span>
                <span className="simulation-player-copy">
                  <span className="simulation-player-title">
                    <b>{formatSeat(option.seat)}</b>
                    <strong>{option.roleName}</strong>
                  </span>
                  <small>{option.name}</small>
                  {option.visibleRoleName ? (
                    <em>玩家视角：{option.visibleRoleName}</em>
                  ) : null}
                </span>
                {active ? (
                  <Check className="simulation-player-check" size={14} />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function SimulatedPlayerSkillReplyForm({
  scriptId,
  players,
  gamePlayers,
  nightMessages,
  playerMessages,
  phase,
  round,
  busy,
  onSend,
  selectedPlayerId,
  onPlayerChange,
  showPlayerPicker = true,
}: {
  scriptId: string;
  players: PublicRoomPlayer[];
  gamePlayers: Player[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  phase: Phase;
  round: number;
  busy: boolean;
  onSend: (playerId: string, body: string) => Promise<void>;
  selectedPlayerId?: string;
  onPlayerChange?: (playerId: string) => void;
  showPlayerPicker?: boolean;
}) {
  const simulationPlayers = players.filter((player) => player.is_claimed);
  const [internalPlayerId, setInternalPlayerId] = useState(
    simulationPlayers[0]?.id ?? "",
  );
  const requestedPlayerId = selectedPlayerId ?? internalPlayerId;
  const playerId = simulationPlayers.some(
    (player) => player.id === requestedPlayerId,
  )
    ? requestedPlayerId
    : simulationPlayers[0]?.id ?? "";
  const selectPlayer = (nextPlayerId: string) => {
    setInternalPlayerId(nextPlayerId);
    onPlayerChange?.(nextPlayerId);
  };
  const [firstTargetId, setFirstTargetId] = useState(players[0]?.id ?? "");
  const [secondTargetId, setSecondTargetId] = useState(
    players.find((player) => player.id !== players[0]?.id)?.id ?? "",
  );
  const [roleChoiceId, setRoleChoiceId] = useState("");
  const [openPlayerPicker, setOpenPlayerPicker] = useState<
    "player" | "first" | "second" | null
  >(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const selectedPlayer = simulationPlayers.find(
    (player) => player.id === playerId,
  );
  const selectedGamePlayer = gamePlayers.find(
    (player) => player.id === playerId,
  );
  const getVisibleRole = (gamePlayer?: Player) =>
    getRole(
      gamePlayer
        ? getPlayerVisibleRoleId(gamePlayer.roleId, gamePlayer.drunkRoleId)
        : "washerwoman",
    );
  const getSimulationPlayerOption = (
    player: PublicRoomPlayer,
    showVisibleRole = true,
  ): SimulationPlayerOption => {
    const gamePlayer = gamePlayers.find((item) => item.id === player.id);
    const actualRole = getRole(gamePlayer?.roleId ?? "washerwoman");
    const visibleRole = getVisibleRole(gamePlayer);

    return {
      id: player.id,
      seat: player.seat,
      name: player.name || "玩家",
      roleId: actualRole.id,
      roleName: actualRole.name,
      visibleRoleName:
        showVisibleRole && actualRole.id !== visibleRole.id
          ? visibleRole.name
          : "",
    };
  };
  const selectedRole = selectedGamePlayer
    ? getVisibleRole(selectedGamePlayer)
    : null;
  const choiceSpec = selectedRole
    ? getTroubleBrewingSkill(selectedRole.id)?.playerChoice
    : null;
  const selectedSkill = selectedRole
    ? getTroubleBrewingSkill(selectedRole.id)
    : null;
  const roleChoices = useMemo(
    () =>
      getScriptRoles(scriptId).filter(
        (role) =>
          !choiceSpec?.roleTeams?.length ||
          choiceSpec.roleTeams.includes(role.team),
      ),
    [choiceSpec?.roleTeams, scriptId],
  );
  const targetPlayers = useMemo(
    () =>
      players.filter((player) => {
        const gamePlayer = gamePlayers.find((item) => item.id === player.id);
        if (choiceSpec?.excludeSelf && player.id === playerId) return false;
        if (choiceSpec?.aliveOnly && !(gamePlayer?.alive ?? player.alive)) {
          return false;
        }
        return true;
      }),
    [
      choiceSpec?.aliveOnly,
      choiceSpec?.excludeSelf,
      gamePlayers,
      playerId,
      players,
    ],
  );
  const simulatedPlayerOptions = simulationPlayers.map((player) =>
    getSimulationPlayerOption(player),
  );
  const targetPlayerOptions = targetPlayers.map((player) =>
    getSimulationPlayerOption(player, false),
  );

  useEffect(() => {
    const playerIds = new Set(targetPlayers.map((player) => player.id));
    const nextFirst = playerIds.has(firstTargetId)
      ? firstTargetId
      : targetPlayers[0]?.id ?? "";
    const nextSecond =
      playerIds.has(secondTargetId) && secondTargetId !== nextFirst
        ? secondTargetId
        : targetPlayers.find((player) => player.id !== nextFirst)?.id ?? "";
    if (nextFirst !== firstTargetId) setFirstTargetId(nextFirst);
    if (nextSecond !== secondTargetId) setSecondTargetId(nextSecond);
  }, [firstTargetId, secondTargetId, targetPlayers]);

  useEffect(() => {
    if (!roleChoices.some((role) => role.id === roleChoiceId)) {
      setRoleChoiceId(roleChoices[0]?.id ?? "");
    }
  }, [roleChoiceId, roleChoices]);

  const getSeatLabel = (targetPlayerId: string) => {
    const player = players.find((item) => item.id === targetPlayerId);
    return player ? formatSeat(player.seat) : "未知座位";
  };
  const phaseAllowed = choiceSpec
    ? choiceSpec.phase === "night"
      ? phase === "夜晚"
      : phase === "白天"
    : false;
  const firstNightLocked = Boolean(
    choiceSpec && phase === "夜晚" && round <= 1 && !choiceSpec.allowFirstNight,
  );
  const deathLocked = Boolean(
    choiceSpec?.onlyWhenDead && selectedGamePlayer?.alive !== false,
  );
  const triggerNotice = selectedRole
    ? triggeredAbilityNotices[
        selectedRole.id as keyof typeof triggeredAbilityNotices
      ]
    : undefined;
  const hostTriggerLocked = Boolean(
    triggerNotice &&
      !nightMessages.some(
        (message) =>
          message.player_id === playerId &&
          message.round === round &&
          message.body === triggerNotice,
      ),
  );
  const oneUseLocked = Boolean(
    Boolean(choiceSpec?.oneUse) &&
      playerMessages
        .filter((message) => message.player_id === playerId)
        .map((message) => ({
          message,
          choice: parsePlayerSkillChoiceMessage(message.body),
        }))
        .some(
          (entry) =>
            entry.choice?.roleId === selectedRole?.id &&
            entry.message.round !== round,
        ),
  );
  const canSubmitSkillChoice = Boolean(
    choiceSpec &&
      phaseAllowed &&
      !firstNightLocked &&
      !deathLocked &&
      !hostTriggerLocked &&
      !oneUseLocked,
  );
  const unavailableText = !choiceSpec
    ? "无需玩家选择，等待上帝发送技能结果"
    : !phaseAllowed
      ? choiceSpec.phase === "night"
        ? "请切换到夜晚阶段测试"
        : "请切换到白天阶段测试"
      : firstNightLocked
        ? "首夜不能发动，进入第一晚后即可测试"
      : deathLocked
          ? "需要先在魔典中将该玩家标记为死亡"
          : hostTriggerLocked
            ? selectedRole?.id === "godfather"
              ? "需要上帝先确认今天有外来者死亡并通知教父"
              : "需要上帝先发送死亡通知"
            : oneUseLocked
              ? "本局能力已经使用"
              : "";
  const receivedSkillMessages = nightMessages
    .filter(
      (message) =>
        message.player_id === playerId &&
        (Boolean(getRoleSkillMessage(message.body)) ||
          isTriggeredAbilityNotice(message.body)),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );
  const latestSubmittedChoice = playerMessages
    .filter(
      (message) =>
        message.player_id === playerId && message.round === round,
    )
    .map((message) => ({
      message,
      choice: parsePlayerSkillChoiceMessage(message.body),
    }))
    .filter(
      (entry) => entry.choice?.roleId === selectedRole?.id,
    )
    .sort(
      (left, right) =>
        new Date(right.message.created_at).getTime() -
        new Date(left.message.created_at).getTime(),
    )[0]?.choice;

  const submit = async () => {
    const needsTarget = choiceSpec?.kind !== "role";
    const needsRole =
      choiceSpec?.kind === "role" || choiceSpec?.kind === "single-role";
    const playerIds = choiceSpec?.kind === "pair"
      ? [firstTargetId, secondTargetId]
      : needsTarget
        ? [firstTargetId]
        : [];
    if (
      !canSubmitSkillChoice ||
      !choiceSpec ||
      !selectedRole ||
      !playerId ||
      (needsTarget && !firstTargetId) ||
      (needsRole && !roleChoiceId) ||
      (choiceSpec.kind === "pair" &&
        (!secondTargetId || firstTargetId === secondTargetId)) ||
      sending
    ) {
      return;
    }
    setSending(true);
    setSendError("");
    try {
      await onSend(
        playerId,
        buildPlayerSkillChoiceMessage({
          roleId: selectedRole.id,
          playerIds,
          roleIdChoice: needsRole ? roleChoiceId : undefined,
          summary: `${choiceSpec.summaryPrefix}：${[
            ...playerIds.map(getSeatLabel),
            ...(needsRole
              ? [getRole(roleChoiceId).name]
              : []),
          ].join(" · ")}`,
        }),
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /host access required/i.test(message)
          ? "主持人登录状态已失效，请刷新页面"
          : /simulated player access required/i.test(message)
            ? "模拟玩家状态尚未同步，请稍后重试"
            : /fetch|network|timeout|load failed/i.test(message)
              ? "网络连接不稳定，请检查网络后重试"
              : /function|schema cache|xueran_simulate_player_message/i.test(
                    message,
                  )
                ? "模拟消息数据库函数尚未配置"
                : `发送失败${message ? `：${message}` : "，请稍后重试"}`,
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="simulation-message-panel">
      <div className="simulation-message-heading">
        <strong>模拟玩家视角</strong>
        <small>提交玩家技能选择，并查看该玩家收到的上帝技能回复</small>
      </div>
      {simulationPlayers.length ? (
        <>
          {showPlayerPicker ? (
            <SimulationPlayerPicker
              label="模拟玩家"
              value={playerId}
              options={simulatedPlayerOptions}
              disabled={busy || sending}
              open={openPlayerPicker === "player"}
              onToggle={() =>
                setOpenPlayerPicker((current) =>
                  current === "player" ? null : "player",
                )
              }
              onChange={(nextPlayerId) => {
                selectPlayer(nextPlayerId);
                setOpenPlayerPicker(null);
              }}
            />
          ) : null}
          <div className="simulation-skill-summary">
            <span>
              <RoleIcon
                roleId={selectedRole?.id ?? "washerwoman"}
                size={18}
              />
            </span>
            <div>
              <strong>
                {selectedPlayer && selectedRole
                  ? `${selectedRole.name}技能`
                  : "未选择玩家"}
              </strong>
              {selectedRole ? (
                <small className="simulation-skill-ability">
                  {selectedRole.short}
                </small>
              ) : null}
              <small className="simulation-skill-status">
                {canSubmitSkillChoice
                  ? choiceSpec?.help
                  : selectedSkill
                    ? unavailableText
                    : "该角色暂无技能交互配置"}
              </small>
            </div>
          </div>
          {canSubmitSkillChoice ? (
            <div className="simulation-skill-targets">
              {choiceSpec?.kind !== "role" ? (
                <SimulationPlayerPicker
                  label={choiceSpec?.kind === "pair" ? "第一目标" : "技能目标"}
                  value={firstTargetId}
                  options={targetPlayerOptions}
                  disabledIds={
                    choiceSpec?.kind === "pair" ? [secondTargetId] : []
                  }
                  disabled={busy || sending}
                  open={openPlayerPicker === "first"}
                  onToggle={() =>
                    setOpenPlayerPicker((current) =>
                      current === "first" ? null : "first",
                    )
                  }
                  onChange={(nextPlayerId) => {
                    setFirstTargetId(nextPlayerId);
                    setOpenPlayerPicker(null);
                  }}
                />
              ) : null}
              {choiceSpec?.kind === "pair" ? (
                <SimulationPlayerPicker
                  label="第二目标"
                  value={secondTargetId}
                  options={targetPlayerOptions}
                  disabledIds={[firstTargetId]}
                  disabled={busy || sending}
                  open={openPlayerPicker === "second"}
                  onToggle={() =>
                    setOpenPlayerPicker((current) =>
                      current === "second" ? null : "second",
                    )
                  }
                  onChange={(nextPlayerId) => {
                    setSecondTargetId(nextPlayerId);
                    setOpenPlayerPicker(null);
                  }}
                />
              ) : null}
              {choiceSpec?.kind === "role" ||
              choiceSpec?.kind === "single-role" ? (
                <CompactSelect
                  value={roleChoiceId}
                  disabled={busy || sending}
                  ariaLabel={`模拟${selectedRole?.name ?? "玩家"}选择角色`}
                  onValueChange={setRoleChoiceId}
                >
                  {roleChoices.map((role) => (
                    <option value={role.id} key={role.id}>
                      {role.name} · {role.team}
                    </option>
                  ))}
                </CompactSelect>
              ) : null}
              <button
                className="primary-button"
                type="button"
                disabled={
                  busy ||
                  sending ||
                  (choiceSpec?.kind !== "role" && !firstTargetId) ||
                  ((choiceSpec?.kind === "role" ||
                    choiceSpec?.kind === "single-role") &&
                    !roleChoiceId) ||
                  (choiceSpec?.kind === "pair" &&
                    (!secondTargetId || firstTargetId === secondTargetId))
                }
                onClick={() => void submit()}
                aria-label={choiceSpec?.submitLabel ?? "提交模拟玩家技能回复"}
              >
                {sending ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Send size={15} />
                )}
                {sending
                  ? "提交中"
                  : latestSubmittedChoice
                    ? "更新目标"
                    : choiceSpec?.submitLabel}
              </button>
              {latestSubmittedChoice ? (
                <p className="simulation-skill-submitted">
                  已提交：{latestSubmittedChoice.summary}
                </p>
              ) : null}
              {sendError ? (
                <p className="simulation-skill-error">{sendError}</p>
              ) : null}
            </div>
          ) : null}
          <section className="simulation-received">
            <div className="simulation-received-heading">
              <span>
                <MessageSquareText size={13} />
                上帝技能回复
              </span>
              <strong>{receivedSkillMessages.length}</strong>
            </div>
            {receivedSkillMessages.length ? (
              <div className="simulation-received-list">
                {receivedSkillMessages.map((message) => (
                  <article key={message.id}>
                    <small>
                      第 {message.round} 回合 ·{" "}
                      {new Date(message.created_at).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                    <p>
                      {getPlayerNightMessageDisplayBody(
                        message.body,
                        message.role_id,
                      )}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="simulation-received-empty">
                该玩家还没有收到上帝技能回复
              </p>
            )}
          </section>
        </>
      ) : (
        <p>当前没有模拟玩家。</p>
      )}
    </div>
  );
}
