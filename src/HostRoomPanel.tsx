import {
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Radio,
  Send,
  Share2,
  Unlink,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CompactSelect } from "./CompactSelect";
import { getPlayerVisibleRoleId, getRole, getScriptRoles } from "./data";
import {
  buildPlayerSkillChoiceMessage,
  parsePlayerSkillChoiceMessage,
} from "./playerSkillChoices";
import {
  getPlayerNightMessageDisplayBody,
  getRoleSkillMessage,
} from "./roleSkillMessages";
import { RoleIcon } from "./RoleIcon";
import {
  getTroubleBrewingSkill,
  isTriggeredAbilityNotice,
  triggeredAbilityNotices,
} from "./troubleBrewingSkills";
import type {
  NightMessage,
  PlayerMessage,
  PublicRoomPlayer,
  SharedRoom,
} from "./room";
import { formatSeat } from "./seat";
import type { Phase, Player } from "./types";

type Props = {
  room: SharedRoom | null;
  roomUrl: string;
  players: PublicRoomPlayer[];
  gamePlayers: Player[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  phase: Phase;
  round: number;
  busy: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  onCreate: () => void;
  onCopy: () => void;
  onRevoke: (playerId: string) => void;
  onToggleSimulation: (enabled: boolean) => void;
  onSimulatePlayerSkillReply: (
    playerId: string,
    body: string,
  ) => Promise<void>;
  onClose: () => void;
};

type SimulationPlayerOption = {
  id: string;
  seat: number;
  name: string;
  roleId: string;
  roleName: string;
  visibleRoleName: string;
};

export function HostRoomPanel({
  room,
  roomUrl,
  players,
  gamePlayers,
  nightMessages,
  playerMessages,
  phase,
  round,
  busy,
  syncStatus,
  onCreate,
  onCopy,
  onRevoke,
  onToggleSimulation,
  onSimulatePlayerSkillReply,
  onClose,
}: Props) {
  if (!room) {
    return (
      <section className="room-launcher">
        <div className="room-launcher-icon">
          <Radio size={18} />
        </div>
        <div>
          <strong>统一身份房间</strong>
          <p>玩家扫码填写名字并选择座位，无需主持人确认。</p>
        </div>
        <button className="primary-button room-create-button" onClick={onCreate} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={15} /> : <Link2 size={15} />}
          创建共享房间
        </button>
      </section>
    );
  }

  const claimedPlayers = players.filter((player) => player.is_claimed);
  const simulationEnabled =
    room.simulation_enabled ||
    players.some((player) => player.is_simulated);

  return (
    <section className="host-room-panel">
      <div className="room-heading">
        <div>
          <span className="room-live-label">
            <span className="status-dot" />
            房间开放中
          </span>
          <strong>{room.code}</strong>
        </div>
        <span className={`cloud-status ${syncStatus}`}>
          {syncStatus === "syncing" ? (
            <LoaderCircle className="spin" size={13} />
          ) : syncStatus === "error" ? (
            <Unlink size={13} />
          ) : (
            <Cloud size={13} />
          )}
          {syncStatus === "syncing"
            ? "同步中"
            : syncStatus === "error"
              ? "同步失败"
              : "已同步"}
        </span>
      </div>

      <button className="room-qr" onClick={onCopy} title="复制统一房间链接">
        <QRCodeSVG
          value={roomUrl}
          size={152}
          bgColor="#f5f1ea"
          fgColor="#17171a"
          level="M"
        />
      </button>
      <p className="room-scan-copy">所有玩家扫描同一个二维码</p>
      <button className="secondary-button room-copy-button" onClick={onCopy}>
        <Copy size={14} />
        复制房间链接
      </button>

      <div className="claim-section">
        <label className="simulation-toggle">
          <span className="simulation-toggle-copy">
            <strong>模拟全员入座</strong>
            <small>空座使用测试玩家，可随时恢复真实状态</small>
          </span>
          <input
            type="checkbox"
            checked={simulationEnabled}
            disabled={busy}
            onChange={(event) => onToggleSimulation(event.target.checked)}
          />
          <span className="simulation-toggle-track" aria-hidden="true">
            <span />
          </span>
        </label>
        {simulationEnabled ? (
          <SimulatedPlayerSkillReplyForm
            scriptId={room.script_id}
            players={players}
            gamePlayers={gamePlayers}
            nightMessages={nightMessages}
            playerMessages={playerMessages}
            phase={phase}
            round={round}
            busy={busy || syncStatus === "syncing"}
            onSend={onSimulatePlayerSkillReply}
          />
        ) : null}
        <div className="claim-section-heading">
          <span>已入座玩家</span>
          <strong>
            {claimedPlayers.length}/{players.length}
          </strong>
        </div>
        {claimedPlayers.length ? (
          <div className="claimed-list">
            <span className="claimed-list-title">
              <UserCheck size={14} />
              身份已自动发放
            </span>
            {claimedPlayers.map((player) => (
              <div className="claimed-row" key={player.id}>
                <span>
                  <strong>{player.name || formatSeat(player.seat)}</strong>
                  <small>
                    {formatSeat(player.seat)}
                    {player.is_simulated ? " · 模拟" : ""}
                  </small>
                </span>
                <button onClick={() => onRevoke(player.id)}>撤销</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="claim-empty">玩家扫码入座后，姓名会自动显示在这里。</p>
        )}
      </div>

      <div className="room-footer-actions">
        <button onClick={onCopy}>
          <Share2 size={13} />
          分享
        </button>
        <button className="room-close" onClick={onClose}>
          结束房间
        </button>
      </div>
    </section>
  );
}

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

function SimulatedPlayerSkillReplyForm({
  scriptId,
  players,
  gamePlayers,
  nightMessages,
  playerMessages,
  phase,
  round,
  busy,
  onSend,
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
}) {
  const simulatedPlayers = players.filter((player) => player.is_simulated);
  const [playerId, setPlayerId] = useState(simulatedPlayers[0]?.id ?? "");
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

  useEffect(() => {
    if (!simulatedPlayers.some((player) => player.id === playerId)) {
      setPlayerId(simulatedPlayers[0]?.id ?? "");
    }
    setSendError("");
  }, [playerId, simulatedPlayers]);

  const selectedPlayer = simulatedPlayers.find(
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
  const simulatedPlayerOptions = simulatedPlayers.map((player) =>
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
      {simulatedPlayers.length ? (
        <>
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
              setPlayerId(nextPlayerId);
              setOpenPlayerPicker(null);
            }}
          />
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
