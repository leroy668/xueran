import {
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
import { getRole } from "./data";
import {
  buildPlayerSkillChoiceMessage,
  parsePlayerSkillChoiceMessage,
} from "./playerSkillChoices";
import {
  getPlayerNightMessageDisplayBody,
  getRoleSkillMessage,
} from "./roleSkillMessages";
import { RoleIcon } from "./RoleIcon";
import { getTroubleBrewingSkill } from "./troubleBrewingSkills";
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

function SimulatedPlayerSkillReplyForm({
  players,
  gamePlayers,
  nightMessages,
  playerMessages,
  phase,
  round,
  busy,
  onSend,
}: {
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
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!simulatedPlayers.some((player) => player.id === playerId)) {
      setPlayerId(simulatedPlayers[0]?.id ?? "");
    }
  }, [playerId, simulatedPlayers]);

  const selectedPlayer = simulatedPlayers.find(
    (player) => player.id === playerId,
  );
  const selectedGamePlayer = gamePlayers.find(
    (player) => player.id === playerId,
  );
  const getVisibleRole = (gamePlayer?: Player) =>
    getRole(
      gamePlayer?.drunkRoleId &&
        (gamePlayer.roleId === "drunk" || gamePlayer.roleId === "marionette")
        ? gamePlayer.drunkRoleId
        : gamePlayer?.roleId ?? "washerwoman",
    );
  const selectedRoleId =
    selectedGamePlayer?.drunkRoleId &&
    (selectedGamePlayer.roleId === "drunk" ||
      selectedGamePlayer.roleId === "marionette")
      ? selectedGamePlayer.drunkRoleId
      : selectedGamePlayer?.roleId;
  const selectedRole = selectedRoleId
    ? getVisibleRole(selectedGamePlayer)
    : null;
  const choiceSpec = selectedRole
    ? getTroubleBrewingSkill(selectedRole.id)?.playerChoice
    : null;
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
  const oneUseLocked = Boolean(
    (selectedRole?.id === "slayer" || selectedRole?.id === "ravenkeeper") &&
      playerMessages
        .filter((message) => message.player_id === playerId)
        .map((message) => ({
          message,
          choice: parsePlayerSkillChoiceMessage(message.body),
        }))
        .some(
          (entry) =>
            entry.choice?.roleId === selectedRole.id &&
            entry.message.round !== round,
        ),
  );
  const canSubmitSkillChoice = Boolean(
    choiceSpec &&
      phaseAllowed &&
      !firstNightLocked &&
      !deathLocked &&
      !oneUseLocked,
  );
  const unavailableText = !choiceSpec
    ? "当前角色没有需要玩家主动提交的技能"
    : !phaseAllowed
      ? choiceSpec.phase === "night"
        ? "请切换到夜晚阶段测试"
        : "请切换到白天阶段测试"
      : firstNightLocked
        ? "首夜不能发动，进入第一晚后即可测试"
        : deathLocked
          ? "守鸦人需要先在魔典中标记为死亡"
          : oneUseLocked
            ? "本局能力已经使用"
            : "";
  const receivedSkillMessages = nightMessages
    .filter(
      (message) =>
        message.player_id === playerId &&
        Boolean(getRoleSkillMessage(message.body)),
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
    const playerIds =
      choiceSpec?.kind === "pair"
        ? [firstTargetId, secondTargetId]
        : [firstTargetId];
    if (
      !canSubmitSkillChoice ||
      !choiceSpec ||
      !selectedRole ||
      !playerId ||
      !firstTargetId ||
      (choiceSpec.kind === "pair" &&
        (!secondTargetId || firstTargetId === secondTargetId)) ||
      sending
    ) {
      return;
    }
    setSending(true);
    try {
      await onSend(
        playerId,
        buildPlayerSkillChoiceMessage({
          roleId: selectedRole.id,
          playerIds,
          summary: `${choiceSpec.summaryPrefix}：${playerIds
            .map(getSeatLabel)
            .join("、")}`,
        }),
      );
    } catch {
      // The parent keeps the test controls intact and shows the actionable error.
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
          <label className="simulation-skill-player">
            <span>模拟玩家</span>
            <select
              value={playerId}
              disabled={busy || sending}
              onChange={(event) => setPlayerId(event.target.value)}
              aria-label="选择模拟玩家"
            >
              {simulatedPlayers.map((player) => {
                const gamePlayer = gamePlayers.find(
                  (item) => item.id === player.id,
                );
                const role = getVisibleRole(gamePlayer);
                return (
                  <option value={player.id} key={player.id}>
                    {formatSeat(player.seat)} · {player.name} ·{" "}
                    {role.name}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="simulation-skill-summary">
            <span>
              <RoleIcon
                roleId={selectedRole?.id ?? "washerwoman"}
                size={18}
              />
            </span>
            <div>
              <strong>
                {selectedPlayer
                  ? `${formatSeat(selectedPlayer.seat)} · ${selectedRole?.name ?? "未知角色"}`
                  : "未选择玩家"}
              </strong>
              <small>
                {canSubmitSkillChoice
                  ? choiceSpec?.help
                  : unavailableText}
              </small>
            </div>
          </div>
          {canSubmitSkillChoice ? (
            <div className="simulation-skill-targets">
              <select
                value={firstTargetId}
                disabled={busy || sending}
                aria-label={`模拟${selectedRole?.name ?? "玩家"}技能目标`}
                onChange={(event) => setFirstTargetId(event.target.value)}
              >
                {targetPlayers.map((player) => {
                  const role = getRole(
                    gamePlayers.find((item) => item.id === player.id)?.roleId ??
                      "washerwoman",
                  );
                  return (
                    <option
                      value={player.id}
                      key={player.id}
                      disabled={
                        choiceSpec?.kind === "pair" &&
                        player.id === secondTargetId
                      }
                    >
                      {formatSeat(player.seat)} · {player.name || "玩家"} ·{" "}
                      {role.name}
                    </option>
                  );
                })}
              </select>
              {choiceSpec?.kind === "pair" ? (
                <select
                  value={secondTargetId}
                  disabled={busy || sending}
                  aria-label={`模拟${selectedRole?.name ?? "玩家"}第二技能目标`}
                  onChange={(event) => setSecondTargetId(event.target.value)}
                >
                  {targetPlayers.map((player) => {
                    const role = getRole(
                      gamePlayers.find((item) => item.id === player.id)
                        ?.roleId ?? "washerwoman",
                    );
                    return (
                      <option
                        value={player.id}
                        key={player.id}
                        disabled={player.id === firstTargetId}
                      >
                        {formatSeat(player.seat)} · {player.name || "玩家"} ·{" "}
                        {role.name}
                      </option>
                    );
                  })}
                </select>
              ) : null}
              <button
                className="primary-button"
                type="button"
                disabled={
                  busy ||
                  sending ||
                  !firstTargetId ||
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
