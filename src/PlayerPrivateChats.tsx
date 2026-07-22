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
  DayPrivateChatDirectionStat,
  DayPrivateChatPairStat,
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
  pairStats = [],
  directionStats = [],
  onSend,
}: {
  currentPlayerId: string;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  threads: DayPrivateThread[];
  messages: DayPrivateMessage[];
  pairStats?: DayPrivateChatPairStat[];
  directionStats?: DayPrivateChatDirectionStat[];
  onSend: (recipientPlayerId: string, body: string) => Promise<void>;
}) {
  const contacts = useMemo(
    () =>
      players
        .filter((player) => player.is_claimed && player.id !== currentPlayerId)
        .sort((left, right) => left.seat - right.seat),
    [currentPlayerId, players],
  );
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const publicThreads = useMemo(
    () =>
      [...threads].sort((left, right) => {
        if (left.round !== right.round) return right.round - left.round;
        return right.updated_at.localeCompare(left.updated_at);
      }),
    [threads],
  );
  const myThreads = useMemo(
    () =>
      threads.filter(
        (thread) =>
          thread.player_a_id === currentPlayerId ||
          thread.player_b_id === currentPlayerId,
      ),
    [currentPlayerId, threads],
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);

  const latestThreadByPlayer = useMemo(() => {
    const result = new Map<string, DayPrivateThread>();
    myThreads.forEach((thread) => {
      const playerId = otherPlayerId(thread, currentPlayerId);
      if (!result.has(playerId)) result.set(playerId, thread);
    });
    return result;
  }, [currentPlayerId, myThreads]);

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

  const publicDirectionStats = useMemo(() => {
    const threadById = new Map(publicThreads.map((thread) => [thread.id, thread]));
    const entries = new Map<
      string,
      {
        thread: DayPrivateThread;
        senderPlayerId: string;
        recipientPlayerId: string;
        messageCount: number;
        estimatedSeconds: number;
        lastActivityAt: string | null;
        directionKnown: boolean;
      }
    >();
    const providedKeys = new Set<string>();
    directionStats.forEach((stat) => {
      const thread = threadById.get(stat.thread_id);
      if (!thread) return;
      const key = `${stat.thread_id}:${stat.sender_player_id}:${stat.recipient_player_id}`;
      providedKeys.add(key);
      entries.set(key, {
        thread,
        senderPlayerId: stat.sender_player_id,
        recipientPlayerId: stat.recipient_player_id,
        messageCount: stat.message_count,
        estimatedSeconds: stat.estimated_seconds,
        lastActivityAt: stat.last_activity_at,
        directionKnown: true,
      });
    });
    messages.forEach((message) => {
      const thread = threadById.get(message.thread_id);
      if (!thread) return;
      const key = `${message.thread_id}:${message.sender_player_id}:${message.recipient_player_id}`;
      if (providedKeys.has(key)) return;
      const current = entries.get(key) ?? {
        thread,
        senderPlayerId: message.sender_player_id,
        recipientPlayerId: message.recipient_player_id,
        messageCount: 0,
        estimatedSeconds: 0,
        lastActivityAt: null,
        directionKnown: true,
      };
      current.messageCount += 1;
      current.estimatedSeconds += message.estimated_seconds;
      if (!current.lastActivityAt || message.created_at > current.lastActivityAt) {
        current.lastActivityAt = message.created_at;
      }
      entries.set(key, current);
    });
    const representedThreadIds = new Set(
      [...entries.values()].map((entry) => entry.thread.id),
    );
    const pairStatByThread = new Map(
      pairStats.map((stat) => [stat.thread_id, stat]),
    );
    publicThreads.forEach((thread) => {
      if (representedThreadIds.has(thread.id)) return;
      const pairStat = pairStatByThread.get(thread.id);
      entries.set(`${thread.id}:pair`, {
        thread,
        senderPlayerId: thread.player_a_id,
        recipientPlayerId: thread.player_b_id,
        messageCount: pairStat?.message_count ?? 0,
        estimatedSeconds: pairStat?.estimated_seconds ?? 0,
        lastActivityAt: pairStat?.last_activity_at ?? thread.updated_at,
        directionKnown: false,
      });
    });
    return [...entries.values()].sort((left, right) => {
      if (left.thread.round !== right.thread.round) {
        return right.thread.round - left.thread.round;
      }
      return (right.lastActivityAt ?? "").localeCompare(left.lastActivityAt ?? "");
    });
  }, [directionStats, messages, pairStats, publicThreads]);
  const publicThreadDays = useMemo(() => {
    const days = new Map<
      number,
      {
        round: number;
        entries: typeof publicDirectionStats;
        messageCount: number;
        estimatedSeconds: number;
      }
    >();
    publicDirectionStats.forEach((entry) => {
      const day = days.get(entry.thread.round) ?? {
        round: entry.thread.round,
        entries: [],
        messageCount: 0,
        estimatedSeconds: 0,
      };
      day.entries.push(entry);
      day.messageCount += entry.messageCount;
      day.estimatedSeconds += entry.estimatedSeconds;
      days.set(entry.thread.round, day);
    });
    return [...days.values()].sort((left, right) => right.round - left.round);
  }, [publicDirectionStats]);
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
                          <span
                            className="private-chat-message-avatar"
                            aria-hidden="true"
                          >
                            {outgoing ? "我" : selectedPlayer.seat}
                          </span>
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
          全体玩家可查看每天谁向谁发送了私聊、消息数量和估算语音时间，私聊内容仍仅会话双方与上帝可见。
        </p>
        <div className="private-chat-pair-overview">
          <div className="private-chat-pair-overview-heading">
            <strong>私聊方向</strong>
            <span>{publicDirectionStats.length} 条方向记录</span>
          </div>
          {publicThreadDays.length ? (
            <div className="private-chat-pair-days">
              {publicThreadDays.map((day) => (
                <section className="private-chat-pair-day" key={day.round}>
                  <header className="private-chat-pair-day-heading">
                    <strong>第 {day.round} 天</strong>
                    <span>
                      {day.entries.length} 条方向记录 · {day.messageCount} 条 · {formatVoiceDuration(day.estimatedSeconds)}
                    </span>
                  </header>
                  <div className="private-chat-pair-list">
                    {day.entries.map(({ thread, senderPlayerId, recipientPlayerId, messageCount, estimatedSeconds, directionKnown }) => {
                      const sender = playerById.get(senderPlayerId);
                      const recipient = playerById.get(recipientPlayerId);
                      return (
                        <article
                          className="private-chat-pair-row"
                          key={`${thread.id}:${senderPlayerId}:${recipientPlayerId}`}
                        >
                          <div className="private-chat-pair-route">
                            <div className="private-chat-pair-player">
                              <b>{sender?.seat ?? "?"}</b>
                              <span>{sender?.name || "未知玩家"}</span>
                            </div>
                            <em aria-label={directionKnown ? "发送给" : "私聊双方"}>
                              {directionKnown ? "→" : "↔"}
                            </em>
                            <div className="private-chat-pair-player">
                              <b>{recipient?.seat ?? "?"}</b>
                              <span>{recipient?.name || "未知玩家"}</span>
                            </div>
                          </div>
                          <div className="private-chat-pair-row-meta">
                            <span>{messageCount} 条消息</span>
                            <time>
                              <Clock3 size={11} />
                              {formatVoiceDuration(estimatedSeconds)}
                            </time>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="private-chat-pair-empty">本局暂未发生私聊</div>
          )}
        </div>
      </div>
    </section>
  );
}
