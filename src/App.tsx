import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  MoonStar,
  MessageSquareText,
  NotebookPen,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  Share2,
  Skull,
  Sparkles,
  Sun,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { getNightRoles, getRole, roles, scripts } from "./data";
import { DemonBluffMessage } from "./DemonBluffMessage";
import {
  buildDemonBluffMessage,
  getDemonBluffPreview,
  getDemonBluffSignature,
  parseDemonBluffMessage,
} from "./demonBluffs";
import { HostRoomPanel } from "./HostRoomPanel";
import { PlayerRoom } from "./PlayerRoom";
import { RoleIcon } from "./RoleIcon";
import { distributeRoles } from "./roleDistribution";
import {
  activeRoomStorageKey,
  buildRoomUrl,
  closeRoom,
  createRoom,
  findRoomByCode,
  getRoomEvilMessages,
  getRoomNightMessages,
  getRoomPlayerMessages,
  getRoomPlayers,
  loadHostRoom,
  resetRoom,
  revokeClaim,
  sendEvilMessage,
  sendNightMessage,
  setRoomSimulation,
  syncRoom,
  type EvilMessage,
  type NightMessage,
  type PlayerMessage,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import {
  buildShareUrl,
  getSharedState,
  loadState,
} from "./storage";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { GameState, Phase, Player, TabId, Team } from "./types";

const tabs: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "grimoire", label: "魔典", icon: BookOpen },
  { id: "night", label: "夜晚顺序", icon: MoonStar },
  { id: "messages", label: "玩家消息", icon: MessageSquareText },
  { id: "script", label: "剧本角色", icon: ScrollText },
];

const teamLabels: Record<Team, string> = {
  镇民: "townsfolk",
  外来者: "outsider",
  爪牙: "minion",
  恶魔: "demon",
};

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;

type PlayerNoteEntry = {
  id: string;
  body: string;
  createdAt?: string;
  resolved?: boolean;
  stage?: string;
};

const playerNotesPrefix = "__xueran_notes_v1__";

const parsePlayerNotes = (value: string): PlayerNoteEntry[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith(playerNotesPrefix)) {
    return [{ id: "legacy", body: value }];
  }
  try {
    const parsed = JSON.parse(trimmed.slice(playerNotesPrefix.length));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note): note is PlayerNoteEntry =>
        Boolean(note) &&
        typeof note.id === "string" &&
        typeof note.body === "string" &&
        (note.createdAt === undefined || typeof note.createdAt === "string") &&
        (note.resolved === undefined || typeof note.resolved === "boolean") &&
        (note.stage === undefined || typeof note.stage === "string"),
    );
  } catch {
    return [{ id: "legacy", body: value }];
  }
};

const serializePlayerNotes = (notes: PlayerNoteEntry[]) =>
  notes.length
    ? `${playerNotesPrefix}${JSON.stringify(notes)}`
    : "";

const chineseNumber = (value: number) => {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[Math.max(0, value)];
  if (value < 20) return `十${value === 10 ? "" : digits[value - 10]}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ""}`;
  }
  return String(value);
};

const getGameStageLabel = (phase: Phase, round: number) => {
  if (phase === "准备") return "准备";
  if (phase === "夜晚" && round <= 1) return "首夜";
  const sequence = phase === "白天" ? round : Math.max(1, round - 1);
  return `第${chineseNumber(sequence)}${phase === "白天" ? "天" : "晚"}`;
};

const getNextGameStage = (
  phase: Phase,
  round: number,
): Pick<GameState, "phase" | "round"> => {
  if (phase === "准备") return { phase: "夜晚", round: 1 };
  if (phase === "夜晚") return { phase: "白天", round: Math.max(1, round) };
  return { phase: "夜晚", round: round + 1 };
};

const sampleRoles = [
  "washerwoman",
  "empath",
  "fortune-teller",
  "monk",
  "ravenkeeper",
  "butler",
  "imp",
];

const newPlayer = (seat: number, name = ""): Player => ({
  id: makeId(),
  seat,
  name,
  roleId: "washerwoman",
  alive: true,
  identityMessage: "",
  notes: "",
});

function App() {
  const roomCode = new URLSearchParams(window.location.search).get("room");
  return roomCode ? (
    <PlayerRoom roomCode={roomCode} />
  ) : (
    <GrimoireApp />
  );
}

