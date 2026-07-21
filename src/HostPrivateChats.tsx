import { Clock3, Eye, MessageCircleMore, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
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

function pairKey(leftId: string, rightId: string) {
  return leftId < rightId
    ? `${leftId}:${rightId}`
    : `${rightId}:${leftId}`;
}

function playerLabel(player: PublicRoomPlayer) {
  return player.name || formatSeat(player.seat);
}

type Conversation = {
  key: string;
  playerA: PublicRoomPlayer;
  playerB: PublicRoomPlayer;
  rounds: number;
  messages: DayPrivateMessage[];
  estimatedSeconds: number;
  latestAt: string;
};

export function HostPrivateChats({
  roomAvailable,
  players,
  threads,
  messages,
}: {
  roomAvailable: boolean;
  players: PublicRoomPlayer[];
  threads: DayPrivateThread[];
  messages: DayPrivateMessage[];
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(() => {
    const playerById = new Map(players.map((player) => [player.id, player]));
    const threadsByPair = new Map<string, DayPrivateThread[]>();
    const messagesByPair = new Map<string, DayPrivateMessage[]>();

    threads.forEach((thread) => {
      const key = pairKey(thread.player_a_id, thread.player_b_id);
      const current = threadsByPair.get(key) ?? [];
      current.push(thread);
      threadsByPair.set(key, current);
    });
    messages.forEach((message) => {
      const key = pairKey(
        message.sender_player_id,
        message.recipient_player_id,
      );
      const current = messagesByPair.get(key) ?? [];
      current.push(message);
      messagesByPair.set(key, current);
    });

    return [...threadsByPair.entries()]
      .map(([key, pairThreads]): Conversation | null => {
        const firstThread = pairThreads[0];
        const playerA = playerById.get(firstThread.player_a_id);
        const playerB = playerById.get(firstThread.player_b_id);
        if (!playerA || !playerB) return null;

        const pairMessages = (messagesByPair.get(key) ?? []).sort((left, right) =>
          left.created_at.localeCompare(right.created_at),
        );
        const latestAt =
          pairMessages.at(-1)?.created_at ??
          pairThreads
            .map((thread) => thread.updated_at)
            .sort((left, right) => right.localeCompare(left))[0] ??
          "";
        return {
          key,
          playerA,
          playerB,
          rounds: new Set(pairThreads.map((thread) => thread.round)).size,
          messages: pairMessages,
          estimatedSeconds: pairMessages.reduce(
            (total, message) => total + message.estimated_seconds,
            0,
          ),
          latestAt,
        };
      })
      .filter((item): item is Conversation => Boolean(item))
      .sort((left, right) => right.latestAt.localeCompare(left.latestAt));
  }, [messages, players, threads]);

  useEffect(() => {
    if (selectedKey && conversations.some((item) => item.key === selectedKey)) {
      return;
    }
    setSelectedKey(conversations[0]?.key ?? "");
  }, [conversations, selectedKey]);

  const selectedConversation = conversations.find(
    (conversation) => conversation.key === selectedKey,
  );
  const latestMessageId = selectedConversation?.messages.at(-1)?.id;

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const frame = requestAnimationFrame(() => {
      timeline.scrollTop = timeline.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessageId, selectedKey]);

  const totalSeconds = messages.reduce(
    (total, message) => total + message.estimated_seconds,
    0,
  );

  if (!roomAvailable) {
    return (
      <section className="host-private-chat-empty">
        <UsersRound size={32} />
        <strong>请先创建共享房间</strong>
        <span>房间开启后，上帝可以在这里审阅全部白天私聊。</span>
      </section>
    );
  }

  return (
    <section className="host-private-chat-page">
      <header className="host-private-chat-heading">
        <div>
          <span className="eyebrow">白天交流记录</span>
          <h2>白天私聊</h2>
          <p>上帝可查看完整正文；其他玩家只能查看自己的私聊内容。</p>
        </div>
        <div className="host-private-chat-totals" aria-label="私聊汇总">
          <span><b>{conversations.length}</b> 组会话</span>
          <span><b>{messages.length}</b> 条消息</span>
          <span><b>{formatVoiceDuration(totalSeconds)}</b> 语音</span>
        </div>
      </header>

      <div className="host-private-chat-workspace">
        <aside className="host-private-chat-list-panel">
          <div className="host-private-chat-list-heading">
            <UsersRound size={16} />
            <strong>玩家组合</strong>
            <span>{conversations.length}</span>
          </div>
          <div className="host-private-chat-list">
            {conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.key}
                  className={conversation.key === selectedKey ? "active" : ""}
                  onClick={() => setSelectedKey(conversation.key)}
                >
                  <span className="host-private-chat-pair-seats">
                    <b>{conversation.playerA.seat}</b>
                    <i />
                    <b>{conversation.playerB.seat}</b>
                  </span>
                  <span className="host-private-chat-pair-copy">
                    <strong>
                      {playerLabel(conversation.playerA)} ↔ {playerLabel(conversation.playerB)}
                    </strong>
                    <small>
                      {conversation.rounds} 次私聊 · {conversation.messages.length} 条 · {formatVoiceDuration(conversation.estimatedSeconds)}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <div className="host-private-chat-list-empty">
                <MessageCircleMore size={25} />
                <span>还没有玩家私聊</span>
              </div>
            )}
          </div>
        </aside>

        <div className="host-private-chat-conversation">
          {selectedConversation ? (
            <>
              <header className="host-private-chat-conversation-header">
                <div className="host-private-chat-pair-title">
                  <span>{selectedConversation.playerA.seat}</span>
                  <div>
                    <strong>{playerLabel(selectedConversation.playerA)}</strong>
                    <small>{formatSeat(selectedConversation.playerA.seat)}</small>
                  </div>
                  <i>↔</i>
                  <span>{selectedConversation.playerB.seat}</span>
                  <div>
                    <strong>{playerLabel(selectedConversation.playerB)}</strong>
                    <small>{formatSeat(selectedConversation.playerB.seat)}</small>
                  </div>
                </div>
                <b className="host-private-chat-readonly"><Eye size={13} />只读审阅</b>
              </header>

              <div className="host-private-chat-timeline" ref={timelineRef}>
                {selectedConversation.messages.map((message, index) => {
                  const senderIsA =
                    message.sender_player_id === selectedConversation.playerA.id;
                  const sender = senderIsA
                    ? selectedConversation.playerA
                    : selectedConversation.playerB;
                  const showRound =
                    index === 0 ||
                    selectedConversation.messages[index - 1].round !== message.round;
                  return (
                    <div key={message.id}>
                      {showRound ? (
                        <div className="private-chat-day-divider">
                          <span>第 {message.round} 天</span>
                        </div>
                      ) : null}
                      <article className={`host-private-chat-message ${senderIsA ? "left" : "right"}`}>
                        <div className="host-private-chat-message-avatar">{sender.seat}</div>
                        <div className="host-private-chat-message-copy">
                          <div className="host-private-chat-message-meta">
                            <strong>{playerLabel(sender)} · {formatSeat(sender.seat)}</strong>
                            <time>{formatMessageTime(message.created_at)}</time>
                          </div>
                          <div className="host-private-chat-message-bubble">
                            <p>{message.body}</p>
                          </div>
                          <small><Clock3 size={11} />{formatVoiceDuration(message.estimated_seconds)}语音</small>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="host-private-chat-no-conversation">
              <Eye size={31} />
              <strong>等待产生白天私聊</strong>
              <span>玩家开始私聊后，会话会自动出现在这里。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
