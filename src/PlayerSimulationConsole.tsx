import { useMemo, useRef, useState, useEffect } from "react";
import {
  ArrowLeft,
  Check,
  Gamepad2,
  Gavel,
  LoaderCircle,
  MessageCircleMore,
  MessageSquareText,
  MoonStar,
  Send,
  ShieldCheck,
  Skull,
  Sun,
  UsersRound,
  Vote,
} from "lucide-react";
import { getPlayerVisibleRoleId, getRole } from "./data";
import { SimulatedPlayerSkillReplyForm } from "./HostRoomPanel";
import { PlayerPrivateChats } from "./PlayerPrivateChats";
import {
  getPlayerMessageDisplayBody,
} from "./playerSkillChoices";
import { getPlayerNightMessageDisplayBody } from "./roleSkillMessages";
import { RoleIcon } from "./RoleIcon";
import type {
  DayPrivateChatStat,
  DayPrivateMessage,
  DayPrivateThread,
  DayResolution,
  DayVote,
  NightMessage,
  Nomination,
  PlayerMessage,
  PublicRoomPlayer,
  SharedRoom,
} from "./room";
import { formatSeat } from "./seat";
import type { Phase, Player } from "./types";

type SimulationView = "skill" | "host-chat" | "private-chat" | "voting";

type Props = {
  room: SharedRoom | null;
  players: PublicRoomPlayer[];
  gamePlayers: Player[];
  scriptId: string;
  phase: Phase;
  round: number;
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  dayPrivateThreads: DayPrivateThread[];
  dayPrivateMessages: DayPrivateMessage[];
  nominations: Nomination[];
  votes: DayVote[];
  resolutions: DayResolution[];
  busy: boolean;
  onBack: () => void;
  onToggleSimulation: (enabled: boolean) => Promise<void>;
  onSendPlayerMessage: (playerId: string, body: string) => Promise<void>;
  onSendPrivateMessage: (
    senderPlayerId: string,
    recipientPlayerId: string,
    body: string,
  ) => Promise<void>;
  onNominate: (
    nominatorPlayerId: string,
    nomineePlayerId: string,
  ) => Promise<void>;
  onVote: (nominationId: string, voterPlayerId: string) => Promise<void>;
};