function GrimoireApp() {
  const shared = getSharedState();
  const [state, setState] = useState<GameState>(() => {
    const saved = loadState();
    return shared
      ? { ...saved, ...shared, updatedAt: new Date().toISOString() }
      : saved;
  });
  const [activeTab, setActiveTab] = useState<TabId>("grimoire");
  const [toast, setToast] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<PublicRoomPlayer[]>([]);
  const [nightMessages, setNightMessages] = useState<NightMessage[]>([]);
  const [playerMessages, setPlayerMessages] = useState<PlayerMessage[]>([]);
  const [evilMessages, setEvilMessages] = useState<EvilMessage[]>([]);
  const [readPlayerMessageIds, setReadPlayerMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [readEvilMessageIds, setReadEvilMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");

  useEffect(() => {
    localStorage.setItem("xueran-grimoire-v1", JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!room) {
      setReadPlayerMessageIds(new Set());
      setReadEvilMessageIds(new Set());
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(`xueran-host-read-messages-${room.id}`) ?? "[]",
      );
      setReadPlayerMessageIds(
        new Set(
          Array.isArray(saved)
            ? saved.filter((messageId): messageId is string => typeof messageId === "string")
            : [],
        ),
      );
    } catch {
      setReadPlayerMessageIds(new Set());
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(`xueran-host-read-evil-${room.id}`) ?? "[]",
      );
      setReadEvilMessageIds(
        new Set(
          Array.isArray(saved)
            ? saved.filter((messageId): messageId is string => typeof messageId === "string")
            : [],
        ),
      );
    } catch {
      setReadEvilMessageIds(new Set());
    }
  }, [room]);

  const refreshRoomAdmin = useCallback(async (targetRoom: SharedRoom) => {
    const [players, messages, incomingMessages, teamMessages] = await Promise.all([
      getRoomPlayers(targetRoom.id),
      getRoomNightMessages(targetRoom.id),
      getRoomPlayerMessages(targetRoom.id),
      getRoomEvilMessages(targetRoom.id),
    ]);
    setRoomPlayers(players);
    setNightMessages(messages);
    setPlayerMessages(incomingMessages);
    setEvilMessages(teamMessages);
  }, []);

  const unreadPlayerMessages = useMemo(
    () =>
      playerMessages.filter(
        (message) => !readPlayerMessageIds.has(message.id),
      ),
    [playerMessages, readPlayerMessageIds],
  );
  const unreadEvilMessages = useMemo(
    () =>
      evilMessages.filter(
        (message) =>
          message.sender_kind === "player" &&
          !readEvilMessageIds.has(message.id),
      ),
    [evilMessages, readEvilMessageIds],
  );

  const markPlayerMessagesRead = useCallback(
    (playerId: string) => {
      if (!room) return;
      const messageIds = playerMessages
        .filter((message) => message.player_id === playerId)
        .map((message) => message.id);
      if (!messageIds.length) return;

      setReadPlayerMessageIds((current) => {
        if (messageIds.every((messageId) => current.has(messageId))) {
          return current;
        }
        const next = new Set(current);
        messageIds.forEach((messageId) => next.add(messageId));
        localStorage.setItem(
          `xueran-host-read-messages-${room.id}`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [playerMessages, room],
  );

  const markEvilMessagesRead = useCallback(() => {
    if (!room) return;
    const messageIds = evilMessages
      .filter((message) => message.sender_kind === "player")
      .map((message) => message.id);
    if (!messageIds.length) return;

    setReadEvilMessageIds((current) => {
      if (messageIds.every((messageId) => current.has(messageId))) {
        return current;
      }
      const next = new Set(current);
      messageIds.forEach((messageId) => next.add(messageId));
      localStorage.setItem(
        `xueran-host-read-evil-${room.id}`,
        JSON.stringify([...next]),
      );
      return next;
    });
  }, [evilMessages, room]);

  useEffect(() => {
    let cancelled = false;
    const restoreRoom = async () => {
      const code = localStorage.getItem(activeRoomStorageKey);
      if (!code) return;
      try {
        const session = await ensureAnonymousSession();
        const savedRoom = await findRoomByCode(code);
        if (!savedRoom || savedRoom.status !== "open") {
          localStorage.removeItem(activeRoomStorageKey);
          return;
        }
        const cloudState = await loadHostRoom(savedRoom, session.user);
        if (cancelled) return;
        setState(cloudState);
        setRoom(savedRoom);
        setRoomReady(true);
        setSyncStatus("synced");
        await refreshRoomAdmin(savedRoom);
      } catch {
        localStorage.removeItem(activeRoomStorageKey);
      }
    };
    void restoreRoom();
    return () => {
      cancelled = true;
    };
  }, [refreshRoomAdmin]);

  useEffect(() => {
    if (!room || !roomReady) return;
    setSyncStatus("syncing");
    const timer = window.setTimeout(() => {
      void syncRoom(room.id, state)
        .then(() => {
          setSyncStatus("synced");
          return refreshRoomAdmin(room);
        })
        .catch(() => setSyncStatus("error"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [refreshRoomAdmin, room, roomReady, state]);

  useEffect(() => {
    if (!room) return;
    const interval = window.setInterval(() => {
      void refreshRoomAdmin(room).catch(() => undefined);
    }, 3500);
    const channel = supabase
      .channel(`xueran-host-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xueran_claim_requests",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xueran_players",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "xueran_night_messages",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "xueran_player_messages",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "xueran_evil_messages",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refreshRoomAdmin, room]);

  const nightRoles = useMemo(() => getNightRoles(state.players), [state.players]);
  const currentNightRole = nightRoles[state.nightIndex] ?? nightRoles[0];
  const aliveCount = state.players.filter((player) => player.alive).length;
  const selectedRole = currentNightRole ? getRole(currentNightRole.id) : null;

  const update = (patch: Partial<GameState>) => {
    setState((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  };

  const updatePlayer = (id: string, patch: Partial<Player>) => {
    setState((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id ? { ...player, ...patch } : player,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addPlayer = () => {
    if (state.players.length >= 20) {
      setToast("魔典最多支持 20 个座位");
      return;
    }
    setState((current) => ({
      ...current,
      players: [...current.players, newPlayer(current.players.length + 1)],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removePlayer = (id: string) => {
    setState((current) => ({
      ...current,
      players: current.players
        .filter((player) => player.id !== id)
        .map((player, index) => ({ ...player, seat: index + 1 })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const quickStart = () => {
    const players = sampleRoles.map((roleId, index) => ({
      ...newPlayer(index + 1),
      roleId,
    }));
    update({ players, phase: "准备", round: 1, nightIndex: 0 });
    setToast("已载入 7 人示例局");
  };

  const assignRoles = () => {
    const playerCount = state.players.length;
    if (playerCount < 5 || playerCount > 15) {
      setToast("标准角色分配需要 5 至 15 名玩家");
      return;
    }

    const currentRoleIds = state.players.map((player) => player.roleId);
    const rolesAlreadyAssigned = new Set(currentRoleIds).size === playerCount;
    if (
      rolesAlreadyAssigned &&
      !window.confirm("重新随机分配全部角色？现有角色、存活状态和角色备注将被替换。")
    ) {
      return;
    }

    try {
      const distribution = distributeRoles(playerCount);
      setState((current) => ({
        ...current,
        phase: "准备",
        round: 1,
        nightIndex: 0,
        players: current.players.map((player, index) => ({
          ...player,
          roleId: distribution.roleIds[index],
          alive: true,
          identityMessage: "",
          notes: "",
        })),
        updatedAt: new Date().toISOString(),
      }));
      const { counts } = distribution;
      setToast(
        `已分配：${counts.镇民}镇民 · ${counts.外来者}外来者 · ${counts.爪牙}爪牙 · ${counts.恶魔}恶魔${distribution.hasBaron ? "（男爵修正）" : ""}`,
      );
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "角色分配失败");
    }
  };

  const resetGame = async () => {
    if (
      !window.confirm(
        room
          ? "重新开始一局？将保留房间、座位、已入座玩家和当前角色，清空全部聊天记录、备注与存活状态。"
          : "重新开始一局？将保留当前座位和角色，清空备注并恢复全员存活。",
      )
    ) {
      return;
    }

    const nextState: GameState = {
      ...state,
      phase: "准备",
      round: 1,
      nightIndex: 0,
      storytellerNotes: "",
      players: state.players.map((player) => ({
        ...player,
        alive: true,
        identityMessage: "",
        notes: "",
      })),
      updatedAt: new Date().toISOString(),
    };

    if (!room) {
      setState(nextState);
      setNightMessages([]);
      setPlayerMessages([]);
      setEvilMessages([]);
      setActiveTab("grimoire");
      setToast("已重开一局，当前玩家和角色已保留");
      return;
    }

    setRoomBusy(true);
    setRoomReady(false);
    setSyncStatus("syncing");
    try {
      await resetRoom(room.id);
      await syncRoom(room.id, nextState);
      setState(nextState);
      setNightMessages([]);
      setPlayerMessages([]);
      setEvilMessages([]);
      localStorage.removeItem(`xueran-demon-bluffs-${room.id}`);
      setRoom((current) =>
        current
          ? {
              ...current,
              phase: "准备",
              round: 1,
              updated_at: new Date().toISOString(),
            }
          : current,
      );
      await refreshRoomAdmin(room);
      setActiveTab("grimoire");
      setSyncStatus("synced");
      setToast("已重开一局，已入座玩家全部保留");
    } catch {
      setSyncStatus("error");
      setToast("重开失败，请检查 Supabase 数据库配置");
    } finally {
      setRoomReady(true);
      setRoomBusy(false);
    }
  };

  const shareGame = async () => {
    const url = buildShareUrl(state);
    try {
      await navigator.clipboard.writeText(url);
      setToast("分享链接已复制");
    } catch {
      window.prompt("复制这个分享链接", url);
    }
  };

  const startSharedRoom = async () => {
    setRoomBusy(true);
    try {
      await ensureAnonymousSession();
      const nextRoom = await createRoom(state);
      localStorage.setItem(activeRoomStorageKey, nextRoom.code);
      setRoom(nextRoom);
      setRoomReady(true);
      setSyncStatus("synced");
      await refreshRoomAdmin(nextRoom);
      setToast("共享房间已创建，所有玩家可扫描同一个二维码");
    } catch (reason) {
      setToast(
        reason instanceof Error && /anonymous/i.test(reason.message)
          ? "请先在 Supabase 中启用匿名登录"
          : "房间创建失败，请检查 Supabase 配置",
      );
    } finally {
      setRoomBusy(false);
    }
  };

  const shareRoom = async () => {
    if (!room) return;
    const url = buildRoomUrl(room.code);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `儿戏的血染钟楼房间 ${room.code}`,
          text: "打开链接，填写你的名字并选择现场座位号。",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("统一房间链接已复制");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setToast("统一房间链接已复制");
      } catch {
        window.prompt("复制统一房间链接", url);
      }
    }
  };

  const handleRevokeClaim = async (playerId: string) => {
    if (!room) return;
    try {
      await revokeClaim(playerId);
      await refreshRoomAdmin(room);
      setToast("已撤销该设备的身份访问");
    } catch {
      setToast("撤销失败，请稍后重试");
    }
  };

  const handleToggleSimulation = async (enabled: boolean) => {
    if (!room) return;
    setRoomBusy(true);
    try {
      await setRoomSimulation(room.id, enabled);
      setRoom((current) =>
        current ? { ...current, simulation_enabled: enabled } : current,
      );
      await refreshRoomAdmin(room);
      setToast(
        enabled
          ? "模拟模式已开启，所有空座均视为已入座"
          : "模拟模式已关闭，真实玩家保持入座",
      );
    } catch {
      setToast("模拟开关启用失败，请检查 Supabase 数据库配置");
    } finally {
      setRoomBusy(false);
    }
  };

  const endSharedRoom = async () => {
    if (!room || !window.confirm("结束共享房间？所有玩家将无法继续查看身份。")) return;
    try {
      await closeRoom(room.id);
      localStorage.removeItem(activeRoomStorageKey);
      setRoom(null);
      setRoomReady(false);
      setRoomPlayers([]);
      setNightMessages([]);
      setPlayerMessages([]);
      setEvilMessages([]);
      setSyncStatus("idle");
      setToast("共享房间已结束，本地魔典仍然保留");
    } catch {
      setToast("结束房间失败，请稍后重试");
    }
  };

  const changeNight = (offset: number) => {
    if (!nightRoles.length) return;
    update({
      nightIndex:
        (state.nightIndex + offset + nightRoles.length) % nightRoles.length,
    });
  };

  const handleSendNightMessage = async ({
    playerId,
    roleId,
    body,
  }: {
    playerId: string;
    roleId: string;
    body: string;
  }) => {
    if (!room) throw new Error("请先创建共享房间");
    const message = await sendNightMessage({
      roomId: room.id,
      playerId,
      roleId,
      round: state.round,
      body,
    });
    setNightMessages((current) => [
      message,
      ...current.filter((item) => item.id !== message.id),
    ]);
    const target = roomPlayers.find((player) => player.id === playerId);
    setToast(`夜间信息已发送给座位 ${target?.seat ?? "?"}`);
  };

  const handleSendEvilMessage = async (body: string) => {
    if (!room) throw new Error("请先创建共享房间");
    const message = await sendEvilMessage({
      roomId: room.id,
      body,
    });
    setEvilMessages((current) => [
      message,
      ...current.filter((item) => item.id !== message.id),
    ]);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-seal" aria-hidden="true">
            <RoleIcon roleId="imp" size={24} className="brand-game-icon" />
          </div>
          <h1>儿戏的血染钟楼</h1>
        </div>
        <div className="top-actions">
          <span className={room ? "local-badge cloud-badge" : "local-badge"}>
            <span className="status-dot" />
            {room ? `房间 ${room.code}` : "本地模式"}
          </span>
          <button className="icon-button with-label" onClick={shareGame} aria-label="分享剧本" title="分享剧本">
            <Share2 size={16} />
            <span className="share-label">分享剧本</span>
          </button>
          <button
            className="icon-button danger-button"
            onClick={() => void resetGame()}
            title="保留玩家并重开"
            disabled={roomBusy}
          >
            <RotateCcw size={16} />
            <span className="desktop-only">重置</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <nav className="tab-bar" aria-label="魔典导航">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={activeTab === tab.id ? "tab active" : "tab"}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={17} />
                {tab.label}
                {tab.id === "night" && nightRoles.length > 0 ? (
                  <span className="tab-count">{nightRoles.length}</span>
                ) : tab.id === "messages" &&
                  unreadPlayerMessages.length + unreadEvilMessages.length > 0 ? (
                  <span className="tab-count">
                    {unreadPlayerMessages.length + unreadEvilMessages.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {activeTab === "grimoire" ? (
          <GrimoirePanel
            state={state}
            aliveCount={aliveCount}
            onUpdate={update}
            onUpdatePlayer={updatePlayer}
            onRemovePlayer={removePlayer}
            onAddPlayer={addPlayer}
            onAssignRoles={assignRoles}
            onQuickStart={quickStart}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            roomPanel={
              <HostRoomPanel
                room={room}
                roomUrl={room ? buildRoomUrl(room.code) : ""}
                players={roomPlayers}
                busy={roomBusy}
                syncStatus={syncStatus}
                onCreate={() => void startSharedRoom()}
                onCopy={() => void shareRoom()}
                onRevoke={(playerId) => void handleRevokeClaim(playerId)}
                onToggleSimulation={(enabled) =>
                  void handleToggleSimulation(enabled)
                }
                onClose={() => void endSharedRoom()}
              />
            }
          />
        ) : null}

        {activeTab === "night" ? (
          <NightPanel
            state={state}
            nightRoles={nightRoles}
            currentRole={selectedRole}
            room={room}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            playerMessages={playerMessages}
            unreadPlayerMessages={unreadPlayerMessages}
            onChangeNight={changeNight}
            onSelectNight={(index) => update({ nightIndex: index })}
            onReadPlayerMessages={markPlayerMessagesRead}
            onSendMessage={handleSendNightMessage}
          />
        ) : null}

        {activeTab === "messages" ? (
          <HostMessagesPanel
            state={state}
            room={room}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            playerMessages={playerMessages}
            evilMessages={evilMessages}
            unreadPlayerMessages={unreadPlayerMessages}
            unreadEvilMessages={unreadEvilMessages}
            onReadPlayerMessages={markPlayerMessagesRead}
            onReadEvilMessages={markEvilMessagesRead}
            onSendMessage={handleSendNightMessage}
            onSendEvilMessage={handleSendEvilMessage}
          />
        ) : null}

        {activeTab === "script" ? (
          <ScriptPanel
            scriptId={state.scriptId}
            roleFilter={roleFilter}
            onSelectScript={(scriptId) => update({ scriptId })}
            onFilter={setRoleFilter}
          />
        ) : null}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={activeTab === tab.id ? "mobile-nav-item active" : "mobile-nav-item"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={19} />
              <span>{tab.label}</span>
              {tab.id === "messages" &&
              unreadPlayerMessages.length + unreadEvilMessages.length > 0 ? (
                <strong className="mobile-nav-badge">
                  {Math.min(
                    unreadPlayerMessages.length + unreadEvilMessages.length,
                    99,
                  )}
                </strong>
              ) : null}
            </button>
          );
        })}
      </nav>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function GrimoirePanel({
  state,
  aliveCount,
  onUpdate,
  onUpdatePlayer,
  onRemovePlayer,
  onAddPlayer,
  onAssignRoles,
  onQuickStart,
  roomPlayers,
  nightMessages,
  roomPanel,
}: {
  state: GameState;
  aliveCount: number;
  onUpdate: (patch: Partial<GameState>) => void;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onRemovePlayer: (id: string) => void;
  onAddPlayer: () => void;
  onAssignRoles: () => void;
  onQuickStart: () => void;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  roomPanel: ReactNode;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    state.players[0]?.id ?? null,
  );

  useEffect(() => {
    if (!state.players.length) {
      setSelectedPlayerId(null);
      return;
    }
    if (!state.players.some((player) => player.id === selectedPlayerId)) {
      setSelectedPlayerId(state.players[0].id);
    }
  }, [selectedPlayerId, state.players]);

  const roomPlayersBySeat = useMemo(
    () => new Map(roomPlayers.map((player) => [player.seat, player])),
    [roomPlayers],
  );
  const selectedPlayer =
    state.players.find((player) => player.id === selectedPlayerId) ??
    state.players[0];

  const getDisplayName = (player: Player) => {
    const roomPlayer = roomPlayersBySeat.get(player.seat);
    return (
      roomPlayer?.name.trim() ||
      player.name.trim() ||
      "等待玩家入座"
    );
  };
  const getTableName = (player: Player) => {
    const roomPlayer = roomPlayersBySeat.get(player.seat);
    return roomPlayer?.name.trim() || player.name.trim() || "待入座";
  };
  const currentStageLabel = getGameStageLabel(state.phase, state.round);
  const nextStage = getNextGameStage(state.phase, state.round);
  const nextStageLabel = getGameStageLabel(nextStage.phase, nextStage.round);
  const StageIcon =
    state.phase === "白天"
      ? Sun
      : state.phase === "夜晚"
        ? MoonStar
        : Sparkles;

  return (
    <div className="dashboard-grid">
      <aside className="side-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SESSION</p>
            <h2>局面总览</h2>
          </div>
          <Sparkles size={19} className="muted-icon" />
        </div>
        <div className="stat-grid">
          <div className="stat-cell">
            <span>玩家</span>
            <strong>{state.players.length}</strong>
          </div>
          <div className="stat-cell">
            <span>存活</span>
            <strong>{aliveCount}</strong>
          </div>
          <div className="stat-cell">
            <span>阶段</span>
            <strong className="stage-stat">{currentStageLabel}</strong>
          </div>
        </div>
        {roomPanel}
        <label className="notes-field">
          <span><NotebookPen size={15} /> 主持人备注</span>
          <textarea
            value={state.storytellerNotes}
            onChange={(event) => onUpdate({ storytellerNotes: event.target.value })}
            placeholder="记下公开信息、玩家发言或下一步计划…"
            rows={7}
          />
        </label>
        <div className="privacy-note">
          <span className="status-dot" />
          自动保存在本机浏览器
        </div>
      </aside>

      <section className="main-panel">
        <div className="panel-heading players-heading">
          <div className="heading-actions">
            {state.players.length === 0 ? (
              <button className="secondary-button" onClick={onQuickStart}>
                <Sparkles size={15} />
                载入示例局
              </button>
            ) : null}
            {state.players.length > 0 ? (
              <button
                className="secondary-button assign-roles-button"
                onClick={onAssignRoles}
                title="按当前人数随机分配不重复角色"
              >
                <Dices size={16} />
                一键分配
              </button>
            ) : null}
            {state.players.length > 0 ? (
              <button
                className="secondary-button stage-advance-button"
                onClick={() => onUpdate({ ...nextStage, nightIndex: 0 })}
                title={`切换到${nextStageLabel}`}
              >
                <span className={`stage-advance-icon phase-${state.phase}`}>
                  <StageIcon size={15} />
                </span>
                <span className="stage-advance-copy">
                  <small>当前回合</small>
                  <b>{currentStageLabel}</b>
                </span>
                <ChevronRight size={14} />
              </button>
            ) : null}
            {state.players.length > 0 ? (
              <button
                className="secondary-button"
                onClick={() => {
                  const lastPlayer = state.players[state.players.length - 1];
                  if (
                    window.confirm(
                      `移除最后一个座位（座位 ${lastPlayer.seat}）？`,
                    )
                  ) {
                    onRemovePlayer(lastPlayer.id);
                  }
                }}
              >
                <UserMinus size={16} />
                减少玩家
              </button>
            ) : null}
            <button className="primary-button" onClick={onAddPlayer}>
              <Plus size={16} />
              添加玩家
            </button>
          </div>
        </div>
        {state.players.length === 0 ? (
          <div className="empty-state">
            <div className="empty-glyph"><Users size={30} /></div>
            <h3>魔典还没有玩家</h3>
            <p>先添加今晚的座位，或载入一局 7 人示例开始熟悉操作。</p>
            <div className="empty-actions">
              <button className="primary-button" onClick={onAddPlayer}><Plus size={16} />添加第一个玩家</button>
              <button className="secondary-button" onClick={onQuickStart}><Sparkles size={15} />载入示例局</button>
            </div>
          </div>
        ) : (
          <div
            className={[
              "grimoire-workbench",
              state.players.length >= 9 ? "mobile-grid" : "",
              state.players.length > 10 ? "large" : "",
              state.players.length > 15 ? "crowded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="table-stage">
              <div className="grimoire-table">
                <div className="table-center" aria-hidden="true">
                  <span>{currentStageLabel}</span>
                  <strong>
                    {aliveCount}
                    <small> / {state.players.length}</small>
                  </strong>
                </div>
                {state.players.map((player, index) => {
                  const role = getRole(player.roleId);
                  const roomPlayer = roomPlayersBySeat.get(player.seat);
                  const angle =
                    (index / state.players.length) * Math.PI * 2 - Math.PI / 2;
                  const radius = state.players.length > 15 ? 42 : 40;
                  const left = 50 + Math.cos(angle) * radius;
                  const top = 50 + Math.sin(angle) * radius;
                  const isSelected = selectedPlayer?.id === player.id;

                  return (
                    <button
                      className={[
                        "table-seat",
                        teamLabels[role.team],
                        player.alive ? "" : "dead",
                        isSelected ? "selected" : "",
                        state.players.length > 10 ? "dense" : "",
                        state.players.length > 15 ? "very-dense" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      key={player.id}
                      onClick={() => setSelectedPlayerId(player.id)}
                      aria-label={`座位 ${player.seat}，${getDisplayName(player)}，${role.name}，${player.alive ? "存活" : "死亡"}`}
                      aria-pressed={isSelected}
                    >
                      <span className="table-seat-number">
                        {String(player.seat).padStart(2, "0")}
                      </span>
                      <span className="table-role-icon">
                        <RoleIcon
                          roleId={role.id}
                          size={state.players.length > 10 ? 18 : 22}
                        />
                      </span>
                      <span className="table-player-name">{getTableName(player)}</span>
                      <span className="table-role-name">{role.name}</span>
                      {roomPlayer?.is_claimed ? (
                        <span className="table-claimed-dot" title="玩家已入座" />
                      ) : null}
                      {!player.alive ? (
                        <span className="table-dead-mark" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlayer ? (
              <PlayerEditor
                key={selectedPlayer.id}
                player={selectedPlayer}
                displayName={getDisplayName(selectedPlayer)}
                stageLabel={currentStageLabel}
                messages={nightMessages.filter(
                  (message) => message.player_id === selectedPlayer.id,
                )}
                onUpdate={onUpdatePlayer}
                onRemove={onRemovePlayer}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function PlayerEditor({
  player,
  displayName,
  stageLabel,
  messages,
  onUpdate,
  onRemove,
}: {
  player: Player;
  displayName: string;
  stageLabel: string;
  messages: NightMessage[];
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
}) {
  const role = getRole(player.roleId);
  const [noteDraft, setNoteDraft] = useState("");
  const noteEntries = parsePlayerNotes(player.notes);
  const messageHistory = [...messages].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
  const addNote = () => {
    const body = noteDraft.trim();
    if (!body) return;
    onUpdate(player.id, {
      notes: serializePlayerNotes([
        {
          id: makeId(),
          body,
          createdAt: new Date().toISOString(),
          stage: stageLabel,
        },
        ...noteEntries,
      ]),
    });
    setNoteDraft("");
  };
  const updateNote = (noteId: string, body: string) => {
    onUpdate(player.id, {
      notes: serializePlayerNotes(
        noteEntries.map((note) =>
          note.id === noteId ? { ...note, body } : note,
        ),
      ),
    });
  };
  const removeNote = (noteId: string) => {
    onUpdate(player.id, {
      notes: serializePlayerNotes(
        noteEntries.filter((note) => note.id !== noteId),
      ),
    });
  };
  const toggleNoteResolved = (noteId: string) => {
    onUpdate(player.id, {
      notes: serializePlayerNotes(
        noteEntries.map((note) =>
          note.id === noteId ? { ...note, resolved: !note.resolved } : note,
        ),
      ),
    });
  };
  return (
    <aside className={player.alive ? "player-editor" : "player-editor dead"}>
      <div className="player-editor-topline">
        <div>
          <p className="eyebrow">
            SEAT {String(player.seat).padStart(2, "0")}
          </p>
          <h3>{displayName}</h3>
        </div>
        <button
          className={player.alive ? "life-toggle alive" : "life-toggle"}
          onClick={() => onUpdate(player.id, { alive: !player.alive })}
          title={player.alive ? "标记为死亡" : "标记为存活"}
        >
          {player.alive ? <Check size={13} /> : <Skull size={13} />}
          {player.alive ? "存活" : "死亡"}
        </button>
      </div>

      <label className="role-select-field">
        <span>角色身份</span>
        <select
          value={player.roleId}
          onChange={(event) => onUpdate(player.id, { roleId: event.target.value })}
          aria-label={`座位 ${player.seat} 角色`}
        >
          {roles.map((option) => (
            <option value={option.id} key={option.id}>
              {option.name} · {option.team}
            </option>
          ))}
        </select>
      </label>

      <div className={`selected-role-summary ${teamLabels[role.team]}`}>
        <span className="selected-role-icon">
          <RoleIcon roleId={role.id} size={20} />
        </span>
        <div>
          <strong>{role.name}</strong>
          <small>{role.team}</small>
          <p>{role.short}</p>
        </div>
      </div>

      <section className="player-notes-section">
        <div className="player-notes-heading">
          <span>主持人私密备注 · {stageLabel}</span>
          <strong>{noteEntries.length}</strong>
        </div>
        <div className="player-note-composer">
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                addNote();
              }
            }}
            placeholder="新增一条状态或事件备注…"
            maxLength={500}
            rows={2}
          />
          <div>
            <span>{noteDraft.length}/500</span>
            <button
              className="secondary-button player-note-add"
              onClick={addNote}
              disabled={!noteDraft.trim()}
            >
              <Plus size={14} />
              添加备注
            </button>
          </div>
        </div>
        {noteEntries.length ? (
          <div className="player-note-list">
            {noteEntries.map((note, index) => (
              <article
                className={note.resolved ? "player-note-item resolved" : "player-note-item"}
                key={note.id}
              >
                <div className="player-note-meta">
                  <span className="player-note-stage">
                    {note.stage ?? "阶段未记录"}
                    {note.resolved ? " · 已处理" : ""}
                  </span>
                  {note.createdAt ? (
                    <time>
                      {new Date(note.createdAt).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  ) : (
                    <time>原有备注</time>
                  )}
                  <button
                    className="player-note-resolve"
                    onClick={() => toggleNoteResolved(note.id)}
                    title={note.resolved ? "恢复为有效备注" : "标记为已处理"}
                    aria-label={note.resolved ? "恢复这条备注" : "处理这条备注"}
                  >
                    {note.resolved ? <RotateCcw size={12} /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={() => removeNote(note.id)}
                    title="删除这条备注"
                    aria-label={`删除备注 ${noteEntries.length - index}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <textarea
                  value={note.body}
                  onChange={(event) => updateNote(note.id, event.target.value)}
                  aria-label={`备注 ${noteEntries.length - index}`}
                  rows={1}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="player-note-empty">还没有角色备注</div>
        )}
      </section>

      <section className="player-message-history">
        <div className="player-history-heading">
          <div>
            <span>已传达信息</span>
            <small>发送给此座位的历史记录</small>
          </div>
          <strong>{messageHistory.length}</strong>
        </div>
        {messageHistory.length ? (
          <div className="player-history-list">
            {messageHistory.map((message) => {
              const messageRole = getRole(message.role_id);
              return (
                <article className="player-history-item" key={message.id}>
                  <div>
                    <strong>{getGameStageLabel("夜晚", message.round)}</strong>
                    <span>{messageRole.name}</span>
                    <time>
                      {new Date(message.created_at).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="player-history-empty">
            还没有向该玩家传达过信息
          </div>
        )}
      </section>

      <div className="player-editor-actions">
        <button
          className="remove-player-button"
          onClick={() => {
            if (window.confirm(`移除座位 ${player.seat}？`)) {
              onRemove(player.id);
            }
          }}
          title="移除玩家"
          aria-label={`移除座位 ${player.seat}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}

function NightPanel({
  state,
  nightRoles,
  currentRole,
  room,
  roomPlayers,
  nightMessages,
  playerMessages,
  unreadPlayerMessages,
  onChangeNight,
  onSelectNight,
  onReadPlayerMessages,
  onSendMessage,
}: {
  state: GameState;
  nightRoles: ReturnType<typeof getNightRoles>;
  currentRole: ReturnType<typeof getRole> | null;
  room: SharedRoom | null;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  unreadPlayerMessages: PlayerMessage[];
  onChangeNight: (offset: number) => void;
  onSelectNight: (index: number) => void;
  onReadPlayerMessages: (playerId: string) => void;
  onSendMessage: (message: {
    playerId: string;
    roleId: string;
    body: string;
  }) => Promise<void>;
}) {
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const rolePlayers = useMemo(
    () =>
      currentRole
        ? state.players.filter((player) => player.roleId === currentRole.id)
        : [],
    [currentRole, state.players],
  );
  const roomPlayersById = useMemo(
    () => new Map(roomPlayers.map((player) => [player.id, player])),
    [roomPlayers],
  );

  useEffect(() => {
    if (!rolePlayers.some((player) => player.id === targetPlayerId)) {
      setTargetPlayerId(rolePlayers[0]?.id ?? "");
    }
    setSendError("");
  }, [rolePlayers, targetPlayerId]);

  const selectedPlayer = rolePlayers.find(
    (player) => player.id === targetPlayerId,
  );
  const selectedRoomPlayer = selectedPlayer
    ? roomPlayersById.get(selectedPlayer.id)
    : undefined;
  const selectedPlayerName = selectedPlayer
    ? selectedRoomPlayer?.name ||
      `座位 ${String(selectedPlayer.seat).padStart(2, "0")}`
    : "玩家";
  const conversation = useMemo(
    () =>
      [
        ...nightMessages
          .filter((message) => message.player_id === targetPlayerId)
          .map((message) => ({
            ...message,
            direction: "outgoing" as const,
            label: `上帝 · ${getGameStageLabel("夜晚", message.round)} · ${getRole(message.role_id).name}`,
            avatar: "上",
          })),
        ...playerMessages
          .filter((message) => message.player_id === targetPlayerId)
          .map((message) => ({
            ...message,
            direction: "incoming" as const,
            label: `${selectedPlayerName} · 第 ${message.round} 回合`,
            avatar: selectedPlayer
              ? String(selectedPlayer.seat).padStart(2, "0")
              : "?",
          })),
      ].sort(
        (left, right) =>
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime(),
      ),
    [
      nightMessages,
      playerMessages,
      selectedPlayer,
      selectedPlayerName,
      targetPlayerId,
    ],
  );
  const latestMessageKey = conversation.length
    ? `${targetPlayerId}-${conversation[conversation.length - 1].direction}-${conversation[conversation.length - 1].id}`
    : targetPlayerId;

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (!timelineElement) return;
    const frame = requestAnimationFrame(() => {
      timelineElement.scrollTop = timelineElement.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessageKey]);

  useEffect(() => {
    if (
      targetPlayerId &&
      unreadPlayerMessages.some(
        (message) => message.player_id === targetPlayerId,
      )
    ) {
      onReadPlayerMessages(targetPlayerId);
    }
  }, [onReadPlayerMessages, targetPlayerId, unreadPlayerMessages]);

  const canSend =
    Boolean(room) &&
    Boolean(currentRole) &&
    Boolean(selectedRoomPlayer?.is_claimed) &&
    Boolean(messageBody.trim()) &&
    !sending;

  const submitMessage = async () => {
    if (!currentRole || !selectedPlayer || !canSend) return;
    setSending(true);
    setSendError("");
    try {
      await onSendMessage({
        playerId: selectedPlayer.id,
        roleId: currentRole.id,
        body: messageBody.trim(),
      });
      setMessageBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /claimed player/i.test(message)
          ? "该玩家尚未入座，暂时无法接收信息"
          : /function|night_messages|schema cache/i.test(message)
            ? "夜间消息数据库尚未配置"
            : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="night-layout">
      <section className="night-main">
        <section className="night-action-section">
          <div className="panel-heading night-action-heading">
            <div>
              <p className="eyebrow">NIGHT ORDER · {getGameStageLabel(state.phase, state.round)}</p>
              <h2>行动角色列表</h2>
            </div>
            <div className="night-nav">
              <button className="icon-button" onClick={() => onChangeNight(-1)} disabled={!nightRoles.length} title="上一个行动"><ChevronLeft size={17} /></button>
              <button className="icon-button" onClick={() => onChangeNight(1)} disabled={!nightRoles.length} title="下一个行动"><ChevronRight size={17} /></button>
            </div>
          </div>
          {currentRole ? (
            <div className="night-list">
              {nightRoles.map((role, index) => (
                <button
                  className={state.nightIndex === index ? "night-row active" : "night-row"}
                  key={`${role.id}-${index}`}
                  onClick={() => onSelectNight(index)}
                >
                  <span className="night-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`mini-role-icon ${teamLabels[role.team]}`}>
                    <RoleIcon roleId={role.id} size={16} />
                  </span>
                  <span className="night-role-name">{role.name}</span>
                  <span className="night-role-team">{role.team}</span>
                  {state.nightIndex === index ? <span className="on-air">进行中</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <div className="empty-glyph"><MoonStar size={26} /></div>
              <h3>还没有可执行的夜晚行动</h3>
              <p>在魔典里添加玩家并分配角色，夜晚顺序会自动生成。</p>
            </div>
          )}
        </section>
        {currentRole ? (
          <section className="night-message-chat">
            <div className="night-message-chat-header">
              <div className="night-message-heading">
                <MessageSquareText size={20} />
                <div>
                  <p className="eyebrow">PRIVATE NIGHT MESSAGE</p>
                  <h3>发送夜间信息</h3>
                </div>
              </div>
              <label className="night-chat-recipient">
                <span>对话玩家</span>
                <select
                  value={targetPlayerId}
                  onChange={(event) => setTargetPlayerId(event.target.value)}
                  disabled={!rolePlayers.length || sending}
                >
                  {rolePlayers.map((player) => {
                    const roomPlayer = roomPlayersById.get(player.id);
                    return (
                      <option key={player.id} value={player.id}>
                        座位 {String(player.seat).padStart(2, "0")}
                        {roomPlayer?.name ? ` · ${roomPlayer.name}` : ""}
                        {roomPlayer?.is_claimed ? "" : " · 未入座"}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            {conversation.length ? (
              <div className="night-chat-timeline" ref={timelineRef}>
                {conversation.map((message) => (
                  <article
                    className={`host-chat-message ${message.direction}`}
                    key={`${message.direction}-${message.id}`}
                  >
                    <span className="host-chat-avatar" aria-hidden="true">
                      {message.avatar}
                    </span>
                    <div className="host-chat-message-content">
                      <div className="host-chat-message-meta">
                        <span>{message.label}</span>
                        <time>
                          {new Date(message.created_at).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <div className="host-chat-bubble">
                        <p>{message.body}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="night-chat-empty">
                <MessageSquareText size={24} />
                <strong>暂无聊天记录</strong>
                <span>你和该玩家发送的信息会显示在这里</span>
              </div>
            )}

            <div className="night-chat-composer">
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitMessage();
                  }
                }}
                placeholder={
                  selectedRoomPlayer?.is_claimed
                    ? `发送信息给${selectedPlayerName}`
                    : "该玩家入座后即可发送"
                }
                maxLength={500}
                rows={2}
                disabled={!selectedRoomPlayer?.is_claimed || sending}
              />
              <div className="night-chat-composer-footer">
                <span>
                  {!room
                    ? "请先在魔典页创建共享房间"
                    : !selectedRoomPlayer?.is_claimed
                      ? "该座位入座后才可接收"
                      : `${messageBody.length}/500`}
                </span>
                <button
                  className="primary-button night-send-button"
                  disabled={!canSend}
                  onClick={() => void submitMessage()}
                >
                  <Send size={15} />
                  {sending ? "发送中" : "发送"}
                </button>
              </div>
              {sendError ? <div className="inline-error">{sendError}</div> : null}
            </div>
          </section>
        ) : null}
        {currentRole ? (
          <div className={`current-action ${teamLabels[currentRole.team]}`}>
            <div className="current-role-icon">
              <RoleIcon roleId={currentRole.id} size={29} />
            </div>
            <div>
              <p className="eyebrow">当前角色</p>
              <h3>{currentRole.name}</h3>
              <p>{currentRole.reminder}</p>
            </div>
            <div className="current-role-team">{currentRole.team}</div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function HostMessagesPanel({
  state,
  room,
  roomPlayers,
  nightMessages,
  playerMessages,
  evilMessages,
  unreadPlayerMessages,
  unreadEvilMessages,
  onReadPlayerMessages,
  onReadEvilMessages,
  onSendMessage,
  onSendEvilMessage,
}: {
  state: GameState;
  room: SharedRoom | null;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  evilMessages: EvilMessage[];
  unreadPlayerMessages: PlayerMessage[];
  unreadEvilMessages: EvilMessage[];
  onReadPlayerMessages: (playerId: string) => void;
  onReadEvilMessages: () => void;
  onSendMessage: (message: {
    playerId: string;
    roleId: string;
    body: string;
  }) => Promise<void>;
  onSendEvilMessage: (body: string) => Promise<void>;
}) {
  const evilConversationId = "evil-team";
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingBluffs, setSendingBluffs] = useState(false);
  const [sendError, setSendError] = useState("");
  const [demonBluffRoleIds, setDemonBluffRoleIds] = useState<string[]>([]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const roomPlayersById = useMemo(
    () => new Map(roomPlayers.map((player) => [player.id, player])),
    [roomPlayers],
  );
  const availablePlayers = useMemo(
    () =>
      [...state.players]
        .sort((left, right) => left.seat - right.seat)
        .map((player) => ({
          player,
          roomPlayer: roomPlayersById.get(player.id),
        })),
    [roomPlayersById, state.players],
  );
  const evilPlayers = useMemo(
    () =>
      availablePlayers.filter(({ player }) => {
        const team = getRole(player.roleId).team;
        return team === "爪牙" || team === "恶魔";
      }),
    [availablePlayers],
  );
  const evilChatAvailable =
    state.phase !== "准备" && evilPlayers.length > 0;
  const availableDemonBluffRoles = useMemo(() => {
    const assignedRoleIds = new Set(
      state.players.map((player) => player.roleId),
    );
    return roles.filter(
      (role) =>
        (role.team === "镇民" || role.team === "外来者") &&
        !assignedRoleIds.has(role.id),
    );
  }, [state.players]);
  const assignedRoleSignature = useMemo(
    () =>
      [...state.players]
        .sort((left, right) => left.seat - right.seat)
        .map((player) => `${player.seat}:${player.roleId}`)
        .join("|"),
    [state.players],
  );
  const demonBluffStorageKey = room
    ? `xueran-demon-bluffs-${room.id}`
    : "";
  const isEvilConversation =
    evilChatAvailable && selectedConversationId === evilConversationId;
  const selectedPlayerId = isEvilConversation ? "" : selectedConversationId;

  const chooseRandomBluffs = useCallback(
    (excludedSignature = "") => {
      const shuffled = [...availableDemonBluffRoles].sort(
        () => Math.random() - 0.5,
      );
      let nextRoleIds = shuffled.slice(0, 3).map((role) => role.id);
      if (
        availableDemonBluffRoles.length > 3 &&
        getDemonBluffSignature(nextRoleIds) === excludedSignature
      ) {
        nextRoleIds = [
          ...nextRoleIds.slice(0, 2),
          shuffled.find((role) => !nextRoleIds.includes(role.id))!.id,
        ];
      }
      return nextRoleIds;
    },
    [availableDemonBluffRoles],
  );

  const persistDemonBluffs = useCallback(
    (roleIds: string[]) => {
      setDemonBluffRoleIds(roleIds);
      if (!demonBluffStorageKey) return;
      localStorage.setItem(
        demonBluffStorageKey,
        JSON.stringify({
          assignedRoleSignature,
          roleIds,
        }),
      );
    },
    [assignedRoleSignature, demonBluffStorageKey],
  );

  useEffect(() => {
    if (
      !evilChatAvailable ||
      !demonBluffStorageKey ||
      availableDemonBluffRoles.length < 3
    ) {
      setDemonBluffRoleIds([]);
      return;
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(demonBluffStorageKey) ?? "null",
      ) as {
        assignedRoleSignature?: string;
        roleIds?: unknown;
      } | null;
      const savedRoleIds = Array.isArray(saved?.roleIds)
        ? saved.roleIds.filter(
            (roleId): roleId is string => typeof roleId === "string",
          )
        : [];
      const availableRoleIds = new Set(
        availableDemonBluffRoles.map((role) => role.id),
      );
      if (
        saved?.assignedRoleSignature === assignedRoleSignature &&
        savedRoleIds.length === 3 &&
        new Set(savedRoleIds).size === 3 &&
        savedRoleIds.every((roleId) => availableRoleIds.has(roleId))
      ) {
        setDemonBluffRoleIds(savedRoleIds);
        return;
      }
    } catch {
      // Invalid local drafts are replaced below.
    }

    persistDemonBluffs(chooseRandomBluffs());
  }, [
    assignedRoleSignature,
    availableDemonBluffRoles,
    chooseRandomBluffs,
    demonBluffStorageKey,
    evilChatAvailable,
    persistDemonBluffs,
  ]);

  useEffect(() => {
    if (
      (selectedConversationId === evilConversationId && evilChatAvailable) ||
      availablePlayers.some(
        ({ player }) => player.id === selectedConversationId,
      )
    ) {
      return;
    }
    const latestMessage = [
      ...unreadPlayerMessages,
      ...nightMessages,
      ...playerMessages,
    ].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )[0];
    const firstClaimed = availablePlayers.find(
      ({ roomPlayer }) => roomPlayer?.is_claimed,
    );
    const latestAvailablePlayer = latestMessage
      ? availablePlayers.find(
          ({ player }) => player.id === latestMessage.player_id,
        )
      : undefined;
    setSelectedConversationId(
      evilChatAvailable && unreadEvilMessages.length
        ? evilConversationId
        : latestAvailablePlayer?.player.id ??
            firstClaimed?.player.id ??
            availablePlayers[0]?.player.id ??
            (evilChatAvailable ? evilConversationId : ""),
    );
  }, [
    availablePlayers,
    evilChatAvailable,
    nightMessages,
    playerMessages,
    selectedConversationId,
    unreadEvilMessages.length,
    unreadPlayerMessages,
  ]);

  const latestByPlayer = useMemo(() => {
    const latest = new Map<
      string,
      { body: string; createdAt: string; direction: "incoming" | "outgoing" }
    >();
    [...nightMessages.map((message) => ({ ...message, direction: "outgoing" as const })),
      ...playerMessages.map((message) => ({ ...message, direction: "incoming" as const }))]
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      )
      .forEach((message) => {
        if (!latest.has(message.player_id)) {
          latest.set(message.player_id, {
            body: message.body,
            createdAt: message.created_at,
            direction: message.direction,
          });
        }
      });
    return latest;
  }, [nightMessages, playerMessages]);

  const incomingCountByPlayer = useMemo(() => {
    const counts = new Map<string, number>();
    unreadPlayerMessages.forEach((message) => {
      counts.set(message.player_id, (counts.get(message.player_id) ?? 0) + 1);
    });
    return counts;
  }, [unreadPlayerMessages]);

  const conversationPlayers = useMemo(
    () =>
      [...availablePlayers].sort((left, right) => {
        const leftLatest = latestByPlayer.get(left.player.id);
        const rightLatest = latestByPlayer.get(right.player.id);
        if (leftLatest && rightLatest) {
          return (
            new Date(rightLatest.createdAt).getTime() -
            new Date(leftLatest.createdAt).getTime()
          );
        }
        if (leftLatest) return -1;
        if (rightLatest) return 1;
        if (
          Boolean(left.roomPlayer?.is_claimed) !==
          Boolean(right.roomPlayer?.is_claimed)
        ) {
          return left.roomPlayer?.is_claimed ? -1 : 1;
        }
        return left.player.seat - right.player.seat;
      }),
    [availablePlayers, latestByPlayer],
  );

  const selectedEntry = availablePlayers.find(
    ({ player }) => player.id === selectedPlayerId,
  );
  const selectedPlayer = selectedEntry?.player;
  const selectedRoomPlayer = selectedEntry?.roomPlayer;
  const selectedRole = selectedPlayer ? getRole(selectedPlayer.roleId) : null;
  const selectedSenderName =
    selectedRoomPlayer?.name ||
    (selectedPlayer
      ? `座位 ${String(selectedPlayer.seat).padStart(2, "0")}`
      : "玩家");
  const playerTimeline = [
    ...nightMessages
      .filter((message) => message.player_id === selectedPlayerId)
      .map((message) => ({
        ...message,
        direction: "outgoing" as const,
        label: `上帝 · ${getGameStageLabel("夜晚", message.round)} · ${getRole(message.role_id).name}`,
        avatar: "上",
        demonBluffRoleIds: null,
      })),
    ...playerMessages
      .filter((message) => message.player_id === selectedPlayerId)
      .map((message) => ({
        ...message,
        direction: "incoming" as const,
        label: `${selectedSenderName} · 第 ${message.round} 回合`,
        avatar: selectedPlayer
          ? String(selectedPlayer.seat).padStart(2, "0")
          : "?",
        demonBluffRoleIds: null,
      })),
  ];
  const evilTimeline = evilMessages.map((message) => {
    const sender = message.sender_player_id
      ? roomPlayersById.get(message.sender_player_id)
      : null;
    return {
      ...message,
      direction:
        message.sender_kind === "host"
          ? ("outgoing" as const)
          : ("incoming" as const),
      label:
        message.sender_kind === "host"
          ? `上帝 · 第 ${message.round} 回合`
          : `${sender?.name || `座位 ${String(sender?.seat ?? "?").padStart(2, "0")}`} · 第 ${message.round} 回合`,
      avatar:
        message.sender_kind === "host"
          ? "上"
          : String(sender?.seat ?? "?").padStart(2, "0"),
      demonBluffRoleIds:
        message.sender_kind === "host"
          ? parseDemonBluffMessage(message.body)
          : null,
    };
  });
  const timeline = (isEvilConversation ? evilTimeline : playerTimeline).sort(
    (left, right) =>
      new Date(left.created_at).getTime() -
      new Date(right.created_at).getTime(),
  );
  const latestMessageKey = timeline.length
    ? `${selectedConversationId}-${timeline[timeline.length - 1].direction}-${timeline[timeline.length - 1].id}`
    : selectedConversationId;

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (!timelineElement) return;
    const frame = requestAnimationFrame(() => {
      timelineElement.scrollTop = timelineElement.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessageKey]);

  useEffect(() => {
    if (
      !isEvilConversation &&
      selectedPlayerId &&
      unreadPlayerMessages.some(
        (message) => message.player_id === selectedPlayerId,
      )
    ) {
      onReadPlayerMessages(selectedPlayerId);
    }
  }, [
    isEvilConversation,
    onReadPlayerMessages,
    selectedPlayerId,
    unreadPlayerMessages,
  ]);

  useEffect(() => {
    if (isEvilConversation && unreadEvilMessages.length) {
      onReadEvilMessages();
    }
  }, [isEvilConversation, onReadEvilMessages, unreadEvilMessages.length]);

  const canSend =
    Boolean(room) &&
    (isEvilConversation
      ? evilChatAvailable
      : Boolean(selectedPlayer) && Boolean(selectedRoomPlayer?.is_claimed)) &&
    Boolean(messageBody.trim()) &&
    !sending;

  const submitMessage = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError("");
    try {
      if (isEvilConversation) {
        await onSendEvilMessage(messageBody.trim());
      } else if (selectedPlayer) {
        await onSendMessage({
          playerId: selectedPlayer.id,
          roleId: selectedPlayer.roleId,
          body: messageBody.trim(),
        });
      }
      setMessageBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /game has not started/i.test(message)
          ? "游戏正式开始后才能使用邪恶阵营群聊"
          : /evil player access/i.test(message)
            ? "当前身份无权进入邪恶阵营群聊"
            : /claimed player/i.test(message)
          ? "该玩家尚未入座，暂时无法接收信息"
          : /function|night_messages|evil_messages|schema cache/i.test(message)
            ? "消息数据库尚未配置"
            : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  const sentDemonBluffSignatures = useMemo(
    () =>
      new Set(
        evilMessages
          .filter((message) => message.sender_kind === "host")
          .map((message) => parseDemonBluffMessage(message.body))
          .filter((roleIds): roleIds is string[] => Boolean(roleIds))
          .map(getDemonBluffSignature),
      ),
    [evilMessages],
  );
  const currentDemonBluffSignature =
    demonBluffRoleIds.length === 3
      ? getDemonBluffSignature(demonBluffRoleIds)
      : "";
  const demonBluffsAlreadySent =
    Boolean(currentDemonBluffSignature) &&
    sentDemonBluffSignatures.has(currentDemonBluffSignature);

  const replaceDemonBluff = (index: number, nextRoleId?: string) => {
    const otherRoleIds = demonBluffRoleIds.filter(
      (_, roleIndex) => roleIndex !== index,
    );
    const candidates = availableDemonBluffRoles.filter(
      (role) =>
        !otherRoleIds.includes(role.id) &&
        (nextRoleId || role.id !== demonBluffRoleIds[index]),
    );
    const replacement =
      nextRoleId ??
      candidates[Math.floor(Math.random() * candidates.length)]?.id;
    if (!replacement || otherRoleIds.includes(replacement)) return;
    persistDemonBluffs(
      demonBluffRoleIds.map((roleId, roleIndex) =>
        roleIndex === index ? replacement : roleId,
      ),
    );
  };

  const sendDemonBluffs = async () => {
    if (
      demonBluffRoleIds.length !== 3 ||
      demonBluffsAlreadySent ||
      sendingBluffs
    ) {
      return;
    }
    setSendingBluffs(true);
    setSendError("");
    try {
      await onSendEvilMessage(buildDemonBluffMessage(demonBluffRoleIds));
    } catch {
      setSendError("伪装身份发送失败，请稍后重试");
    } finally {
      setSendingBluffs(false);
    }
  };

  if (!room) {
    return (
      <section className="host-messages-empty">
        <div className="empty-glyph">
          <MessageSquareText size={26} />
        </div>
        <h2>请先创建共享房间</h2>
        <p>创建房间并让玩家入座后，可以在这里集中查看和回复所有私密消息。</p>
      </section>
    );
  }

  return (
    <section className="host-messages-page">
      <aside className="host-conversation-list">
        <div className="host-conversation-heading">
          <div>
            <p className="eyebrow">PLAYER CHAT</p>
            <h2>玩家消息</h2>
          </div>
          <strong>
            {unreadPlayerMessages.length + unreadEvilMessages.length}
          </strong>
        </div>
        <div className="host-player-tabs">
          {evilChatAvailable ? (
            <button
              className={
                isEvilConversation ? "active host-evil-chat-tab" : "host-evil-chat-tab"
              }
              onClick={() => {
                setSelectedConversationId(evilConversationId);
                setMessageBody("");
                setSendError("");
              }}
            >
              <span className="host-group-icon">
                <Skull size={16} />
              </span>
              <span className="host-player-summary">
                <strong>邪恶阵营群聊</strong>
                <small>
                  {evilMessages[0]
                    ? `${evilMessages[0].sender_kind === "host" ? "我" : roomPlayersById.get(evilMessages[0].sender_player_id ?? "")?.name || "邪恶玩家"}：${
                        evilMessages[0].sender_kind === "host"
                          ? getDemonBluffPreview(evilMessages[0].body)
                          : evilMessages[0].body
                      }`
                    : `上帝与 ${evilPlayers.length} 名邪恶玩家`}
                </small>
              </span>
              {unreadEvilMessages.length ? (
                <span className="host-player-count">
                  {unreadEvilMessages.length}
                </span>
              ) : (
                <span className="host-player-status evil-online" />
              )}
            </button>
          ) : null}
          {conversationPlayers.map(({ player, roomPlayer }) => {
            const latest = latestByPlayer.get(player.id);
            const incomingCount = incomingCountByPlayer.get(player.id) ?? 0;
            const playerLabel =
              roomPlayer?.name ||
              (latest
                ? `座位 ${String(player.seat).padStart(2, "0")}`
                : "等待玩家入座");
            return (
              <button
                className={player.id === selectedPlayerId ? "active" : ""}
                key={player.id}
                onClick={() => {
                  setSelectedConversationId(player.id);
                  setMessageBody("");
                  setSendError("");
                }}
              >
                <span className="host-player-seat">
                  {String(player.seat).padStart(2, "0")}
                </span>
                <span className="host-player-summary">
                  <strong>{playerLabel}</strong>
                  <small>
                    {latest
                      ? `${latest.direction === "outgoing" ? "我：" : ""}${latest.body}`
                      : `${getRole(player.roleId).name} · 暂无消息`}
                  </small>
                </span>
                {incomingCount ? (
                  <span className="host-player-count">{incomingCount}</span>
                ) : (
                  <span
                    className={
                      roomPlayer?.is_claimed
                        ? "host-player-status online"
                        : "host-player-status"
                    }
                    title={roomPlayer?.is_claimed ? "已入座" : "未入座"}
                  />
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="host-chat-panel">
        {isEvilConversation || (selectedPlayer && selectedRole) ? (
          <>
            <header className="host-chat-header">
              {isEvilConversation ? (
                <>
                  <div className="host-chat-role evil-group">
                    <Skull size={23} />
                  </div>
                  <div>
                    <h3>邪恶阵营群聊</h3>
                    <p>上帝 · {evilPlayers.length} 名爪牙/恶魔 · 第 {state.round} 回合</p>
                  </div>
                </>
              ) : selectedPlayer && selectedRole ? (
                <>
                  <div className={`host-chat-role ${teamLabels[selectedRole.team]}`}>
                    <RoleIcon roleId={selectedRole.id} size={24} />
                  </div>
                  <div>
                    <h3>{selectedRoomPlayer?.name || `座位 ${selectedPlayer.seat}`}</h3>
                    <p>
                      座位 {String(selectedPlayer.seat).padStart(2, "0")} ·{" "}
                      {selectedRole.name} ·{" "}
                      {selectedRoomPlayer?.is_claimed ? "已入座" : "未入座"}
                    </p>
                  </div>
                </>
              ) : null}
            </header>

            {isEvilConversation && demonBluffRoleIds.length === 3 ? (
              <section className="demon-bluff-draft">
                <div className="demon-bluff-draft-heading">
                  <div>
                    <strong>恶魔伪装身份</strong>
                    <small>发送前仅上帝可见</small>
                  </div>
                  <button
                    className="icon-button"
                    title="整组重选"
                    aria-label="整组重选伪装身份"
                    onClick={() =>
                      persistDemonBluffs(
                        chooseRandomBluffs(currentDemonBluffSignature),
                      )
                    }
                  >
                    <Dices size={16} />
                  </button>
                </div>
                <div className="demon-bluff-draft-roles">
                  {demonBluffRoleIds.map((roleId, index) => {
                    const role = getRole(roleId);
                    return (
                      <div
                        className="demon-bluff-draft-role"
                        key={`${index}-${roleId}`}
                      >
                        <span className="demon-bluff-draft-icon">
                          <RoleIcon roleId={roleId} size={20} />
                        </span>
                        <select
                          value={roleId}
                          aria-label={`第 ${index + 1} 个伪装身份`}
                          onChange={(event) =>
                            replaceDemonBluff(index, event.target.value)
                          }
                        >
                          {availableDemonBluffRoles.map((option) => (
                            <option
                              value={option.id}
                              key={option.id}
                              disabled={
                                option.id !== roleId &&
                                demonBluffRoleIds.includes(option.id)
                              }
                            >
                              {option.name} · {option.team}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-button"
                          title="更换这个身份"
                          aria-label={`更换${role.name}`}
                          onClick={() => replaceDemonBluff(index)}
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  className="primary-button demon-bluff-send"
                  disabled={demonBluffsAlreadySent || sendingBluffs}
                  onClick={() => void sendDemonBluffs()}
                >
                  {demonBluffsAlreadySent ? (
                    <Check size={15} />
                  ) : (
                    <Send size={15} />
                  )}
                  {demonBluffsAlreadySent
                    ? "本组已发送"
                    : sendingBluffs
                      ? "发送中"
                      : "发送这三个身份"}
                </button>
              </section>
            ) : null}

            {timeline.length ? (
              <div className="host-chat-timeline" ref={timelineRef}>
                {timeline.map((message) => (
                  <article
                    className={`host-chat-message ${message.direction}`}
                    key={`${message.direction}-${message.id}`}
                  >
                    <span className="host-chat-avatar" aria-hidden="true">
                      {message.avatar}
                    </span>
                    <div className="host-chat-message-content">
                      <div className="host-chat-message-meta">
                        <span>{message.label}</span>
                        <time>
                          {new Date(message.created_at).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <div className="host-chat-bubble">
                        {message.demonBluffRoleIds ? (
                          <DemonBluffMessage
                            roleIds={message.demonBluffRoleIds}
                          />
                        ) : (
                          <p>{message.body}</p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="host-chat-no-messages">
                <MessageSquareText size={24} />
                <h3>暂无聊天记录</h3>
                <p>
                  {isEvilConversation
                    ? "爪牙、恶魔和上帝发送的信息会显示在这里。"
                    : "玩家来信和你发送的信息会按时间显示在这里。"}
                </p>
              </div>
            )}

            <div className="host-chat-composer">
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitMessage();
                  }
                }}
                placeholder={
                  isEvilConversation
                    ? "发送到邪恶阵营群聊"
                    : selectedRoomPlayer?.is_claimed
                    ? "回复该玩家"
                    : "该玩家入座后即可发送"
                }
                maxLength={500}
                rows={2}
                disabled={
                  (!isEvilConversation && !selectedRoomPlayer?.is_claimed) ||
                  sending
                }
              />
              <div className="host-chat-composer-footer">
                <span>{messageBody.length}/500</span>
                <button
                  className="primary-button"
                  disabled={!canSend}
                  onClick={() => void submitMessage()}
                >
                  <Send size={14} />
                  {sending ? "发送中" : "发送"}
                </button>
              </div>
              {sendError ? <div className="inline-error">{sendError}</div> : null}
            </div>
          </>
        ) : (
          <div className="host-chat-no-messages">
            <Users size={25} />
            <h3>暂无座位</h3>
            <p>先在魔典中添加玩家座位。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ScriptPanel({
  scriptId,
  roleFilter,
  onSelectScript,
  onFilter,
}: {
  scriptId: string;
  roleFilter: string;
  onSelectScript: (id: string) => void;
  onFilter: (value: string) => void;
}) {
  const filteredRoles = roles.filter((role) => {
    const query = roleFilter.trim().toLowerCase();
    return !query || `${role.name}${role.team}${role.short}`.toLowerCase().includes(query);
  });
  return (
    <div className="script-layout">
      <section className="script-main">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SCRIPT LIBRARY</p>
            <h2>选择今晚的剧本</h2>
          </div>
        </div>
        <div className="script-cards">
          {scripts.map((script) => (
            <button
              className={script.id === scriptId ? "script-card selected" : "script-card"}
              key={script.id}
              onClick={() => onSelectScript(script.id)}
            >
              <div className="script-card-top">
                <span className="script-icon"><ScrollText size={21} /></span>
                {script.id === scriptId ? <span className="selected-mark"><Check size={13} /></span> : null}
              </div>
              <strong>{script.name}</strong>
              <span>{script.subtitle}</span>
              <small>{script.description}</small>
            </button>
          ))}
        </div>
        <div className="role-library-heading">
          <div>
            <p className="eyebrow">ROLE LIBRARY</p>
            <h3>角色速查</h3>
          </div>
          <input value={roleFilter} onChange={(event) => onFilter(event.target.value)} placeholder="搜索角色…" aria-label="搜索角色" />
        </div>
        <div className="role-table">
          {filteredRoles.map((role) => (
            <div className="role-row" key={role.id}>
              <span className={`mini-role-icon ${teamLabels[role.team]}`}>
                <RoleIcon roleId={role.id} size={16} />
              </span>
              <strong>{role.name}</strong>
              <span className={`team-label ${teamLabels[role.team]}`}>{role.team}</span>
              <p>{role.short}</p>
            </div>
          ))}
        </div>
      </section>
      <aside className="script-aside">
        <div className="script-aside-seal">钟</div>
        <p className="eyebrow">ABOUT THIS GRIMOIRE</p>
        <h3>一张桌子，一本魔典。</h3>
        <p>这是主持人自己的操作台。本机自动保存，也可以创建共享房间向玩家安全发送身份。</p>
        <div className="script-aside-points">
          <span><Check size={14} />角色与座位</span>
          <span><Check size={14} />夜晚行动顺序</span>
          <span><Check size={14} />私密主持备注</span>
        </div>
      </aside>
    </div>
  );
}

export default App;
