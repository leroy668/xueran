import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  MessageCircleMore,
  MoonStar,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type {
  DayPrivateChatStat,
  DayPrivateMessage,
  DayPrivateThread,
  PublicRoomPlayer,
} from "./room";
import { formatSeat } from "./seat";

function formatVoiceDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  if (safeSeconds < 60) return safeSeconds ? `约 ${safeSeconds} 秒` : "0 秒";
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return rest ? `约 ${minutes} 分 ${rest} 秒` : `约 ${minutes} 分钟`;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function otherPlayerId(thread: DayPrivateThread, currentPlayerId: string) {
  return thread.player_a_id === currentPlayerId
    ? thread.player_b_id
    : thread.player_a_id;
}

export function PlayerPrivateChats({
  currentPlayerId,
  phase,
  players,
  threads,
  messages,
  stats,
  onSend,
}: {
  currentPlayerId: string;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  threads: DayPrivateThread[];
  messages: DayPrivateMessage[];
  stats: DayPrivateChatStat[];
  onSend: (recipientPlayerId: string, body: string) => Promise<void>;
}) {
  const contacts = useMemo(
    () =>
      players
        .filter((player) => player.is_claimed && player.id !== currentPlayerId)
        .sort((left, right) => left.seat - right.seat),
    [currentPlayerId, players],
  );
  const occupiedPlayers = useMemo(
    () =>
      players
        .filter((player) => player.is_claimed)
        .sort((left, right) => left.seat - right.seat),
    [players],
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);

  const latestThreadByPlayer = useMemo(() => {
    const result = new Map<string, DayPrivateThread>();
    threads.forEach((thread) => {
      const playerId = otherPlayerId(thread, currentPlayerId);
      if (!result.has(playerId)) result.set(playerId, thread);
    });
    return result;
  }, [currentPlayerId, threads]);

  const latestMessageByPlayer = useMemo(() => {
    const result = new Map<string, DayPrivateMessage>();
    messages.forEach((message) => {
      const playerId =
        message.sender_player_id === currentPlayerId
          ? message.recipient_player_id
          : message.sender_player_id;
      result.set(playerId, message);
    });
    return result;
  }, [currentPlayerId, messages]);

  useEffect(() => {
    if (selectedPlayerId && contacts.some((item) => item.id === selectedPlayerId)) {
      return;
    }
    const recentContact = contacts
      .filter((item) => latestThreadByPlayer.has(item.id))
      .sort((left, right) => {
        const leftTime = latestThreadByPlayer.get(left.id)?.updated_at ?? "";
        const rightTime = latestThreadByPlayer.get(right.id)?.updated_at ?? "";
        return rightTime.localeCompare(leftTime);
      })[0];
    setSelectedPlayerId(recentContact?.id ?? contacts[0]?.id ?? "");
  }, [contacts, latestThreadByPlayer, selectedPlayerId]);

  const selectedPlayer = contacts.find((item) => item.id === selectedPlayerId);
  const selectedMessages = messages.filter(
    (message) =>
      (message.sender_player_id === currentPlayerId &&
        message.recipient_player_id === selectedPlayerId) ||
      (message.sender_player_id === selectedPlayerId &&
        message.recipient_player_id === currentPlayerId),
  );
  const latestSelectedMessage = selectedMessages.at(-1);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const frame = requestAnimationFrame(() => {
      timeline.scrollTop = timeline.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestSelectedMessage?.id, selectedPlayerId]);

  const statByPlayer = useMemo(
    () => new Map(stats.map((stat) => [stat.player_id, stat])),
    [stats],
  );
  const estimatedDraftSeconds = Math.max(
    0,
    Math.ceil(body.replace(/\s/g, "").length / 4),
  );

  const submit = async () => {
    const cleanBody = body.trim();
    if (!selectedPlayerId || !cleanBody || sending || phase !== "白天") return;
    setSending(true);
    setSendError("");
    try {
      await onSend(selectedPlayerId, cleanBody);
      setBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /only available during the day/i.test(message)
          ? "当前已进入夜晚，不能发送新的私聊"
          : /recipient player is not seated/i.test(message)
            ? "对方已经离开座位"
            : /function|day_private|schema cache/i.test(message)
              ? "白天私聊数据库尚未配置"
              : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="player-private-chat-page">
      <div className="private-chat-stats">
        <div className="private-chat-section-heading">
          <div>
            <span>公开统计</span>
            <strong>本局玩家私聊概况</strong>
          </div>
          <UsersRound size={20} />
        </div>
        <p className="private-chat-privacy-note">
          <ShieldCheck size={14} />
          全体玩家只能看到次数与估算时长，私聊对象和内容仅会话双方与上帝可见。
        </p>
        <div className="private-chat-stat-list">
          {occupiedPlayers.map((player) => {
            const stat = statByPlayer.get(player.id);
            return (
              <article className="private-chat-stat-row" key={player.id}>
                <span>{formatSeat(player.seat)}</span>
                <div>
                  <strong>
                    {player.name || formatSeat(player.seat)}
                    {player.id === currentPlayerId ? <em>我</em> : null}
                  </strong>
                  <small>
                    私聊 {stat?.conversation_count ?? 0} 次 ·{" "}
                    {stat?.message_count ?? 0} 条消息
                  </small>
                </div>
                <time>
                  <Clock3 size={12} />
                  {formatVoiceDuration(stat?.estimated_seconds ?? 0)}
                </time>
              </article>
            );
          })}
        </div>
      </div>

      <div className="private-chat-workspace">
        <aside className="private-chat-contact-panel">
          <div className="private-chat-section-heading compact">
            <div>
              <span>我的私聊</span>
              <strong>选择玩家</strong>
            </div>
            <MessageCircleMore size={19} />
          </div>
          <div className="private-chat-contact-list">
            {contacts.length ? (
              contacts.map((player) => {
                const latestMessage = latestMessageByPlayer.get(player.id);
                return (
                  <button
                    className={player.id === selectedPlayerId ? "active" : ""}
                    key={player.id}
                    onClick={() => setSelectedPlayerId(player.id)}
                  >
                    <span>{player.seat}</span>
                    <div>
                      <strong>{player.name || formatSeat(player.seat)}</strong>
                      <small>
                        {latestMessage
                          ? latestMessage.body
                          : phase === "白天"
                            ? "发起私聊"
                            : "暂无消息"}
                      </small>
                    </div>
                    {latestMessage ? (
                      <time>{formatMessageTime(latestMessage.created_at)}</time>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="private-chat-contact-empty">暂无其他已入座玩家</div>
            )}
          </div>
        </aside>

        <div className="private-chat-conversation">
          {selectedPlayer ? (
            <>
              <header className="private-chat-conversation-header">
                <div className="private-chat-peer-avatar">{selectedPlayer.seat}</div>
                <div>
                  <strong>{selectedPlayer.name || formatSeat(selectedPlayer.seat)}</strong>
                  <span>{formatSeat(selectedPlayer.seat)} · 双方与上帝可见</span>
                </div>
                <b className={phase === "白天" ? "open" : "paused"}>
                  {phase === "白天" ? "白天可聊" : "夜晚暂停"}
                </b>
              </header>

              <div className="private-chat-timeline" ref={timelineRef}>
                {selectedMessages.length ? (
                  selectedMessages.map((message, index) => {
                    const outgoing = message.sender_player_id === currentPlayerId;
                    const showRound =
                      index === 0 || selectedMessages[index - 1].round !== message.round;
                    return (
                      <div key={message.id}>
                        {showRound ? (
                          <div className="private-chat-day-divider">
                            <span>第 {message.round} 天</span>
                          </div>
                        ) : null}
                        <article
                          className={`private-chat-message ${outgoing ? "outgoing" : "incoming"}`}
                        >
                          <div className="private-chat-message-copy">
                            <div className="private-chat-message-meta">
                              <span>{outgoing ? "我" : selectedPlayer.name}</span>
                              <time>{formatMessageTime(message.created_at)}</time>
                            </div>
                            <div className="private-chat-message-bubble">
                              <p>{message.body}</p>
                            </div>
                            <small>
                              <Clock3 size={11} />
                              {formatVoiceDuration(message.estimated_seconds)}语音
                            </small>
                          </div>
                        </article>
                      </div>
                    );
                  })
                ) : (
                  <div className="private-chat-timeline-empty">
                    <MessageCircleMore size={28} />
                    <strong>还没有私聊记录</strong>
                    <span>
                      {phase === "白天"
                        ? "发送第一条消息后，本次私聊会计入公开次数。"
                        : "夜晚可以查看记录，下一次白天再继续私聊。"}
                    </span>
                  </div>
                )}
              </div>

              <div className="private-chat-composer">
                {phase !== "白天" ? (
                  <div className="private-chat-paused-note">
                    <MoonStar size={14} />
                    夜晚暂停发送，历史消息仍可查看
                  </div>
                ) : null}
                <div className="private-chat-compose-row">
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={phase === "白天" ? "输入私聊内容" : "夜晚不能发送私聊"}
                    maxLength={500}
                    rows={2}
                    disabled={phase !== "白天" || sending}
                  />
                  <button
                    onClick={() => void submit()}
                    disabled={
                      phase !== "白天" || sending || !body.trim() || !selectedPlayerId
                    }
                    aria-label="发送私聊"
                    title="发送私聊"
                  >
                    <Send size={17} />
                    <span>{sending ? "发送中" : "发送"}</span>
                  </button>
                </div>
                <div className="private-chat-compose-meta">
                  <span>{body.length}/500</span>
                  <span>
                    {estimatedDraftSeconds
                      ? `${formatVoiceDuration(estimatedDraftSeconds)}语音`
                      : "输入后显示估算语音时长"}
                  </span>
                </div>
                {sendError ? <p className="private-chat-error">{sendError}</p> : null}
              </div>
            </>
          ) : (
            <div className="private-chat-no-peer">
              <UsersRound size={30} />
              <strong>等待其他玩家入座</strong>
              <span>有其他玩家入座后，就可以在白天发起私聊。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