const simulationViews: {
  id: SimulationView;
  label: string;
  icon: typeof Gamepad2;
}[] = [
  { id: "skill", label: "角色技能", icon: Gamepad2 },
  { id: "host-chat", label: "上帝消息", icon: MessageSquareText },
  { id: "private-chat", label: "白天私聊", icon: MessageCircleMore },
  { id: "voting", label: "提名投票", icon: Gavel },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getPlayerLabel(players: PublicRoomPlayer[], playerId: string) {
  const player = players.find((item) => item.id === playerId);
  return player
    ? `${formatSeat(player.seat)} ${player.name || "玩家"}`
    : "未知玩家";
}

function buildPrivateChatStats(
  players: PublicRoomPlayer[],
  threads: DayPrivateThread[],
  messages: DayPrivateMessage[],
): DayPrivateChatStat[] {
  return players
    .filter((player) => player.is_claimed)
    .map((player) => {
      const playerThreads = threads.filter(
        (thread) =>
          thread.player_a_id === player.id || thread.player_b_id === player.id,
      );
      const threadIds = new Set(playerThreads.map((thread) => thread.id));
      const playerMessages = messages.filter((message) =>
        threadIds.has(message.thread_id),
      );
      const lastActivity = playerMessages.reduce<string | null>(
        (latest, message) =>
          !latest || message.created_at > latest ? message.created_at : latest,
        null,
      );

      return {
        player_id: player.id,
        conversation_count: playerThreads.length,
        message_count: playerMessages.length,
        estimated_seconds: playerMessages.reduce(
          (total, message) => total + message.estimated_seconds,
          0,
        ),
        last_activity_at: lastActivity,
      };
    });
}

function HostChatSimulation({
  player,
  gamePlayer,
  nightMessages,
  playerMessages,
  busy,
  onSend,
}: {
  player: PublicRoomPlayer;
  gamePlayer?: Player;
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  busy: boolean;
  onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const visibleRoleId = gamePlayer
    ? getPlayerVisibleRoleId(gamePlayer.roleId, gamePlayer.drunkRoleId)
    : "washerwoman";
  const visibleRole = getRole(visibleRoleId);
  const timeline = useMemo(
    () =>
      [
        ...nightMessages
          .filter((message) => message.player_id === player.id)
          .map((message) => ({
            id: message.id,
            direction: "incoming" as const,
            round: message.round,
            createdAt: message.created_at,
            body: getPlayerNightMessageDisplayBody(message.body, message.role_id),
          })),
        ...playerMessages
          .filter((message) => message.player_id === player.id)
          .map((message) => ({
            id: message.id,
            direction: "outgoing" as const,
            round: message.round,
            createdAt: message.created_at,
            body: getPlayerMessageDisplayBody(message.body),
          })),
      ].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [nightMessages, player.id, playerMessages],
  );
  const latestMessageId = timeline.at(-1)?.id;

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (!timelineElement) return;
    const frame = requestAnimationFrame(() => {
      timelineElement.scrollTop = timelineElement.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessageId, player.id]);

  const submit = async () => {
    const cleanBody = body.trim();
    if (!cleanBody || sending || busy) return;
    setSending(true);
    setError("");
    try {
      await onSend(cleanBody);
      setBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /function|schema cache|simulate_player_message/i.test(message)
          ? "模拟消息数据库尚未配置"
          : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="player-simulation-chat">
      <header className="player-simulation-chat-header">
        <span className="player-simulation-chat-avatar">
          <RoleIcon roleId={visibleRole.id} size={34} />
        </span>
        <div>
          <strong>上帝对话</strong>
          <small>
            当前模拟 {formatSeat(player.seat)} {player.name || "玩家"} · {visibleRole.name}
          </small>
        </div>
        <b>{timeline.length} 条</b>
      </header>

      <div className="player-simulation-chat-timeline" ref={timelineRef}>
        {timeline.length ? (
          timeline.map((message) => (
            <article
              className={`player-simulation-chat-message ${message.direction}`}
              key={message.id}
            >
              <div>
                <small>
                  {message.direction === "incoming" ? "上帝" : "我"} · 第 {message.round} 回合 · {formatTime(message.createdAt)}
                </small>
                <p>{message.body}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="player-simulation-chat-empty">
            <MessageSquareText size={24} />
            <strong>还没有消息</strong>
            <span>可以在这里模拟玩家向上帝发送普通文字或技能回复。</span>
          </div>
        )}
      </div>

      <div className="player-simulation-chat-composer">
        <textarea
          value={body}
          maxLength={500}
          disabled={busy || sending}
          placeholder="以当前玩家身份给上帝发消息"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button
          className="primary-button"
          type="button"
          disabled={!body.trim() || busy || sending}
          onClick={() => void submit()}
        >
          {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
          发送
        </button>
      </div>
      {error ? <p className="player-simulation-error">{error}</p> : null}
    </section>
  );
}

function VotingSimulation({
  currentPlayerId,
  phase,
  round,
  players,
  gamePlayers,
  nominations,
  votes,
  resolutions,
  busy,
  onNominate,
  onVote,
}: {
  currentPlayerId: string;
  phase: Phase;
  round: number;
  players: PublicRoomPlayer[];
  gamePlayers: Player[];
  nominations: Nomination[];
  votes: DayVote[];
  resolutions: DayResolution[];
  busy: boolean;
  onNominate: (nomineePlayerId: string) => Promise<void>;
  onVote: (nominationId: string) => Promise<void>;
}) {
  const [nomineePlayerId, setNomineePlayerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dayRound = phase === "夜晚" ? Math.max(1, round - 1) : round;
  const currentNominations = nominations.filter(
    (nomination) => nomination.round === dayRound,
  );
  const openNomination = currentNominations.find(
    (nomination) => nomination.status === "open",
  );
  const resolution = resolutions.find((item) => item.round === dayRound);
  const currentPlayer = gamePlayers.find(
    (player) => player.id === currentPlayerId,
  );
  const myNomination = currentNominations.find(
    (nomination) => nomination.nominator_player_id === currentPlayerId,
  );
  const nominatedPlayerIds = new Set(
    currentNominations.map((nomination) => nomination.nominee_player_id),
  );
  const nomineeOptions = players.filter(
    (player) => player.is_claimed && !nominatedPlayerIds.has(player.id),
  );
  const selectedNomineeId = nomineeOptions.some(
    (player) => player.id === nomineePlayerId,
  )
    ? nomineePlayerId
    : nomineeOptions[0]?.id ?? "";
  const currentVote = openNomination
    ? votes.find(
        (vote) =>
          vote.nomination_id === openNomination.id &&
          vote.voter_player_id === currentPlayerId,
      )
    : undefined;
  const deadVoteSpent = votes.some(
    (vote) => vote.voter_player_id === currentPlayerId && !vote.voter_was_alive,
  );
  const aliveCount = gamePlayers.filter((player) => player.alive).length;
  const requiredVotes = Math.max(1, Math.ceil(aliveCount / 2));
  const canNominate = Boolean(
    phase === "白天" &&
      currentPlayer?.alive &&
      !resolution &&
      !openNomination &&
      !myNomination &&
      selectedNomineeId,
  );
  const canVote = Boolean(
    phase === "白天" &&
      openNomination &&
      !resolution &&
      !currentVote &&
      (currentPlayer?.alive || !deadVoteSpent),
  );
  const openVotes = openNomination
    ? votes.filter((vote) => vote.nomination_id === openNomination.id)
    : [];

  const submitNomination = async () => {
    if (!canNominate || !selectedNomineeId || submitting) return;
    if (
      !window.confirm(
        `以 ${getPlayerLabel(players, currentPlayerId)} 的身份提名 ${getPlayerLabel(players, selectedNomineeId)}？`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onNominate(selectedNomineeId);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /function|schema cache|simulate_nominate/i.test(message)
          ? "模拟提名数据库尚未配置"
          : /another nomination is currently open/i.test(message)
            ? "当前已有一项提名正在投票"
            : /already nominated today/i.test(message)
              ? "该玩家今天已经被提名过"
              : /already nominated a player today/i.test(message)
                ? "当前玩家今天已经发起过提名"
                : "提名失败，请刷新后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitVote = async () => {
    if (!canVote || !openNomination || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onVote(openNomination.id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /function|schema cache|simulate_cast_vote/i.test(message)
          ? "模拟投票数据库尚未配置"
          : /dead vote already used/i.test(message)
            ? "该玩家本局的死亡票已经使用"
            : /already voted/i.test(message)
              ? "该玩家已经参与本轮投票"
              : "投票失败，请刷新后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="player-simulation-voting">
      <div className="player-simulation-voting-summary">
        <div>
          <span>{phase === "白天" ? <Sun size={17} /> : <MoonStar size={17} />}</span>
          <div>
            <strong>{phase === "白天" ? `第 ${round} 天` : "夜晚暂停投票"}</strong>
            <small>存活 {aliveCount} 人 · 过半票数 {requiredVotes}</small>
          </div>
        </div>
        <span className={currentPlayer?.alive ? "alive" : "dead"}>
          {currentPlayer?.alive ? "存活" : `死亡票${deadVoteSpent ? "已用" : "可用"}`}
        </span>
      </div>

      {openNomination ? (
        <article className="player-simulation-open-vote">
          <header>
            <span><Vote size={16} />正在投票</span>
            <strong>{openVotes.length}/{requiredVotes}</strong>
          </header>
          <div className="player-simulation-vote-matchup">
            <span>
              <small>提名者</small>
              <strong>{getPlayerLabel(players, openNomination.nominator_player_id)}</strong>
            </span>
            <Gavel size={20} />
            <span>
              <small>被提名者</small>
              <strong>{getPlayerLabel(players, openNomination.nominee_player_id)}</strong>
            </span>
          </div>
          <div className="player-simulation-voters">
            {openVotes.length ? (
              openVotes.map((vote) => (
                <span key={vote.id} className={vote.voter_was_alive ? "" : "dead"}>
                  {getPlayerLabel(players, vote.voter_player_id)}
                  {!vote.voter_was_alive ? <Skull size={10} /> : null}
                </span>
              ))
            ) : (
              <small>还没有玩家投票</small>
            )}
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={!canVote || busy || submitting}
            onClick={() => void submitVote()}
          >
            {submitting ? <LoaderCircle className="spin" size={15} /> : currentVote ? <Check size={15} /> : <Vote size={15} />}
            {currentVote
              ? "当前玩家已投票"
              : !currentPlayer?.alive && deadVoteSpent
                ? "死亡票已经使用"
                : "模拟当前玩家投票"}
          </button>
        </article>
      ) : (
        <article className="player-simulation-nomination">
          <header>
            <span><Gavel size={16} />发起处决提名</span>
            <small>每名存活玩家每天一次</small>
          </header>
          {phase !== "白天" ? (
            <p>当前是夜晚阶段，进入白天后才能发起提名。</p>
          ) : resolution ? (
            <p>今天的处决已经结算，不能继续提名。</p>
          ) : !currentPlayer?.alive ? (
            <p>死亡玩家不能发起提名，但仍可使用尚未消耗的死亡票。</p>
          ) : myNomination ? (
            <p>当前玩家今天已经发起过提名。</p>
          ) : nomineeOptions.length ? (
            <div className="player-simulation-nomination-row">
              <select
                value={selectedNomineeId}
                disabled={busy || submitting}
                aria-label="选择被提名玩家"
                onChange={(event) => setNomineePlayerId(event.target.value)}
              >
                {nomineeOptions.map((player) => (
                  <option value={player.id} key={player.id}>
                    {getPlayerLabel(players, player.id)}{player.alive ? "" : " · 已死亡"}
                  </option>
                ))}
              </select>
              <button
                className="primary-button"
                type="button"
                disabled={!canNominate || busy || submitting}
                onClick={() => void submitNomination()}
              >
                {submitting ? <LoaderCircle className="spin" size={15} /> : <Gavel size={15} />}
                确认提名
              </button>
            </div>
          ) : (
            <p>今天所有玩家都已经被提名过。</p>
          )}
        </article>
      )}

      <section className="player-simulation-vote-history">
        <header>
          <strong>今日提名记录</strong>
          <small>{currentNominations.length} 项</small>
        </header>
        {currentNominations.length ? (
          <div>
            {[...currentNominations].reverse().map((nomination) => {
              const nominationVotes = votes.filter(
                (vote) => vote.nomination_id === nomination.id,
              );
              return (
                <article key={nomination.id}>
                  <span>
                    {getPlayerLabel(players, nomination.nominator_player_id)}
                    <b>提名</b>
                    {getPlayerLabel(players, nomination.nominee_player_id)}
                  </span>
                  <strong>{nominationVotes.length} 票</strong>
                  <small>
                    {nomination.status === "open"
                      ? "进行中"
                      : nomination.status === "executed"
                        ? "已处决"
                        : "已结束"}
                  </small>
                </article>
              );
            })}
          </div>
        ) : (
          <p>今天还没有提名记录。</p>
        )}
      </section>
      {error ? <p className="player-simulation-error">{error}</p> : null}
    </section>
  );
}

export function PlayerSimulationConsole({
  room,
  players,
  gamePlayers,
  scriptId,
  phase,
  round,
  nightMessages,
  playerMessages,
  dayPrivateThreads,
  dayPrivateMessages,
  nominations,
  votes,
  resolutions,
  busy,
  onBack,
  onToggleSimulation,
  onSendPlayerMessage,
  onSendPrivateMessage,
  onNominate,
  onVote,
}: Props) {
  const [activeView, setActiveView] = useState<SimulationView>("skill");
  const [requestedPlayerId, setRequestedPlayerId] = useState("");
  const claimedPlayers = useMemo(
    () =>
      players
        .filter((player) => player.is_claimed)
        .sort((left, right) => left.seat - right.seat),
    [players],
  );
  const selectedPlayerId = claimedPlayers.some(
    (player) => player.id === requestedPlayerId,
  )
    ? requestedPlayerId
    : claimedPlayers[0]?.id ?? "";
  const selectedPlayer = claimedPlayers.find(
    (player) => player.id === selectedPlayerId,
  );
  const selectedGamePlayer = gamePlayers.find(
    (player) => player.id === selectedPlayerId,
  );
  const simulationEnabled = Boolean(
    room?.simulation_enabled || players.some((player) => player.is_simulated),
  );
  const privateChatStats = useMemo(
    () => buildPrivateChatStats(players, dayPrivateThreads, dayPrivateMessages),
    [dayPrivateMessages, dayPrivateThreads, players],
  );

  if (!room) {
    return (
      <section className="player-simulation-empty-page">
        <Gamepad2 size={34} />
        <strong>请先创建共享房间</strong>
        <p>模拟后台依赖房间中的玩家座位、消息与投票数据。</p>
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={15} />返回魔典
        </button>
      </section>
    );
  }

  return (
    <section className="player-simulation-console">
      <header className="player-simulation-header">
        <button className="icon-button" type="button" onClick={onBack} title="返回魔典">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span>房间 {room.code}</span>
          <h2>玩家模拟后台</h2>
          <p>切换任意已入座玩家，模拟其在真实玩家端可执行的动作。</p>
        </div>
        <div className="player-simulation-status">
          <span className={phase === "白天" ? "day" : "night"}>
            {phase === "白天" ? <Sun size={14} /> : <MoonStar size={14} />}
            {phase === "白天" ? `第 ${round} 天` : round === 1 ? "首夜" : `第 ${round - 1} 晚`}
          </span>
          <span><UsersRound size={14} />{claimedPlayers.length}/{players.length} 人</span>
        </div>
      </header>

      <div className="player-simulation-mode-row">
        <div>
          <ShieldCheck size={18} />
          <span>
            <strong>模拟模式</strong>
            <small>{simulationEnabled ? "已开启，可以执行玩家端动作" : "开启后自动补齐空座测试玩家"}</small>
          </span>
        </div>
        <label className="simulation-toggle player-simulation-toggle">
          <input
            type="checkbox"
            checked={simulationEnabled}
            disabled={busy}
            onChange={(event) => void onToggleSimulation(event.target.checked)}
          />
          <span className="simulation-toggle-track" aria-hidden="true"><span /></span>
        </label>
      </div>

      {!simulationEnabled ? (
        <div className="player-simulation-disabled">
          <Gamepad2 size={28} />
          <strong>开启模拟模式开始测试</strong>
          <p>开启后会将未入座座位补为测试玩家，真实玩家不会被替换。</p>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => void onToggleSimulation(true)}
          >
            {busy ? <LoaderCircle className="spin" size={15} /> : <Gamepad2 size={15} />}
            开启模拟模式
          </button>
        </div>
      ) : !selectedPlayer ? (
        <div className="player-simulation-disabled">
          <LoaderCircle className="spin" size={28} />
          <strong>正在同步测试玩家</strong>
          <p>座位同步完成后即可选择玩家动作。</p>
        </div>
      ) : (
        <>
          <div className="player-simulation-player-strip" aria-label="选择模拟玩家">
            {claimedPlayers.map((player) => {
              const gamePlayer = gamePlayers.find((item) => item.id === player.id);
              const actualRole = getRole(gamePlayer?.roleId ?? "washerwoman");
              const visibleRole = getRole(
                gamePlayer
                  ? getPlayerVisibleRoleId(gamePlayer.roleId, gamePlayer.drunkRoleId)
                  : actualRole.id,
              );
              const active = player.id === selectedPlayerId;
              return (
                <button
                  className={active ? "player-simulation-player active" : "player-simulation-player"}
                  type="button"
                  key={player.id}
                  onClick={() => setRequestedPlayerId(player.id)}
                >
                  <span className="player-simulation-player-icon">
                    <RoleIcon roleId={visibleRole.id} size={36} />
                    <b>{player.seat}</b>
                  </span>
                  <span>
                    <strong>{player.name || "玩家"}</strong>
                    <small>{visibleRole.name}</small>
                    {actualRole.id !== visibleRole.id ? <em>真实：{actualRole.name}</em> : null}
                  </span>
                  <i className={gamePlayer?.alive === false ? "dead" : "alive"}>
                    {gamePlayer?.alive === false ? "死亡" : "存活"}
                  </i>
                </button>
              );
            })}
          </div>

          <nav className="player-simulation-view-tabs" aria-label="模拟动作">
            {simulationViews.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  className={activeView === view.id ? "active" : ""}
                  type="button"
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                >
                  <Icon size={16} />
                  {view.label}
                </button>
              );
            })}
          </nav>

          <div className="player-simulation-workspace">
            {activeView === "skill" ? (
              <SimulatedPlayerSkillReplyForm
                scriptId={scriptId}
                players={players}
                gamePlayers={gamePlayers}
                nightMessages={nightMessages}
                playerMessages={playerMessages}
                phase={phase}
                round={round}
                busy={busy}
                selectedPlayerId={selectedPlayerId}
                onPlayerChange={setRequestedPlayerId}
                showPlayerPicker={false}
                onSend={onSendPlayerMessage}
              />
            ) : null}

            {activeView === "host-chat" ? (
              <HostChatSimulation
                player={selectedPlayer}
                gamePlayer={selectedGamePlayer}
                nightMessages={nightMessages}
                playerMessages={playerMessages}
                busy={busy}
                onSend={(body) => onSendPlayerMessage(selectedPlayerId, body)}
              />
            ) : null}

            {activeView === "private-chat" ? (
              <PlayerPrivateChats
                currentPlayerId={selectedPlayerId}
                phase={phase}
                players={players}
                threads={dayPrivateThreads}
                messages={dayPrivateMessages}
                stats={privateChatStats}
                onSend={(recipientPlayerId, body) =>
                  onSendPrivateMessage(selectedPlayerId, recipientPlayerId, body)
                }
              />
            ) : null}

            {activeView === "voting" ? (
              <VotingSimulation
                currentPlayerId={selectedPlayerId}
                phase={phase}
                round={round}
                players={players}
                gamePlayers={gamePlayers}
                nominations={nominations}
                votes={votes}
                resolutions={resolutions}
                busy={busy}
                onNominate={(nomineePlayerId) =>
                  onNominate(selectedPlayerId, nomineePlayerId)
                }
                onVote={(nominationId) => onVote(nominationId, selectedPlayerId)}
              />
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
