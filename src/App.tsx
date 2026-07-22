import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  ExternalLink,
  Gamepad2,
  Gavel,
  MessageCircleMore,
  MoonStar,
  MessageSquareText,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  Share2,
  Skull,
  Sparkles,
  Sun,
  Target,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { AdminRooms } from "./AdminRooms";
import { CompactSelect } from "./CompactSelect";
import {
  getNightActions,
  getPlayerVisibleRoleId,
  getRole,
  getScriptRoles,
  scripts,
} from "./data";
import { DemonBluffMessage } from "./DemonBluffMessage";
import {
  buildDemonBluffMessage,
  getDemonBluffSignature,
  parseDemonBluffMessage,
} from "./demonBluffs";
import { HostRoomPanel } from "./HostRoomPanel";
import { HostPrivateChats } from "./HostPrivateChats";
import { PlayerRoom } from "./PlayerRoom";
import {
  loadPlayerSimulationConsole,
  setRoomSimulation,
  simulateDayPrivateMessage,
  simulateNomination,
  simulatePlayerMessage,
  simulateVote,
} from "./player-simulation";
import {
  getPlayerMessageDisplayBody,
  parsePlayerSkillChoiceMessage,
} from "./playerSkillChoices";
import { RoleIcon } from "./RoleIcon";
import { getRoleDetailsUrl } from "./roleDetails";
import { distributeRoles } from "./roleDistribution";
import {
  buildRoleSkillMessage,
  getNightMessageDisplayBody,
  getRoleSkillMessage,
} from "./roleSkillMessages";
import {
  activeRoomStorageKey,
  buildRoomUrl,
  closeRoom,
  closeNomination,
  createRoom,
  findRoomByCode,
  finalizeExecution,
  getRoomDayResolutions,
  getRoomDayPrivateMessages,
  getRoomDayPrivateThreads,
  getRoomNightMessages,
  getRoomNominations,
  getRoomPlayerMessages,
  getRoomPlayers,
  getRoomVotes,
  loadHostRoom,
  resetRoom,
  revokeClaim,
  sendNightMessage,
  syncRoom,
  type DayResolution,
  type DayPrivateMessage,
  type DayPrivateThread,
  type DayVote,
  type NightMessage,
  type Nomination,
  type PlayerMessage,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import {
  buildShareUrl,
  getSharedState,
  loadState,
} from "./storage";
import { formatSeat } from "./seat";
import {
  getDeathTriggeredAbilityNotice,
  getTroubleBrewingSkill,
  ravenkeeperDeathNotice,
  triggeredAbilityNotices,
} from "./troubleBrewingSkills";
import { ensureAnonymousSession, supabase } from "./supabase";
import { HostVotingPanel } from "./VotingPanels";
import type {
  GameState,
  Phase,
  Player,
  RoleDefinition,
  TabId,
  Team,
} from "./types";

const tabs: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "grimoire", label: "魔典", icon: BookOpen },
  { id: "day", label: "白天顺序", icon: Sun },
  { id: "night", label: "夜晚顺序", icon: MoonStar },
  { id: "messages", label: "玩家消息", icon: MessageSquareText },
  { id: "script", label: "剧本角色", icon: ScrollText },
  { id: "simulation", label: "玩家模拟", icon: Gamepad2 },
];

const PlayerSimulationConsole = lazy(loadPlayerSimulationConsole);

type DayWorkspaceView = "private-chats" | "voting";

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

const fortuneTellerRedHerringNoteId =
  "system:fortune-teller-red-herring";
const fortuneTellerRedHerringNoteBody =
  "占卜师宿敌：在占卜师能力中始终被视为恶魔";

const isFortuneTellerRedHerring = (player: Player) =>
  parsePlayerNotes(player.notes).some(
    (note) => note.id === fortuneTellerRedHerringNoteId,
  );

const setFortuneTellerRedHerring = (
  players: Player[],
  playerId: string,
  stageLabel: string,
) =>
  players.map((player) => {
    const notes = parsePlayerNotes(player.notes);
    const existingMarker = notes.find(
      (note) => note.id === fortuneTellerRedHerringNoteId,
    );
    const remainingNotes = notes.filter(
      (note) => note.id !== fortuneTellerRedHerringNoteId,
    );
    if (player.id !== playerId) {
      return {
        ...player,
        notes: serializePlayerNotes(remainingNotes),
      };
    }
    return {
      ...player,
      notes: serializePlayerNotes([
        {
          id: fortuneTellerRedHerringNoteId,
          body: fortuneTellerRedHerringNoteBody,
          createdAt: existingMarker?.createdAt ?? new Date().toISOString(),
          stage: existingMarker?.stage ?? stageLabel,
        },
        ...remainingNotes,
      ]),
    };
  });

const roleStateNotePrefix = "system:role-state:";

const isPlayerRoleStateNote = (note: PlayerNoteEntry, roleId: string) => {
  const roleNoteId = roleStateNotePrefix + roleId;
  return note.id === roleNoteId || note.id.startsWith(`${roleNoteId}:`);
};

const getPlayerRoleStateHistory = (
  player: Player,
  roleId = player.roleId,
) =>
  parsePlayerNotes(player.notes)
    .filter((note) => isPlayerRoleStateNote(note, roleId))
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return leftTime - rightTime;
    });

const getPlayerRoleState = (player: Player, roleId = player.roleId) =>
  getPlayerRoleStateHistory(player, roleId).at(-1) ?? null;

type NightStatusMark = {
  key: string;
  label: string;
  kind: "attacked" | "dead" | "poisoned" | "drunk" | "protected";
};

const nightStatusSeatPattern = /(\d+)\s*号/g;

const extractSeatNumbers = (text: string) =>
  Array.from(text.matchAll(nightStatusSeatPattern), (match) =>
    Number(match[1]),
  ).filter((seat) => Number.isFinite(seat) && seat > 0);

const collectNightStatusFromText = (
  text: string,
  marks: Set<NightStatusMark["kind"]>,
) => {
  if (/中毒|被毒|下毒/.test(text)) marks.add("poisoned");
  if (/醉酒|喝醉|醉了/.test(text)) marks.add("drunk");
  if (/保护|被护|免受恶魔/.test(text)) marks.add("protected");
};

const getNightStatusMarksForPlayers = (
  players: Player[],
  nightMessages: NightMessage[],
  round: number,
) => {
  const byPlayerId = new Map<string, NightStatusMark[]>();
  const bySeat = new Map<number, Player>();
  const playersById = new Map<string, Player>();
  for (const player of players) {
    bySeat.set(player.seat, player);
    playersById.set(player.id, player);
  }

  const markSets = new Map<string, Set<NightStatusMark["kind"]>>();
  const ensureMarks = (playerId: string) => {
    let marks = markSets.get(playerId);
    if (!marks) {
      marks = new Set();
      markSets.set(playerId, marks);
    }
    return marks;
  };

  const markSeats = (seats: number[], kind: NightStatusMark["kind"]) => {
    for (const seat of seats) {
      const player = bySeat.get(seat);
      if (player) ensureMarks(player.id).add(kind);
    }
  };

  for (const player of players) {
    const marks = ensureMarks(player.id);
    if (!player.alive) marks.add("dead");

    for (const note of parsePlayerNotes(player.notes)) {
      // 系统角色状态追踪（如士兵“中毒或醉酒 · 能力失效”）会直接写在本人 notes 上，应识别；
      // 已勾销备注不参与展示。
      if (note.resolved) continue;
      if (
        note.id.startsWith(roleStateNotePrefix) &&
        note.stage &&
        note.stage !== getGameStageLabel("夜晚", round)
      ) {
        continue;
      }
      collectNightStatusFromText(note.body, marks);
    }
  }

  const skillMessages = [...nightMessages]
    .filter((message) => getRoleSkillMessage(message.body))
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );

  let latestPoisonSeats: number[] | null = null;
  let latestProtectSeats: number[] | null = null;

  for (const message of skillMessages) {
    const actingPlayer = playersById.get(message.player_id);
    if (
      actingPlayer &&
      (actingPlayer.roleId === "drunk" || actingPlayer.roleId === "marionette")
    ) {
      continue;
    }
    // 毒/保护默认只认本回合技能记录：首夜/当晚下毒后的白天仍生效，
    // 进入下一晚后旧毒自动失效，直到本晚重新下毒。
    if (message.round !== round) continue;
    const body = getRoleSkillMessage(message.body) ?? message.body;
    const attackedTarget = body.match(
      /本晚(?:攻击|复仇)目标[：:]\s*(\d+)\s*号/,
    );
    if (attackedTarget) markSeats([Number(attackedTarget[1])], "attacked");

    if (
      latestPoisonSeats === null &&
      (message.role_id === "poisoner" ||
        message.role_id === "pukka" ||
        /本晚(?:新)?中毒目标|中毒目标/.test(body))
    ) {
      const seats = extractSeatNumbers(body);
      if (seats.length) latestPoisonSeats = [seats[0]];
    }
    if (
      message.role_id === "nodashii" ||
      message.role_id === "vigormortis"
    ) {
      const poisonClause = body.match(/；([^；]*中毒[^；]*)/);
      if (poisonClause) {
        markSeats(extractSeatNumbers(poisonClause[1]), "poisoned");
      }
    }
    if (
      latestProtectSeats === null &&
      (message.role_id === "monk" || /本晚保护目标/.test(body))
    ) {
      const seats = extractSeatNumbers(body);
      if (seats.length) latestProtectSeats = [seats[0]];
    }
  }

  if (latestPoisonSeats) markSeats(latestPoisonSeats, "poisoned");
  if (latestProtectSeats) markSeats(latestProtectSeats, "protected");

  const markMeta: Record<
    NightStatusMark["kind"],
    { label: string; order: number }
  > = {
    attacked: { label: "被攻击", order: 0 },
    dead: { label: "死亡", order: 1 },
    poisoned: { label: "中毒", order: 2 },
    drunk: { label: "醉酒", order: 3 },
    protected: { label: "保护", order: 4 },
  };

  for (const player of players) {
    const marks = markSets.get(player.id);
    if (!marks?.size) {
      byPlayerId.set(player.id, []);
      continue;
    }
    byPlayerId.set(
      player.id,
      [...marks]
        .sort((left, right) => markMeta[left].order - markMeta[right].order)
        .map((kind) => ({
          key: kind,
          label: markMeta[kind].label,
          kind,
        })),
    );
  }

  return byPlayerId;
};

const getSpyNightActionLines = (
  players: Player[],
  nightMessages: NightMessage[],
  round: number,
) => {
  const playersById = new Map(players.map((player) => [player.id, player]));

  return [...nightMessages]
    .filter((message) => message.round === round && message.role_id !== "spy")
    .map((message) => ({
      message,
      body: getRoleSkillMessage(message.body),
    }))
    .filter(
      (
        entry,
      ): entry is { message: NightMessage; body: string } =>
        entry.body !== null && !entry.body.startsWith("当前魔典："),
    )
    .sort(
      (left, right) =>
        new Date(left.message.created_at).getTime() -
        new Date(right.message.created_at).getTime(),
    )
    .map(({ message, body }) => {
      const player = playersById.get(message.player_id);
      const seat = player ? formatSeat(player.seat) : "未知座位";
      return `${seat} ${getRole(message.role_id).name}：${body}`;
    });
};

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
  if (phase === "夜晚" && round <= 1) return "首夜";
  const sequence = phase === "白天" ? round : Math.max(1, round - 1);
  return `第${chineseNumber(sequence)}${phase === "白天" ? "天" : "晚"}`;
};

const compactMessage = (body: string) =>
  body.replace(/\s+/g, " ").trim();

const getMessageSeatNumbers = (body: string) =>
  Array.from(new Set(body.match(/\d+号/g) ?? [])).map((seat) =>
    seat.replace("号", ""),
  );

const getSeatCardChoicePreview = (roleId: string, summary: string) => {
  const seats = getMessageSeatNumbers(summary);
  const target = seats[0] ? `${seats[0]}号` : "未记录";
  const selectedRole = summary.split("·").at(-1)?.trim() ?? "";
  if (roleId === "fortune-teller") {
    const targets = seats.length
      ? `${seats.slice(0, 2).join("+")}号`
      : "未记录";
    return `查${targets}·待回复`;
  }
  if (roleId === "imp" && summary.includes("自杀")) {
    return seats[1] ? `自杀→${seats[1]}号` : "自杀·待传承";
  }
  if (roleId === "philosopher") return selectedRole || "已选择能力";
  if (roleId === "gambler") {
    return `${target}·${selectedRole || "已猜角色"}`;
  }
  const prefixes: Record<string, string> = {
    monk: "保护",
    ravenkeeper: "查验",
    slayer: "射击",
    butler: "主人",
    poisoner: "中毒",
    imp: "攻击",
    gambler: "猜测",
    chambermaid: "查验",
    nightwatchman: "通知",
    moonchild: "选择",
    klutz: "选择",
    godfather: "攻击",
    pukka: "下毒",
    vigormortis: "攻击",
    nodashii: "攻击",
  };
  return `${prefixes[roleId] ?? "选择"}${target}`;
};

const getSeatCardSkillPreview = (roleId: string, body: string) => {
  const message = compactMessage(body);
  const seats = getMessageSeatNumbers(message);
  const target = seats[0] ? `${seats[0]}号` : "未记录";
  const shownRole = message.match(/(?:有一人是|是)([^，。]+)$/)?.[1] ?? "";
  const count = message.match(/\d+/)?.[0] ?? "?";

  if (["washerwoman", "librarian", "investigator"].includes(roleId)) {
    if (message.includes("没有外来者")) return "无外来者";
    const targets = seats.length
      ? `${seats.slice(0, 2).join("/")}号`
      : "座位未记录";
    return `${targets}·${shownRole || "已发送"}`;
  }

  switch (roleId) {
    case "chef":
      return `邪恶相邻${count}对`;
    case "empath":
      return `邻座邪恶${count}人`;
    case "fortune-teller": {
      const targets = seats.length
        ? `${seats.slice(0, 2).join("+")}号`
        : "未记录";
      return `查${targets}·${getFortuneTellerResult(message).label}`;
    }
    case "monk":
      return `保护${target}`;
    case "undertaker":
      return `${target}·${shownRole || "已查验"}`;
    case "ravenkeeper":
      return `查${target}·${shownRole || "已回复"}`;
    case "butler":
      return `主人${target}`;
    case "poisoner":
      return `中毒${target}`;
    case "spy":
      return "已查看魔典";
    case "scarlet-woman":
      return message.includes("已继承") ? "已继承小恶魔" : "未触发继承";
    case "imp":
      return `攻击${target}${message.includes("自杀") ? "·自杀" : ""}`;
    case "grandmother":
      return `孙辈${target}·${shownRole || "已设置"}`;
    case "gambler":
      return `${target}·${message.includes("错误") ? "猜错" : message.includes("正确") ? "猜对" : "已判定"}`;
    case "chambermaid":
      return `醒来${message.match(/有\s*(\d+)\s*人因/)?.[1] ?? "?"}人`;
    case "philosopher":
      return `获得${(message.match(/获得了([^，；]+?)的能力/)?.[1] ?? shownRole) || "已选能力"}`;
    case "juggler":
      return `猜对${count}个`;
    case "oracle":
      return `死者邪恶${count}人`;
    case "nightwatchman":
      return `通知${target}`;
    case "moonchild":
      return `${target}·${message.includes("死亡") ? "今晚死亡" : "不死亡"}`;
    case "klutz":
      return `${target}·${message.includes("落败") ? "阵营落败" : "游戏继续"}`;
    case "godfather":
      return message.includes("外来者") && !message.includes("目标")
        ? "已查看外来者"
        : `攻击${target}`;
    case "marionette":
      return "恶魔已获知";
    case "pukka":
      return `下毒${target}`;
    case "vigormortis":
    case "nodashii":
      return `攻击${target}`;
    default:
      return message;
  }
};

const getSkillStageLabel = (roleId: string, round: number) =>
  getTroubleBrewingSkill(roleId)?.playerChoice?.phase === "day"
    ? getGameStageLabel("白天", round)
    : getGameStageLabel("夜晚", round);

const getSeatCardSkillStageLabel = (roleId: string, round: number) =>
  getTroubleBrewingSkill(roleId)?.playerChoice?.phase === "day"
    ? `${round}天`
    : round <= 1
      ? "首"
      : `${round - 1}晚`;

const getFortuneTellerResult = (body: string) => {
  if (
    body.includes("没有恶魔") ||
    body.includes("无恶魔") ||
    body.includes("否，两人都未被视为恶魔")
  ) {
    return { kind: "negative", label: "无恶魔" } as const;
  }
  if (
    body.includes("有恶魔") ||
    body.includes("是，其中一人被视为恶魔")
  ) {
    return { kind: "positive", label: "有恶魔" } as const;
  }
  return { kind: "unknown", label: "已回复" } as const;
};

const getFortuneTellerSeatsFromResult = (body: string) =>
  Array.from(new Set(body.match(/\d+号/g) ?? [])).slice(0, 2);

const getNextGameStage = (
  phase: Phase,
  round: number,
): Pick<GameState, "phase" | "round"> => {
  if (phase === "夜晚") return { phase: "白天", round: Math.max(1, round) };
  return { phase: "夜晚", round: round + 1 };
};

const getPreviousGameStage = (
  phase: Phase,
  round: number,
): Pick<GameState, "phase" | "round"> | null => {
  if (phase === "白天") return { phase: "夜晚", round: Math.max(1, round) };
  if (round <= 1) return null;
  return { phase: "白天", round: round - 1 };
};

function GameStageToolbar({
  state,
  onUpdate,
  className = "",
}: {
  state: GameState;
  onUpdate: (patch: Partial<GameState>) => void;
  className?: string;
}) {
  const currentStageLabel = getGameStageLabel(state.phase, state.round);
  const previousStage = getPreviousGameStage(state.phase, state.round);
  const previousStageLabel = previousStage
    ? getGameStageLabel(previousStage.phase, previousStage.round)
    : null;
  const nextStage = getNextGameStage(state.phase, state.round);
  const nextStageLabel = getGameStageLabel(nextStage.phase, nextStage.round);
  const StageIcon = state.phase === "白天" ? Sun : MoonStar;

  return (
    <div className={`night-stage-toolbar ${className}`.trim()}>
      <div>
        <p className="eyebrow">GAME STAGE</p>
        <h2>当前回合</h2>
      </div>
      <div className="stage-control" aria-label="回合阶段切换">
        <button
          className="stage-step-button"
          onClick={() => {
            if (previousStage) {
              onUpdate({ ...previousStage, nightIndex: 0 });
            }
          }}
          disabled={!previousStage}
          title={
            previousStageLabel
              ? `返回${previousStageLabel}`
              : "已经是最早阶段"
          }
          aria-label={
            previousStageLabel
              ? `返回${previousStageLabel}`
              : "已经是最早阶段"
          }
        >
          <ChevronLeft size={17} />
        </button>
        <div className={`stage-current phase-${state.phase}`}>
          <StageIcon size={16} />
          <span>
            <small>当前阶段</small>
            <b>{currentStageLabel}</b>
          </span>
        </div>
        <button
          className="stage-step-button"
          onClick={() => onUpdate({ ...nextStage, nightIndex: 0 })}
          title={`进入${nextStageLabel}`}
          aria-label={`进入${nextStageLabel}`}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}

const sampleRoles = [
  "washerwoman",
  "empath",
  "fortune-teller",
  "monk",
  "ravenkeeper",
  "butler",
  "imp",
];

const getDisguiseRoleId = (
  players: Player[],
  playerId: string,
  rolePool: RoleDefinition[],
  preferredRoleId = "",
) => {
  const occupiedRoleIds = new Set(
    players
      .filter((player) => player.id !== playerId)
      .flatMap((player) => [player.roleId, player.drunkRoleId])
      .filter(Boolean),
  );
  const preferredRole = rolePool.find((role) => role.id === preferredRoleId);
  if (
    preferredRole?.team === "镇民" &&
    !occupiedRoleIds.has(preferredRole.id)
  ) {
    return preferredRole.id;
  }
  return (
    rolePool.find(
      (role) => role.team === "镇民" && !occupiedRoleIds.has(role.id),
    )?.id ?? ""
  );
};

const newPlayer = (seat: number, name = ""): Player => ({
  id: makeId(),
  seat,
  name,
  roleId: "washerwoman",
  drunkRoleId: "",
  alive: true,
  identityMessage: "",
  notes: "",
});

function App() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get("room");
  if (params.get("admin") === "1") return <AdminRooms />;
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
  const [dayWorkspaceView, setDayWorkspaceView] =
    useState<DayWorkspaceView>("private-chats");
  const [toast, setToast] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<PublicRoomPlayer[]>([]);
  const [nightMessages, setNightMessages] = useState<NightMessage[]>([]);
  const [playerMessages, setPlayerMessages] = useState<PlayerMessage[]>([]);
  const [dayPrivateThreads, setDayPrivateThreads] = useState<DayPrivateThread[]>([]);
  const [dayPrivateMessages, setDayPrivateMessages] = useState<DayPrivateMessage[]>([]);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [votes, setVotes] = useState<DayVote[]>([]);
  const [dayResolutions, setDayResolutions] = useState<DayResolution[]>([]);
  const [readPlayerMessageIds, setReadPlayerMessageIds] = useState<Set<string>>(
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
  }, [room]);

  const refreshRoomAdmin = useCallback(async (targetRoom: SharedRoom) => {
    const [
      latestRoom,
      players,
      messages,
      incomingMessages,
      nextDayPrivateThreads,
      nextDayPrivateMessages,
      nextNominations,
      nextVotes,
      nextDayResolutions,
    ] = await Promise.all([
      findRoomByCode(targetRoom.code),
      getRoomPlayers(targetRoom.id),
      getRoomNightMessages(targetRoom.id),
      getRoomPlayerMessages(targetRoom.id),
      getRoomDayPrivateThreads(targetRoom.id),
      getRoomDayPrivateMessages(targetRoom.id),
      getRoomNominations(targetRoom.id),
      getRoomVotes(targetRoom.id),
      getRoomDayResolutions(targetRoom.id),
    ]);
    if (!latestRoom || latestRoom.status === "closed") {
      localStorage.removeItem(activeRoomStorageKey);
      setRoom(null);
      setRoomReady(false);
      setRoomPlayers([]);
      setNightMessages([]);
      setPlayerMessages([]);
      setDayPrivateThreads([]);
      setDayPrivateMessages([]);
      setNominations([]);
      setVotes([]);
      setDayResolutions([]);
      setSyncStatus("idle");
      setToast("共享房间已由管理员关闭");
      return;
    }
    setRoomPlayers(players);
    setNightMessages(messages);
    setPlayerMessages(incomingMessages);
    setDayPrivateThreads(nextDayPrivateThreads);
    setDayPrivateMessages(nextDayPrivateMessages);
    setNominations(nextNominations);
    setVotes(nextVotes);
    setDayResolutions(nextDayResolutions);
  }, []);

  const unreadPlayerMessages = useMemo(
    () =>
      playerMessages.filter(
        (message) => !readPlayerMessageIds.has(message.id),
      ),
    [playerMessages, readPlayerMessageIds],
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
          event: "*",
          schema: "public",
          table: "xueran_day_private_threads",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "xueran_day_private_messages",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xueran_nominations",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xueran_day_resolutions",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xueran_votes" },
        () => void refreshRoomAdmin(room),
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refreshRoomAdmin, room]);

  const isFirstNight = state.phase === "夜晚" && state.round <= 1;
  const nightActions = useMemo(
    () =>
      getNightActions(
        state.players,
        isFirstNight,
        state.scriptId,
        state.round,
      ),
    [isFirstNight, state.players, state.round, state.scriptId],
  );
  const currentNightAction =
    nightActions[state.nightIndex] ?? nightActions[0];
  const aliveCount = state.players.filter((player) => player.alive).length;
  const selectedRole = currentNightAction?.role ?? null;

  const update = (patch: Partial<GameState>) => {
    setState((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  };

  useEffect(() => {
    const selectedAction = nightActions[state.nightIndex];
    if (!selectedAction || selectedAction.canAct) return;
    const nextActionIndex = nightActions.findIndex((action) => action.canAct);
    if (nextActionIndex < 0) return;
    setState((current) =>
      current.nightIndex === nextActionIndex
        ? current
        : {
            ...current,
            nightIndex: nextActionIndex,
            updatedAt: new Date().toISOString(),
          },
    );
  }, [nightActions, state.nightIndex]);

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
    update({ players, phase: "夜晚", round: 1, nightIndex: 0 });
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
      const distribution = distributeRoles(playerCount, state.scriptId);
      setState((current) => ({
        ...current,
        phase: "夜晚",
        round: 1,
        nightIndex: 0,
        players: current.players.map((player, index) => ({
          ...player,
          roleId: distribution.roleIds[index],
          drunkRoleId:
            distribution.roleIds[index] === "drunk"
              ? distribution.drunkRoleId
              : distribution.roleIds[index] === "marionette"
                ? distribution.marionetteRoleId
              : "",
          alive: true,
          identityMessage: "",
          notes: "",
        })),
        updatedAt: new Date().toISOString(),
      }));
      const { counts } = distribution;
      const setupCopy = distribution.setupNotes.length
        ? `（${distribution.setupNotes.join("、")}）`
        : "";
      setToast(
        `已分配：${counts.镇民}镇民 · ${counts.外来者}外来者 · ${counts.爪牙}爪牙 · ${counts.恶魔}恶魔${setupCopy}`,
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
      phase: "夜晚",
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
      localStorage.removeItem(`xueran-demon-bluffs-${room.id}`);
      setRoom((current) =>
        current
          ? {
              ...current,
              phase: "夜晚",
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
      setNominations([]);
      setVotes([]);
      setDayResolutions([]);
      setSyncStatus("idle");
      setToast("共享房间已结束，本地魔典仍然保留");
    } catch {
      setToast("结束房间失败，请稍后重试");
    }
  };

  const changeNight = (offset: number) => {
    if (!nightActions.length) return;
    for (let step = 1; step <= nightActions.length; step += 1) {
      const nextIndex =
        (state.nightIndex + offset * step + nightActions.length) %
        nightActions.length;
      if (nightActions[nextIndex]?.canAct) {
        update({ nightIndex: nextIndex });
        return;
      }
    }
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
    const recipient = state.players.find((player) => player.id === playerId);
    const playerVisibleRoleId = recipient
      ? getPlayerVisibleRoleId(recipient.roleId, recipient.drunkRoleId)
      : roleId;
    const message = await sendNightMessage({
      roomId: room.id,
      playerId,
      roleId: playerVisibleRoleId,
      round: state.round,
      body,
    });
    setNightMessages((current) => [
      message,
      ...current.filter((item) => item.id !== message.id),
    ]);
    const target = roomPlayers.find((player) => player.id === playerId);
    setToast(`夜间信息已发送给${formatSeat(target?.seat)}`);
  };

  const handleSetPlayerAlive = async (playerId: string, alive: boolean) => {
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return false;

    const nextState: GameState = {
      ...state,
      players: state.players.map((item) =>
        item.id === playerId ? { ...item, alive } : item,
      ),
      updatedAt: new Date().toISOString(),
    };
    setState(nextState);

    if (!room) return true;
    try {
      await syncRoom(room.id, nextState);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
      setToast(`未能同步${formatSeat(player.seat)}的生死状态，请重试`);
      return false;
    }

    if (alive) return true;

    const visibleRoleId = getPlayerVisibleRoleId(
      player.roleId,
      player.drunkRoleId,
    );
    const notice = getDeathTriggeredAbilityNotice(visibleRoleId);
    const roomPlayer = roomPlayers.find((item) => item.id === playerId);
    if (
      !notice ||
      !roomPlayer?.is_claimed ||
      (visibleRoleId === "ravenkeeper" && state.phase !== "夜晚")
    ) {
      return true;
    }

    try {
      await handleSendNightMessage({
        playerId,
        roleId: visibleRoleId,
        body: notice,
      });
      return true;
    } catch {
      setToast(`已将${formatSeat(player.seat)}标记为死亡，但触发通知发送失败`);
      return false;
    }
  };

  const handleCloseNomination = async (nominationId: string) => {
    if (!room || roomBusy) return;
    if (!window.confirm("确认结束当前提名的计票？结束后玩家不能继续投票。")) {
      return;
    }
    setRoomBusy(true);
    try {
      await closeNomination(nominationId);
      await refreshRoomAdmin(room);
      setToast("本轮计票已结束");
    } catch {
      setToast("结束计票失败，请刷新后重试");
    } finally {
      setRoomBusy(false);
    }
  };

  const handleFinalizeExecution = async () => {
    if (!room || roomBusy || state.phase !== "白天") return;
    if (!window.confirm("确认结束今天的提名，并按照当前最高票结果结算处决？")) {
      return;
    }
    setRoomBusy(true);
    try {
      const result = await finalizeExecution(room.id, state.round);
      const executedPlayer = result.executed_player_id
        ? state.players.find((player) => player.id === result.executed_player_id)
        : null;
      if (executedPlayer?.alive) {
        await handleSetPlayerAlive(executedPlayer.id, false);
      }
      await refreshRoomAdmin(room);
      setToast(
        executedPlayer
          ? `${formatSeat(executedPlayer.seat)}已被处决`
          : "今日投票结束，无人被处决",
      );
    } catch {
      setToast("处决结算失败，请先结束当前计票");
    } finally {
      setRoomBusy(false);
    }
  };

  const handleSimulatePlayerMessage = async (
    playerId: string,
    body: string,
  ) => {
    if (!room) throw new Error("请先创建共享房间");
    try {
      const message = await simulatePlayerMessage({
        roomId: room.id,
        playerId,
        body,
      });
      setPlayerMessages((current) => [
        message,
        ...current.filter((item) => item.id !== message.id),
      ]);
      const target = roomPlayers.find((player) => player.id === playerId);
      setToast(`已模拟 ${formatSeat(target?.seat)} 玩家消息`);
    } catch (reason) {
      setToast(
        reason instanceof Error &&
          /function|schema cache|simulate_player_message/i.test(reason.message)
          ? "玩家模拟数据库尚未配置"
          : "模拟玩家消息发送失败",
      );
      throw reason;
    }
  };

  const handleSimulateDayPrivateMessage = async (
    senderPlayerId: string,
    recipientPlayerId: string,
    body: string,
  ) => {
    if (!room) throw new Error("请先创建共享房间");
    try {
      await simulateDayPrivateMessage({
        roomId: room.id,
        senderPlayerId,
        recipientPlayerId,
        body,
      });
      await refreshRoomAdmin(room);
      setToast("已模拟玩家发送白天私聊");
    } catch (reason) {
      setToast("模拟白天私聊发送失败");
      throw reason;
    }
  };

  const handleSimulateNomination = async (
    nominatorPlayerId: string,
    nomineePlayerId: string,
  ) => {
    if (!room) throw new Error("请先创建共享房间");
    try {
      await simulateNomination({
        roomId: room.id,
        nominatorPlayerId,
        nomineePlayerId,
      });
      await refreshRoomAdmin(room);
      setToast("已模拟玩家发起提名");
    } catch (reason) {
      setToast("模拟提名失败");
      throw reason;
    }
  };

  const handleSimulateVote = async (
    nominationId: string,
    voterPlayerId: string,
  ) => {
    if (!room) throw new Error("请先创建共享房间");
    try {
      await simulateVote({ nominationId, voterPlayerId });
      await refreshRoomAdmin(room);
      setToast("已模拟玩家投票");
    } catch (reason) {
      setToast("模拟投票失败");
      throw reason;
    }
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
                {tab.id === "night" && nightActions.length > 0 ? (
                  <span className="tab-count">{nightActions.length}</span>
                ) : tab.id === "messages" &&
                  unreadPlayerMessages.length > 0 ? (
                  <span className="tab-count">
                    {unreadPlayerMessages.length}
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
            onUpdatePlayer={updatePlayer}
            onSetPlayerAlive={(playerId, alive) =>
              void handleSetPlayerAlive(playerId, alive)
            }
            onRemovePlayer={removePlayer}
            onAddPlayer={addPlayer}
            onAssignRoles={assignRoles}
            onQuickStart={quickStart}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            playerMessages={playerMessages}
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
                onClose={() => void endSharedRoom()}
              />
            }
          />
        ) : null}

        {activeTab === "night" ? (
          <NightPanel
            state={state}
            nightActions={nightActions}
            currentAction={currentNightAction}
            currentRole={selectedRole}
            room={room}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            playerMessages={playerMessages}
            unreadPlayerMessages={unreadPlayerMessages}
            onUpdate={update}
            onChangeNight={changeNight}
            onSetPlayerAlive={handleSetPlayerAlive}
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
            unreadPlayerMessages={unreadPlayerMessages}
            onReadPlayerMessages={markPlayerMessagesRead}
            onSendMessage={handleSendNightMessage}
          />
        ) : null}

        {activeTab === "day" ? (
          <div className="day-workspace">
            <GameStageToolbar
              className="day-stage-toolbar"
              state={state}
              onUpdate={update}
            />
            <div className="day-workspace-toolbar">
              <div className="day-workspace-title">
                <Sun size={18} />
                <div>
                  <strong>白天顺序</strong>
                  <span>
                    第 {state.phase === "夜晚" ? Math.max(1, state.round - 1) : state.round} 天
                  </span>
                </div>
              </div>
              <div
                className="day-workspace-tabs"
                role="tablist"
                aria-label="白天顺序功能"
              >
                <button
                  className={dayWorkspaceView === "private-chats" ? "active" : ""}
                  role="tab"
                  aria-selected={dayWorkspaceView === "private-chats"}
                  onClick={() => setDayWorkspaceView("private-chats")}
                >
                  <MessageCircleMore size={15} />
                  白天私聊
                </button>
                <button
                  className={dayWorkspaceView === "voting" ? "active" : ""}
                  role="tab"
                  aria-selected={dayWorkspaceView === "voting"}
                  onClick={() => setDayWorkspaceView("voting")}
                >
                  <Gavel size={15} />
                  提名投票
                </button>
              </div>
            </div>

            {dayWorkspaceView === "private-chats" ? (
              <HostPrivateChats
                roomAvailable={Boolean(room)}
                players={roomPlayers}
                threads={dayPrivateThreads}
                messages={dayPrivateMessages}
              />
            ) : (
              <HostVotingPanel
                roomAvailable={Boolean(room)}
                phase={state.phase}
                round={state.round}
                players={roomPlayers}
                gamePlayers={state.players}
                nominations={nominations}
                votes={votes}
                resolutions={dayResolutions}
                busy={roomBusy}
                onCloseNomination={handleCloseNomination}
                onFinalizeExecution={handleFinalizeExecution}
              />
            )}
          </div>
        ) : null}

        {activeTab === "script" ? (
          <ScriptPanel
            scriptId={state.scriptId}
            roleFilter={roleFilter}
            onSelectScript={(scriptId) => update({ scriptId })}
            onFilter={setRoleFilter}
          />
        ) : null}

        {activeTab === "simulation" ? (
          <Suspense
            fallback={
              <div className="player-simulation-empty-page">
                <strong>正在加载玩家模拟模块</strong>
              </div>
            }
          >
            <PlayerSimulationConsole
              room={room}
              players={roomPlayers}
              gamePlayers={state.players}
              scriptId={state.scriptId}
              phase={state.phase}
              round={state.round}
              nightMessages={nightMessages}
              playerMessages={playerMessages}
              dayPrivateThreads={dayPrivateThreads}
              dayPrivateMessages={dayPrivateMessages}
              nominations={nominations}
              votes={votes}
              resolutions={dayResolutions}
              busy={roomBusy || syncStatus === "syncing"}
              onCreateRoom={startSharedRoom}
              onToggleSimulation={handleToggleSimulation}
              onSendPlayerMessage={handleSimulatePlayerMessage}
              onSendPrivateMessage={handleSimulateDayPrivateMessage}
              onNominate={handleSimulateNomination}
              onVote={handleSimulateVote}
            />
          </Suspense>
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
              unreadPlayerMessages.length > 0 ? (
                <strong className="mobile-nav-badge">
                  {Math.min(
                    unreadPlayerMessages.length,
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
  onUpdatePlayer,
  onSetPlayerAlive,
  onRemovePlayer,
  onAddPlayer,
  onAssignRoles,
  onQuickStart,
  roomPlayers,
  nightMessages,
  playerMessages,
  roomPanel,
}: {
  state: GameState;
  aliveCount: number;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onSetPlayerAlive: (id: string, alive: boolean) => void;
  onRemovePlayer: (id: string) => void;
  onAddPlayer: () => void;
  onAssignRoles: () => void;
  onQuickStart: () => void;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  roomPanel: ReactNode;
}) {
  const scriptRoles = getScriptRoles(state.scriptId);
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
  const skillHistoryByPlayer = useMemo(() => {
    const byStage = new Map<string, { message: NightMessage; body: string }>();
    for (const message of nightMessages) {
      const skillBody = getRoleSkillMessage(message.body);
      if (!skillBody) continue;
      const key = `${message.player_id}:${message.role_id}:${message.round}`;
      const current = byStage.get(key);
      if (
        !current ||
        new Date(message.created_at).getTime() >
          new Date(current.message.created_at).getTime()
      ) {
        byStage.set(key, { message, body: skillBody });
      }
    }
    const history = new Map<
      string,
      { message: NightMessage; body: string }[]
    >();
    for (const entry of byStage.values()) {
      const key = `${entry.message.player_id}:${entry.message.role_id}`;
      const current = history.get(key) ?? [];
      current.push(entry);
      history.set(key, current);
    }
    history.forEach((entries) =>
      entries.sort(
        (left, right) =>
          new Date(right.message.created_at).getTime() -
          new Date(left.message.created_at).getTime(),
      ),
    );
    return history;
  }, [nightMessages]);
  const skillChoiceHistoryByPlayer = useMemo(() => {
    const byStage = new Map<
      string,
      {
        message: PlayerMessage;
        choice: NonNullable<
          ReturnType<typeof parsePlayerSkillChoiceMessage>
        >;
      }
    >();
    for (const message of playerMessages) {
      const choice = parsePlayerSkillChoiceMessage(message.body);
      if (!choice) continue;
      const key = `${message.player_id}:${choice.roleId}:${message.round}`;
      const current = byStage.get(key);
      if (
        !current ||
        new Date(message.created_at).getTime() >
          new Date(current.message.created_at).getTime()
      ) {
        byStage.set(key, { message, choice });
      }
    }
    const history = new Map<
      string,
      {
        message: PlayerMessage;
        choice: NonNullable<
          ReturnType<typeof parsePlayerSkillChoiceMessage>
        >;
      }[]
    >();
    for (const entry of byStage.values()) {
      const key = `${entry.message.player_id}:${entry.choice.roleId}`;
      const current = history.get(key) ?? [];
      current.push(entry);
      history.set(key, current);
    }
    history.forEach((entries) =>
      entries.sort(
        (left, right) =>
          new Date(right.message.created_at).getTime() -
          new Date(left.message.created_at).getTime(),
      ),
    );
    return history;
  }, [playerMessages]);
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

  return (
    <div className="dashboard-grid">
      <aside className="side-panel">
        {roomPanel}
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
                className="secondary-button"
                onClick={() => {
                  const lastPlayer = state.players[state.players.length - 1];
                  if (
                    window.confirm(
                      `移除最后一个座位（${formatSeat(lastPlayer.seat)}）？`,
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
              "mobile-grid",
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
                  const skillRoleId = getPlayerVisibleRoleId(
                    player.roleId,
                    player.drunkRoleId,
                  );
                  const angle =
                    (index / state.players.length) * Math.PI * 2 - Math.PI / 2;
                  const radius = state.players.length > 15 ? 42 : 40;
                  const left = 50 + Math.cos(angle) * radius;
                  const top = 50 + Math.sin(angle) * radius;
                  const isSelected = selectedPlayer?.id === player.id;
                  const skillHistory = skillHistoryByPlayer.get(
                    `${player.id}:${skillRoleId}`,
                  ) ?? [];
                  const latestSkill = skillHistory[0];
                  const choiceHistory = skillChoiceHistoryByPlayer.get(
                    `${player.id}:${skillRoleId}`,
                  ) ?? [];
                  const latestChoice = choiceHistory[0];
                  const roleSkillTimeline = Array.from(
                    new Set([
                      ...skillHistory.map((entry) => entry.message.round),
                      ...choiceHistory.map((entry) => entry.message.round),
                    ]),
                  )
                    .sort((left, right) => left - right)
                    .map((round) => {
                      const skillEntry = skillHistory.find(
                        (entry) => entry.message.round === round,
                      );
                      const choiceEntry = choiceHistory.find(
                        (entry) => entry.message.round === round,
                      );
                      const useChoice =
                        Boolean(choiceEntry) &&
                        (!skillEntry ||
                          new Date(
                            choiceEntry?.message.created_at ?? 0,
                          ).getTime() >
                            new Date(
                              skillEntry?.message.created_at ?? 0,
                            ).getTime());
                      return {
                        round,
                        preview: useChoice
                          ? getSeatCardChoicePreview(
                              skillRoleId,
                              choiceEntry?.choice.summary ?? "",
                            )
                          : getSeatCardSkillPreview(
                              skillRoleId,
                              skillEntry?.body ?? "",
                            ),
                        choice: choiceEntry?.choice.summary ?? "",
                        result: skillEntry?.body ?? "",
                      };
                    });
                  const latestInfo = roleSkillTimeline.at(-1) ?? null;
                  const infoPreview = latestInfo
                    ? `${getSkillStageLabel(skillRoleId, latestInfo.round)} · ${latestInfo.preview}`
                    : "";
                  const roleInfoTitle = roleSkillTimeline
                    .map((entry) =>
                      [
                        getSkillStageLabel(skillRoleId, entry.round),
                        entry.choice ? `玩家：${entry.choice}` : "",
                        entry.result ? `上帝：${entry.result}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n"),
                    )
                    .join("\n\n");
                  const redHerring = isFortuneTellerRedHerring(player);
                  const roleStateHistory = getPlayerRoleStateHistory(
                    player,
                    role.id,
                  );
                  const cardNoteCount =
                    roleSkillTimeline.length +
                    (redHerring ? 1 : 0) +
                    roleStateHistory.length;
                  const cardNoteRows = Math.max(1, cardNoteCount);
                  const cardStyle = {
                    left: `${left}%`,
                    top: `${top}%`,
                    "--card-notes-extra-height": `${Math.max(0, cardNoteRows - 1) * 14}px`,
                  } as CSSProperties;

                  return (
                    <button
                      className={[
                        "table-seat",
                        teamLabels[role.team],
                        player.alive ? "" : "dead",
                        isSelected ? "selected" : "",
                        cardNoteCount > 0 ? "has-card-notes" : "",
                        state.players.length > 10 ? "dense" : "",
                        state.players.length > 15 ? "very-dense" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={cardStyle}
                      key={player.id}
                      onClick={() => setSelectedPlayerId(player.id)}
                      aria-label={`${formatSeat(player.seat)}，${getDisplayName(player)}，${role.name}，${player.alive ? "存活" : "死亡"}${redHerring ? `，${fortuneTellerRedHerringNoteBody}` : ""}${roleStateHistory.length ? `，角色状态：${roleStateHistory.map((entry) => `${entry.stage ?? "阶段未记录"} ${entry.body}`).join("；")}` : ""}${infoPreview ? `，已传达信息：${infoPreview}` : ""}`}
                      aria-pressed={isSelected}
                    >
                      <span className="table-role-icon">
                        <RoleIcon
                          roleId={role.id}
                          size={state.players.length > 10 ? 18 : 22}
                        />
                      </span>
                      <span className="table-player-name">{getTableName(player)}</span>
                      <span className="table-role-name">
                        <span className="table-role-name-text">
                          {role.name}
                          {(player.roleId === "drunk" ||
                            player.roleId === "marionette") &&
                          player.drunkRoleId
                            ? ` / ${getRole(player.drunkRoleId).name}`
                            : ""}
                        </span>
                        <span className="table-seat-number">
                          {formatSeat(player.seat)}
                        </span>
                      </span>
                      {cardNoteCount > 0 ? (
                        <span className="table-card-notes">
                          {redHerring ? (
                            <span
                              className="table-card-note is-red-herring"
                              title={fortuneTellerRedHerringNoteBody}
                            >
                              <strong>身份标签</strong>
                              <span>占卜师宿敌</span>
                            </span>
                          ) : null}
                          {roleStateHistory.map((entry) => (
                            <span
                              className="table-card-note is-role-state"
                              key={entry.id}
                              title={(entry.stage ?? "阶段未记录") + " · " + entry.body}
                            >
                              <strong>
                                {entry.stage ?? "角色状态"}
                              </strong>
                              <span>{entry.body}</span>
                            </span>
                          ))}
                          {latestSkill || latestChoice
                            ? roleSkillTimeline.map((entry) => (
                                <span
                                  className="table-card-note"
                                  key={entry.round}
                                  title={roleInfoTitle}
                                >
                                  <strong>
                                    {getSeatCardSkillStageLabel(
                                      skillRoleId,
                                      entry.round,
                                    )}
                                  </strong>
                                  <span>{entry.preview}</span>
                                </span>
                              ))
                            : null}
                        </span>
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
                players={state.players}
                roleOptions={scriptRoles}
                displayName={getDisplayName(selectedPlayer)}
                stageLabel={currentStageLabel}
                messages={nightMessages.filter(
                  (message) => message.player_id === selectedPlayer.id,
                )}
                playerMessages={playerMessages.filter(
                  (message) => message.player_id === selectedPlayer.id,
                )}
                onUpdate={onUpdatePlayer}
                onSetAlive={onSetPlayerAlive}
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
  players,
  roleOptions,
  displayName,
  stageLabel,
  messages,
  playerMessages,
  onUpdate,
  onSetAlive,
  onRemove,
}: {
  player: Player;
  players: Player[];
  roleOptions: RoleDefinition[];
  displayName: string;
  stageLabel: string;
  messages: NightMessage[];
  playerMessages: PlayerMessage[];
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onSetAlive: (id: string, alive: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const role = getRole(player.roleId);
  const roleSkill = getTroubleBrewingSkill(role.id);
  const roleState = getPlayerRoleState(player, role.id);
  const visibleRoleId = getPlayerVisibleRoleId(
    player.roleId,
    player.drunkRoleId,
  );
  const disguiseRole = player.drunkRoleId
    ? getRole(player.drunkRoleId)
    : null;
  const occupiedDrunkRoleIds = new Set(
    players
      .filter((item) => item.id !== player.id)
      .flatMap((item) => [item.roleId, item.drunkRoleId])
      .filter(Boolean),
  );
  const disguiseConflictsWithActualRole = Boolean(
    disguiseRole &&
      players.some(
        (item) => item.id !== player.id && item.roleId === disguiseRole.id,
      ),
  );
  const [noteDraft, setNoteDraft] = useState("");
  const parsedNoteEntries = parsePlayerNotes(player.notes);
  const systemNoteEntries = parsedNoteEntries.filter((note) =>
    note.id.startsWith("system:"),
  );
  const noteEntries = parsedNoteEntries.filter(
    (note) => !note.id.startsWith("system:"),
  );
  const hasRedHerring = systemNoteEntries.some(
    (note) => note.id === fortuneTellerRedHerringNoteId,
  );
  const serializeEditorNotes = (entries: PlayerNoteEntry[]) =>
    serializePlayerNotes([...systemNoteEntries, ...entries]);
  const messageHistory = [...messages].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
  const fortuneHistory = useMemo(() => {
    if (visibleRoleId !== "fortune-teller") return [];
    const choicesByRound = new Map<
      number,
      {
        message: PlayerMessage;
        choice: NonNullable<
          ReturnType<typeof parsePlayerSkillChoiceMessage>
        >;
      }
    >();
    for (const message of playerMessages) {
      const choice = parsePlayerSkillChoiceMessage(message.body);
      if (!choice || choice.roleId !== visibleRoleId) continue;
      const current = choicesByRound.get(message.round);
      if (
        !current ||
        new Date(message.created_at).getTime() >
          new Date(current.message.created_at).getTime()
      ) {
        choicesByRound.set(message.round, { message, choice });
      }
    }
    const resultsByRound = new Map<
      number,
      { message: NightMessage; body: string }
    >();
    for (const message of messageHistory) {
      if (message.role_id !== visibleRoleId) continue;
      const body = getRoleSkillMessage(message.body);
      if (!body) continue;
      const current = resultsByRound.get(message.round);
      if (
        !current ||
        new Date(message.created_at).getTime() >
          new Date(current.message.created_at).getTime()
      ) {
        resultsByRound.set(message.round, { message, body });
      }
    }
    return Array.from(
      new Set([...choicesByRound.keys(), ...resultsByRound.keys()]),
    )
      .map((round) => {
        const choiceEntry = choicesByRound.get(round) ?? null;
        const resultEntry = resultsByRound.get(round) ?? null;
        const resultIsCurrent =
          Boolean(resultEntry) &&
          (!choiceEntry ||
            new Date(resultEntry?.message.created_at ?? 0).getTime() >=
              new Date(choiceEntry?.message.created_at ?? 0).getTime());
        const targets = choiceEntry
          ? choiceEntry.choice.playerIds
              .map((playerId) =>
                players.find((item) => item.id === playerId),
              )
              .filter((item): item is Player => Boolean(item))
              .map((item) => formatSeat(item.seat))
          : resultEntry
            ? getFortuneTellerSeatsFromResult(resultEntry.body)
            : [];
        return {
          round,
          targets,
          result:
            resultEntry && resultIsCurrent
              ? getFortuneTellerResult(resultEntry.body)
              : { kind: "pending", label: "待回复" as const },
          body: resultEntry && resultIsCurrent ? resultEntry.body : "",
          createdAt:
            choiceEntry &&
            (!resultEntry ||
              new Date(choiceEntry.message.created_at).getTime() >
                new Date(resultEntry.message.created_at).getTime())
              ? choiceEntry.message.created_at
              : resultEntry?.message.created_at ?? "",
        };
      })
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );
  }, [messageHistory, playerMessages, players, visibleRoleId]);
  const addNote = () => {
    const body = noteDraft.trim();
    if (!body) return;
    onUpdate(player.id, {
      notes: serializeEditorNotes([
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
      notes: serializeEditorNotes(
        noteEntries.map((note) =>
          note.id === noteId ? { ...note, body } : note,
        ),
      ),
    });
  };
  const removeNote = (noteId: string) => {
    onUpdate(player.id, {
      notes: serializeEditorNotes(
        noteEntries.filter((note) => note.id !== noteId),
      ),
    });
  };
  const updateRoleState = (body: string) => {
    const noteId = `${roleStateNotePrefix}${role.id}:${stageLabel}`;
    const nextSystemNotes = systemNoteEntries.filter(
      (note) =>
        !(
          isPlayerRoleStateNote(note, role.id) &&
          note.stage === stageLabel
        ),
    );
    onUpdate(player.id, {
      notes: serializePlayerNotes([
        { id: noteId, body, createdAt: new Date().toISOString(), stage: stageLabel },
        ...nextSystemNotes,
        ...noteEntries,
      ]),
    });
  };
  const toggleNoteResolved = (noteId: string) => {
    onUpdate(player.id, {
      notes: serializeEditorNotes(
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
            {formatSeat(player.seat)}
          </p>
          <h3>{displayName}</h3>
        </div>
        <button
          className={player.alive ? "life-toggle alive" : "life-toggle"}
          onClick={() => onSetAlive(player.id, !player.alive)}
          title={player.alive ? "标记为死亡" : "标记为存活"}
        >
          {player.alive ? <Check size={13} /> : <Skull size={13} />}
          {player.alive ? "存活" : "死亡"}
        </button>
      </div>

      <label className="role-select-field">
        <span>角色身份</span>
        <CompactSelect
          value={player.roleId}
          onValueChange={(roleId) => {
            onUpdate(player.id, {
              roleId,
              drunkRoleId:
                roleId === "drunk" || roleId === "marionette"
                  ? getDisguiseRoleId(
                      players,
                      player.id,
                      roleOptions,
                      player.drunkRoleId,
                    )
                  : "",
            });
          }}
          ariaLabel={`${formatSeat(player.seat)}角色`}
        >
          {roleOptions.map((option) => (
            <option value={option.id} key={option.id}>
              {option.name} · {option.team}
            </option>
          ))}
        </CompactSelect>
      </label>

      {player.roleId === "drunk" || player.roleId === "marionette" ? (
        <label className="drunk-disguise-field">
          <span className="drunk-disguise-icon">
            <RoleIcon roleId={disguiseRole?.id ?? "washerwoman"} size={24} />
          </span>
          <span className="drunk-disguise-copy">
            <strong>
              {player.roleId === "drunk"
                ? "酒鬼展示身份"
                : "提线木偶展示身份"}
            </strong>
            <small>玩家只会看到这个镇民身份</small>
          </span>
          <CompactSelect
            value={player.drunkRoleId}
            onValueChange={(drunkRoleId) => onUpdate(player.id, { drunkRoleId })}
            ariaLabel={`${formatSeat(player.seat)} ${
              player.roleId === "drunk" ? "酒鬼" : "提线木偶"
            }展示身份`}
          >
            {roleOptions
              .filter((option) => option.team === "镇民")
              .map((option) => (
                <option
                  value={option.id}
                  key={option.id}
                  disabled={
                    occupiedDrunkRoleIds.has(option.id) &&
                    option.id !== player.drunkRoleId
                  }
                >
                  {option.name}
                </option>
              ))}
          </CompactSelect>
          {disguiseConflictsWithActualRole ? (
            <span className="drunk-disguise-warning">
              该展示身份已经在场，请更换一个不在本局的镇民身份
            </span>
          ) : null}
        </label>
      ) : null}

      <div className={`selected-role-summary ${teamLabels[role.team]}`}>
        <span className="selected-role-icon">
          <RoleIcon roleId={role.id} size={20} />
        </span>
        <div>
          <strong>{role.name}</strong>
          <small>{role.team}</small>
          <p>{role.short}</p>
          {(player.roleId === "drunk" ||
            player.roleId === "marionette") &&
          disguiseRole ? (
            <span className="drunk-host-summary">
              玩家看到：{disguiseRole.name} · {disguiseRole.short}
            </span>
          ) : null}
        </div>
      </div>
      {roleSkill ? (
        <section className="role-ability-panel">
          <div className="role-ability-heading">
            <span>{roleSkill.phase}</span>
            <strong>角色技能交互</strong>
          </div>
          <p>{roleSkill.interaction}</p>
          <small>{roleSkill.hostHint}</small>
          {roleSkill.trackerOptions?.length ? (
            role.id === "slayer" ? (
              <div className="role-state-options slayer-state-controls">
                <button
                  className={
                    roleState?.body === "能力未使用" ? "active" : ""
                  }
                  onClick={() => updateRoleState("能力未使用")}
                >
                  能力未使用
                </button>
                <label>
                  <span>已使用</span>
                  <CompactSelect
                    value={
                      players.find(
                        (item) =>
                          roleState?.body ===
                          `已使用 · ${formatSeat(item.seat)}`,
                      )?.id ?? ""
                    }
                    onValueChange={(targetId) => {
                      const target = players.find(
                        (item) => item.id === targetId,
                      );
                      if (target) {
                        updateRoleState(`已使用 · ${formatSeat(target.seat)}`);
                      }
                    }}
                    ariaLabel="选择杀手技能目标"
                  >
                    <option value="">选择目标座位</option>
                    {[...players]
                      .sort((left, right) => left.seat - right.seat)
                      .map((target) => (
                        <option value={target.id} key={target.id}>
                          {formatSeat(target.seat)} · {target.name || "待入座"}
                        </option>
                      ))}
                  </CompactSelect>
                </label>
              </div>
            ) : (
              <div className="role-state-options">
                {roleSkill.trackerOptions.map((option) => (
                  <button
                    className={roleState?.body === option ? "active" : ""}
                    key={option}
                    onClick={() => updateRoleState(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )
          ) : null}
          {roleState ? (
            <div className="role-state-current">
              <Check size={13} />
              <span>{roleState.body}</span>
              <small>{roleState.stage ?? "阶段未记录"}</small>
            </div>
          ) : null}
        </section>
      ) : null}
      {hasRedHerring ? (
        <div className="fortune-red-herring-banner">
          <Target size={15} />
          <div>
            <strong>占卜师宿敌</strong>
            <span>该玩家在占卜师能力中始终被视为恶魔</span>
          </div>
        </div>
      ) : null}

      {fortuneHistory.length ? (
        <section className="fortune-history-section">
          <div className="player-history-heading">
            <div>
              <span>占卜记录</span>
              <small>每晚选择与上帝回复</small>
            </div>
            <strong>{fortuneHistory.length}</strong>
          </div>
          <div className="fortune-history-list">
            {fortuneHistory.map((entry) => (
              <article className="fortune-history-item" key={entry.round}>
                <div className="fortune-history-topline">
                  <strong>{getGameStageLabel("夜晚", entry.round)}</strong>
                  <span className={`fortune-history-result ${entry.result.kind}`}>
                    {entry.result.label}
                  </span>
                </div>
                <p>
                  <Target size={12} />
                  <span>
                    查验{" "}
                    {entry.targets.length
                      ? entry.targets.join(" + ")
                      : "对象未记录"}
                  </span>
                </p>
                {entry.body ? <small>{entry.body}</small> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
              const skillBody = getRoleSkillMessage(message.body);
              return (
                <article className="player-history-item" key={message.id}>
                  <div>
                    <strong>
                      {getGameStageLabel("夜晚", message.round)}
                      {skillBody ? " · 技能" : ""}
                    </strong>
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
                  <p>{getNightMessageDisplayBody(message.body)}</p>
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
            if (window.confirm(`移除${formatSeat(player.seat)}？`)) {
              onRemove(player.id);
            }
          }}
          title="移除玩家"
          aria-label={`移除${formatSeat(player.seat)}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}

type SkillResultConfirmation = {
  title: string;
  recipient: string;
  sendLines: string[];
  judgement: string;
  baseline: string;
  issueLines: string[];
  caveatLines: string[];
  mismatch: boolean;
  resolve: (confirmed: boolean) => void;
};

function NightPanel({
  state,
  nightActions,
  currentAction,
  currentRole,
  room,
  roomPlayers,
  nightMessages,
  playerMessages,
  unreadPlayerMessages,
  onUpdate,
  onSetPlayerAlive,
  onChangeNight,
  onSelectNight,
  onReadPlayerMessages,
  onSendMessage,
}: {
  state: GameState;
  nightActions: ReturnType<typeof getNightActions>;
  currentAction: ReturnType<typeof getNightActions>[number] | undefined;
  currentRole: ReturnType<typeof getRole> | null;
  room: SharedRoom | null;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  unreadPlayerMessages: PlayerMessage[];
  onUpdate: (patch: Partial<GameState>) => void;
  onSetPlayerAlive: (playerId: string, alive: boolean) => Promise<boolean>;
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
  const [sendingMode, setSendingMode] = useState<
    "message" | "skill" | null
  >(null);
  const [skillTargets, setSkillTargets] = useState({
    first: "",
    second: "",
  });
  const [skillRoleId, setSkillRoleId] = useState("");
  const [singleSkillTargetId, setSingleSkillTargetId] = useState("");
  const [revealedSkillRoleId, setRevealedSkillRoleId] = useState("");
  const [librarianNoOutsider, setLibrarianNoOutsider] = useState(false);
  const [chefResult, setChefResult] = useState(0);
  const [sendError, setSendError] = useState("");
  const [impSuccessorPlayerId, setImpSuccessorPlayerId] = useState("");
  const [sendingBluffs, setSendingBluffs] = useState(false);
  const [demonBluffRoleIds, setDemonBluffRoleIds] = useState<string[]>([]);
  const [skillResultConfirmation, setSkillResultConfirmation] =
    useState<SkillResultConfirmation | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const lastAutomaticSkillKeyRef = useRef("");
  const sending = sendingMode !== null || sendingBluffs;
  const currentStageLabel = getGameStageLabel(state.phase, state.round);
  const nightStatusByPlayerId = useMemo(
    () =>
      getNightStatusMarksForPlayers(
        state.players,
        nightMessages,
        state.round,
      ),
    [nightMessages, state.players, state.round],
  );
  const rolePlayers = useMemo(
    () =>
      currentRole
        ? state.players.filter(
            (player) =>
              currentRole.id === "marionette"
                ? player.roleId === "marionette"
                : getPlayerVisibleRoleId(
                    player.roleId,
                    player.drunkRoleId,
                  ) === currentRole.id,
          )
        : [],
    [currentRole, state.players],
  );
  const roomPlayersById = useMemo(
    () => new Map(roomPlayers.map((player) => [player.id, player])),
    [roomPlayers],
  );
  const selectedPlayer = rolePlayers.find(
    (player) => player.id === targetPlayerId,
  );
  const selectedPlayerHasNoShownAbility = Boolean(
    selectedPlayer &&
      (selectedPlayer.roleId === "drunk" ||
        selectedPlayer.roleId === "marionette"),
  );
  const selectedRoomPlayer = selectedPlayer
    ? roomPlayersById.get(selectedPlayer.id)
    : undefined;
  const impSuccessorCandidates = useMemo(
    () =>
      state.players.filter(
        (player) => player.alive && player.id !== selectedPlayer?.id,
      ),
    [selectedPlayer?.id, state.players],
  );
  const availableDemonBluffRoles = useMemo(() => {
    const assignedRoleIds = new Set(
      state.players.map((player) => player.roleId),
    );
    return getScriptRoles(state.scriptId).filter(
      (role) =>
        (role.team === "镇民" || role.team === "外来者") &&
        !assignedRoleIds.has(role.id),
    );
  }, [state.players, state.scriptId]);
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
  const demonBluffsAvailable =
    currentRole?.id === "imp" && state.round <= 1 && Boolean(selectedPlayer);
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
        JSON.stringify({ assignedRoleSignature, roleIds }),
      );
    },
    [assignedRoleSignature, demonBluffStorageKey],
  );
  const currentSkillDefinition = currentRole
    ? getTroubleBrewingSkill(currentRole.id)
    : null;
  const selectedPlayerName = selectedPlayer
    ? selectedRoomPlayer?.name ||
      formatSeat(selectedPlayer.seat)
    : "玩家";

  useEffect(() => {
    const preferredPlayerId =
      currentAction?.playerId &&
      rolePlayers.some((player) => player.id === currentAction.playerId)
        ? currentAction.playerId
        : rolePlayers[0]?.id ?? "";
    if (targetPlayerId !== preferredPlayerId) {
      setTargetPlayerId(preferredPlayerId);
    }
    setSendError("");
  }, [currentAction?.playerId, rolePlayers, targetPlayerId]);

  useEffect(() => {
    if (
      !demonBluffsAvailable ||
      availableDemonBluffRoles.length < 3
    ) {
      setDemonBluffRoleIds([]);
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(demonBluffStorageKey) ?? "null",
      ) as { assignedRoleSignature?: string; roleIds?: unknown } | null;
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
    demonBluffsAvailable,
    persistDemonBluffs,
  ]);

  const sentDemonBluffSignatures = useMemo(
    () =>
      new Set(
        nightMessages
          .filter(
            (message) =>
              Boolean(selectedPlayer) && message.player_id === selectedPlayer?.id,
          )
          .map((message) => parseDemonBluffMessage(message.body))
          .filter((roleIds): roleIds is string[] => Boolean(roleIds))
          .map(getDemonBluffSignature),
      ),
    [nightMessages, selectedPlayer],
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

  const redHerringCandidates = useMemo(
    () =>
      state.players.filter((player) => {
        const team = getRole(player.roleId).team;
        return team === "镇民" || team === "外来者";
      }),
    [state.players],
  );
  const fortuneTellerCandidates = useMemo(
    () => state.players,
    [state.players],
  );
  const singleTargetCandidates = useMemo(() => {
    if (!currentRole) return [];
    const playerChoice = getTroubleBrewingSkill(currentRole.id)?.playerChoice;
    const excludesSelf = Boolean(playerChoice?.excludeSelf);
    const requiresAlive = Boolean(playerChoice?.aliveOnly);
    const deadPlayers = state.players.filter((player) => !player.alive);
    const pool = currentRole.id === "undertaker" && deadPlayers.length
      ? deadPlayers
      : state.players;
    return pool.filter((player) => {
      if (excludesSelf && player.id === targetPlayerId) return false;
      if (requiresAlive && !player.alive) return false;
      return true;
    });
  }, [currentRole, state.players, targetPlayerId]);
  const calculatedChefResult = useMemo(() => {
    const orderedPlayers = [...state.players].sort(
      (left, right) => left.seat - right.seat,
    );
    if (orderedPlayers.length < 2) return 0;
    const isEvil = (player: Player) => {
      const team = getRole(player.roleId).team;
      return team === "爪牙" || team === "恶魔";
    };
    if (orderedPlayers.length === 2) {
      return isEvil(orderedPlayers[0]) && isEvil(orderedPlayers[1]) ? 1 : 0;
    }
    return orderedPlayers.reduce((total, player, index) => {
      const nextPlayer =
        orderedPlayers[(index + 1) % orderedPlayers.length];
      return total + (isEvil(player) && isEvil(nextPlayer) ? 1 : 0);
    }, 0);
  }, [state.players]);
  const empathNeighbors = useMemo(() => {
    if (currentRole?.id !== "empath" || !selectedPlayer) return [];
    const orderedPlayers = [...state.players].sort(
      (left, right) => left.seat - right.seat,
    );
    const empathIndex = orderedPlayers.findIndex(
      (player) => player.id === selectedPlayer.id,
    );
    if (empathIndex < 0 || orderedPlayers.length < 2) return [];
    const neighbors: Player[] = [];
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance < orderedPlayers.length; distance += 1) {
        const index =
          (empathIndex + direction * distance + orderedPlayers.length) %
          orderedPlayers.length;
        const candidate = orderedPlayers[index];
        if (!candidate.alive) continue;
        if (!neighbors.some((player) => player.id === candidate.id)) {
          neighbors.push(candidate);
        }
        break;
      }
    }
    return neighbors;
  }, [currentRole?.id, selectedPlayer, state.players]);
  const calculatedEmpathResult = empathNeighbors.filter((player) =>
    ["爪牙", "恶魔"].includes(getRole(player.roleId).team),
  ).length;
  const calculatedOracleResult = state.players.filter(
    (player) =>
      !player.alive &&
      ["爪牙", "恶魔"].includes(getRole(player.roleId).team),
  ).length;
  const nodashiiPoisonedPlayers = useMemo(() => {
    if (currentRole?.id !== "nodashii" || !selectedPlayer) return [];
    const ordered = [...state.players].sort(
      (left, right) => left.seat - right.seat,
    );
    const demonIndex = ordered.findIndex(
      (player) => player.id === selectedPlayer.id,
    );
    if (demonIndex < 0 || ordered.length < 2) return [];
    const found: Player[] = [];
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance < ordered.length; distance += 1) {
        const index =
          (demonIndex + direction * distance + ordered.length) %
          ordered.length;
        const candidate = ordered[index];
        if (getRole(candidate.roleId).team === "镇民") {
          if (!found.some((player) => player.id === candidate.id)) {
            found.push(candidate);
          }
          break;
        }
      }
    }
    return found;
  }, [currentRole?.id, selectedPlayer, state.players]);
  const latestPlayerSkillChoice = useMemo(() => {
    if (!targetPlayerId || !currentRole) return null;
    const choiceRound =
      getTroubleBrewingSkill(currentRole.id)?.playerChoice?.phase === "day" &&
      state.phase === "夜晚"
        ? Math.max(1, state.round - 1)
        : state.round;
    return playerMessages
      .filter(
        (message) =>
          message.player_id === targetPlayerId &&
          message.round === choiceRound,
      )
      .map((message) => ({
        message,
        choice: parsePlayerSkillChoiceMessage(message.body),
      }))
      .filter(
        (
          entry,
        ): entry is {
          message: PlayerMessage;
          choice: NonNullable<
            ReturnType<typeof parsePlayerSkillChoiceMessage>
          >;
        } => entry.choice?.roleId === currentRole.id,
      )
      .sort(
        (left, right) =>
          new Date(right.message.created_at).getTime() -
          new Date(left.message.created_at).getTime(),
      )[0]?.choice ?? null;
  }, [currentRole, playerMessages, state.phase, state.round, targetPlayerId]);
  const jugglerGuessRows = useMemo(() => {
    if (currentRole?.id !== "juggler") return [];
    return (latestPlayerSkillChoice?.guesses ?? []).map((guess) => {
      const target = state.players.find(
        (player) => player.id === guess.playerId,
      );
      const guessedRole = getRole(guess.roleId);
      const actualRole = getRole(target?.roleId ?? "");
      return {
        target,
        guessedRole,
        actualRole,
        correct: Boolean(target && target.roleId === guess.roleId),
      };
    });
  }, [currentRole?.id, latestPlayerSkillChoice?.guesses, state.players]);
  const hasJugglerSubmission = Boolean(
    currentRole?.id === "juggler" &&
      latestPlayerSkillChoice?.guesses !== undefined,
  );
  const calculatedJugglerResult = jugglerGuessRows.filter(
    (guess) => guess.correct,
  ).length;
  const ravenkeeperDeathNotified = nightMessages.some(
    (message) =>
      message.player_id === targetPlayerId &&
      message.round === state.round &&
      message.body === ravenkeeperDeathNotice,
  );
  const godfatherRevengeNotified = nightMessages.some(
    (message) =>
      message.player_id === targetPlayerId &&
      message.round === state.round &&
      message.body === triggeredAbilityNotices.godfather,
  );
  const pairSkillRole =
    currentRole?.id === "washerwoman" ||
    currentRole?.id === "librarian" ||
    currentRole?.id === "investigator" ||
    currentRole?.id === "fortune-teller" ||
    currentRole?.id === "chambermaid";

  useEffect(() => {
    if (!pairSkillRole) return;
    const candidateIds = new Set(
      fortuneTellerCandidates.map((player) => player.id),
    );
    const submittedFirst =
      currentRole?.id === "fortune-teller" ||
      currentRole?.id === "chambermaid"
        ? latestPlayerSkillChoice?.playerIds[0]
        : "";
    const submittedSecond =
      currentRole?.id === "fortune-teller" ||
      currentRole?.id === "chambermaid"
        ? latestPlayerSkillChoice?.playerIds[1]
        : "";
    const nextFirst =
      submittedFirst && candidateIds.has(submittedFirst)
        ? submittedFirst
        : candidateIds.has(skillTargets.first)
          ? skillTargets.first
      : fortuneTellerCandidates[0]?.id ?? "";
    const nextSecond =
      submittedSecond &&
      candidateIds.has(submittedSecond) &&
      submittedSecond !== nextFirst
        ? submittedSecond
        : candidateIds.has(skillTargets.second) &&
            skillTargets.second !== nextFirst
          ? skillTargets.second
        : fortuneTellerCandidates.find(
            (player) => player.id !== nextFirst,
          )?.id ?? "";
    if (
      nextFirst !== skillTargets.first ||
      nextSecond !== skillTargets.second
    ) {
      setSkillTargets({ first: nextFirst, second: nextSecond });
    }
  }, [
    currentRole?.id,
    fortuneTellerCandidates,
    latestPlayerSkillChoice?.playerIds,
    pairSkillRole,
    skillTargets.first,
    skillTargets.second,
  ]);

  useEffect(() => {
    const preferredTarget = latestPlayerSkillChoice?.playerIds[0];
    const candidateIds = new Set(singleTargetCandidates.map((player) => player.id));
    const nextTarget =
      preferredTarget && candidateIds.has(preferredTarget)
        ? preferredTarget
        : candidateIds.has(singleSkillTargetId)
          ? singleSkillTargetId
          : singleTargetCandidates[0]?.id ?? "";
    if (nextTarget !== singleSkillTargetId) setSingleSkillTargetId(nextTarget);
  }, [
    latestPlayerSkillChoice?.playerIds,
    singleSkillTargetId,
    singleTargetCandidates,
  ]);

  useEffect(() => {
    const needsSuccessor =
      currentRole?.id === "imp" &&
      Boolean(selectedPlayer) &&
      singleSkillTargetId === selectedPlayer?.id;
    if (!needsSuccessor) {
      if (impSuccessorPlayerId) setImpSuccessorPlayerId("");
      return;
    }
    const candidateIds = new Set(
      impSuccessorCandidates.map((player) => player.id),
    );
    const preferredSuccessor = latestPlayerSkillChoice?.playerIds[1];
    const nextSuccessor = preferredSuccessor && candidateIds.has(preferredSuccessor)
      ? preferredSuccessor
      : candidateIds.has(impSuccessorPlayerId)
        ? impSuccessorPlayerId
        : impSuccessorCandidates[0]?.id ?? "";
    if (nextSuccessor !== impSuccessorPlayerId) {
      setImpSuccessorPlayerId(nextSuccessor);
    }
  }, [
    currentRole?.id,
    impSuccessorCandidates,
    impSuccessorPlayerId,
    latestPlayerSkillChoice?.playerIds,
    selectedPlayer,
    singleSkillTargetId,
  ]);

  useEffect(() => {
    const target = state.players.find((player) => player.id === singleSkillTargetId);
    if (target) setRevealedSkillRoleId(target.roleId);
  }, [singleSkillTargetId, state.players]);

  useEffect(() => {
    if (currentRole?.id === "marionette") {
      const demon = state.players.find(
        (player) => getRole(player.roleId).team === "恶魔",
      );
      if (demon && singleSkillTargetId !== demon.id) {
        setSingleSkillTargetId(demon.id);
      }
      return;
    }
    if (currentRole?.id === "grandmother" && state.round <= 1) {
      const grandchild = state.players.find(
        (player) =>
          player.id !== targetPlayerId &&
          ["镇民", "外来者"].includes(getRole(player.roleId).team),
      );
      if (grandchild && singleSkillTargetId !== grandchild.id) {
        setSingleSkillTargetId(grandchild.id);
      }
    }
  }, [
    currentRole?.id,
    singleSkillTargetId,
    state.players,
    state.round,
    targetPlayerId,
  ]);

  useEffect(() => {
    if (currentRole?.id !== "vigormortis") return;
    const target = state.players.find(
      (player) => player.id === singleSkillTargetId,
    );
    if (!target || getRole(target.roleId).team !== "爪牙") return;
    const townsfolk = state.players.filter(
      (player) => getRole(player.roleId).team === "镇民",
    );
    if (!townsfolk.some((player) => player.id === skillTargets.second)) {
      setSkillTargets((current) => ({
        ...current,
        second: townsfolk[0]?.id ?? "",
      }));
    }
  }, [
    currentRole?.id,
    singleSkillTargetId,
    skillTargets.second,
    state.players,
  ]);

  const skillRoleOptions = useMemo(() => {
    const team =
      currentRole?.id === "washerwoman"
        ? "镇民"
        : currentRole?.id === "librarian"
          ? "外来者"
          : currentRole?.id === "investigator"
            ? "爪牙"
            : null;
    return team
      ? getScriptRoles(state.scriptId).filter((role) => role.team === team)
      : [];
  }, [currentRole?.id, state.scriptId]);

  useEffect(() => {
    if (!skillRoleOptions.some((role) => role.id === skillRoleId)) {
      setSkillRoleId(skillRoleOptions[0]?.id ?? "");
    }
  }, [skillRoleId, skillRoleOptions]);

  useEffect(() => {
    setLibrarianNoOutsider(false);
  }, [currentRole?.id]);

  const generateAutomaticPairSkill = useCallback(() => {
    const roleId = currentRole?.id;
    const targetTeam =
      roleId === "washerwoman"
        ? "镇民"
        : roleId === "librarian"
          ? "外来者"
          : roleId === "investigator"
            ? "爪牙"
            : null;
    if (!targetTeam) return;

    const matchingPlayers = state.players.filter(
      (player) => getRole(player.roleId).team === targetTeam,
    );
    if (roleId === "librarian" && matchingPlayers.length === 0) {
      setLibrarianNoOutsider(true);
      setSkillTargets({ first: "", second: "" });
      return;
    }

    setLibrarianNoOutsider(false);
    const preferredTrueTargets = matchingPlayers.filter(
      (player) => player.id !== targetPlayerId,
    );
    const trueTargetPool = preferredTrueTargets.length
      ? preferredTrueTargets
      : matchingPlayers;
    const trueTarget =
      trueTargetPool[Math.floor(Math.random() * trueTargetPool.length)];
    if (!trueTarget) {
      const fallbackPlayers = state.players.filter(
        (player) => player.id !== targetPlayerId,
      );
      setSkillTargets({
        first: fallbackPlayers[0]?.id ?? state.players[0]?.id ?? "",
        second: fallbackPlayers[1]?.id ?? state.players[1]?.id ?? "",
      });
      setSkillRoleId(skillRoleOptions[0]?.id ?? "");
      return;
    }

    const preferredDistractors = state.players.filter(
      (player) =>
        player.id !== trueTarget.id && player.id !== targetPlayerId,
    );
    const allDistractors = preferredDistractors.length
      ? preferredDistractors
      : state.players.filter((player) => player.id !== trueTarget.id);
    const sameTeamDistractors = allDistractors.filter(
      (player) => getRole(player.roleId).team === targetTeam,
    );
    const otherTeamDistractors = allDistractors.filter(
      (player) => getRole(player.roleId).team !== targetTeam,
    );
    const distractorPool =
      sameTeamDistractors.length && otherTeamDistractors.length
        ? Math.random() < 0.5
          ? sameTeamDistractors
          : otherTeamDistractors
        : sameTeamDistractors.length
          ? sameTeamDistractors
          : otherTeamDistractors;
    const distractor =
      distractorPool[Math.floor(Math.random() * distractorPool.length)];
    const swapOrder = Math.random() >= 0.5;
    setSkillTargets({
      first: swapOrder && distractor ? distractor.id : trueTarget.id,
      second: swapOrder
        ? trueTarget.id
        : distractor?.id ?? "",
    });
    setSkillRoleId(trueTarget.roleId);
  }, [
    currentRole?.id,
    skillRoleOptions,
    state.players,
    targetPlayerId,
  ]);

  const automaticSkillKey = useMemo(() => {
    if (
      currentRole?.id !== "washerwoman" &&
      currentRole?.id !== "librarian" &&
      currentRole?.id !== "investigator"
    ) {
      return "";
    }
    return [
      currentRole.id,
      targetPlayerId,
      state.scriptId,
      state.players
        .map((player) => `${player.id}:${player.seat}:${player.roleId}`)
        .join("|"),
    ].join("::");
  }, [currentRole?.id, state.players, state.scriptId, targetPlayerId]);

  useEffect(() => {
    if (!automaticSkillKey) {
      lastAutomaticSkillKeyRef.current = "";
      return;
    }
    if (lastAutomaticSkillKeyRef.current === automaticSkillKey) return;
    lastAutomaticSkillKeyRef.current = automaticSkillKey;
    generateAutomaticPairSkill();
  }, [automaticSkillKey, generateAutomaticPairSkill]);

  useEffect(() => {
    if (currentRole?.id === "chef") {
      setChefResult(calculatedChefResult);
    }
  }, [calculatedChefResult, currentRole?.id]);

  const redHerringPlayerId =
    state.players.find(isFortuneTellerRedHerring)?.id ?? "";
  const updateRedHerring = (playerId: string) => {
    onUpdate({
      players: setFortuneTellerRedHerring(
        state.players,
        playerId,
        currentStageLabel,
      ),
    });
  };
  const getNightPlayerLabel = (playerId: string) => {
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return "未知座位";
    const roomPlayer = roomPlayersById.get(player.id);
    const playerName = roomPlayer?.name || "未入座";
    return `${formatSeat(player.seat)} · ${playerName} · ${getRole(player.roleId).name}`;
  };
  const getNightPublicPlayerLabel = (playerId: string) => {
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return "未知座位";
    const roomPlayer = roomPlayersById.get(player.id);
    return `${formatSeat(player.seat)} · ${roomPlayer?.name || "未入座"}`;
  };
  const getNightSeatLabel = (playerId: string) => {
    const player = state.players.find((item) => item.id === playerId);
    return player ? formatSeat(player.seat) : "未知座位";
  };
  const selectedAbilityIssueLabels = (() => {
    if (!selectedPlayer) return [];
    const issues: string[] = [];
    if (selectedPlayerHasNoShownAbility) {
      issues.push(
        `真实身份为${getRole(selectedPlayer.roleId).name}，展示能力不产生真实效果`,
      );
    }
    const statusKinds = new Set(
      (nightStatusByPlayerId.get(selectedPlayer.id) ?? []).map(
        (mark) => mark.kind,
      ),
    );
    if (statusKinds.has("poisoned")) issues.push("当前中毒");
    if (statusKinds.has("drunk")) issues.push("当前醉酒");
    return [...new Set(issues)];
  })();
  const confirmSkillResult = ({
    title,
    sendLines,
    sentMatchesBaseline,
    baseline,
    caveats = [],
  }: {
    title: string;
    sendLines: string[];
    sentMatchesBaseline: boolean;
    baseline: string;
    caveats?: string[];
  }) => {
    const recipient = selectedPlayer
      ? `${formatSeat(selectedPlayer.seat)} · ${selectedPlayerName}`
      : selectedPlayerName;
    const judgement = selectedAbilityIssueLabels.length
      ? "辅助判断：结果可自由裁定（该角色能力当前可能失效）"
      : sentMatchesBaseline
        ? "辅助判断：符合当前真实身份基准"
        : "辅助判断：与当前真实身份基准不符";
    const issueLines = selectedAbilityIssueLabels.length
      ? [`能力状态：${selectedAbilityIssueLabels.join("、")}`]
      : [];
    const caveatLines = caveats.length
      ? ["规则例外：" + caveats.join("；")]
      : [];
    return new Promise<boolean>((resolve) => {
      setSkillResultConfirmation({
        title,
        recipient,
        sendLines,
        judgement,
        baseline,
        issueLines,
        caveatLines,
        mismatch:
          selectedAbilityIssueLabels.length === 0 && !sentMatchesBaseline,
        resolve,
      });
    });
  };
  const closeSkillResultConfirmation = (confirmed: boolean) => {
    if (!skillResultConfirmation) return;
    const { resolve } = skillResultConfirmation;
    setSkillResultConfirmation(null);
    resolve(confirmed);
  };
  const conversation = useMemo(
    () =>
      [
        ...nightMessages
          .filter((message) => message.player_id === targetPlayerId)
          .map((message) => {
            const skillBody = getRoleSkillMessage(message.body);
            return {
              ...message,
              body: getNightMessageDisplayBody(message.body),
              direction: "outgoing" as const,
              label: `上帝 · ${getGameStageLabel("夜晚", message.round)} · ${getRole(message.role_id).name}${skillBody ? " · 技能" : ""}`,
              avatar: "上",
            };
          }),
        ...playerMessages
          .filter((message) => message.player_id === targetPlayerId)
          .map((message) => {
            const skillChoice = parsePlayerSkillChoiceMessage(message.body);
            return {
              ...message,
              body: getPlayerMessageDisplayBody(message.body),
              direction: "incoming" as const,
              label: `${selectedPlayerName} · 第 ${message.round} 回合${skillChoice ? " · 技能选择" : ""}`,
              avatar: selectedPlayer
                ? formatSeat(selectedPlayer.seat)
                : "未知",
            };
          }),
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
  const canUseSkill =
    Boolean(room) &&
    Boolean(currentRole) &&
    Boolean(currentAction?.canAct) &&
    Boolean(selectedRoomPlayer?.is_claimed) &&
    !sending;
  const canResolveRoleReveal =
    currentRole?.id !== "ravenkeeper" || Boolean(latestPlayerSkillChoice);

  const sendDemonBluffs = async () => {
    if (
      !demonBluffsAvailable ||
      demonBluffRoleIds.length !== 3 ||
      demonBluffsAlreadySent ||
      !selectedPlayer ||
      !selectedRoomPlayer?.is_claimed ||
      !canUseSkill
    ) {
      return;
    }
    setSendingBluffs(true);
    setSendError("");
    try {
      await onSendMessage({
        playerId: selectedPlayer.id,
        roleId: "imp",
        body: buildDemonBluffMessage(demonBluffRoleIds),
      });
    } catch {
      setSendError(
        selectedRoomPlayer?.is_claimed
          ? "不在场身份发送失败，请稍后重试"
          : "小恶魔尚未入座，暂时无法接收身份",
      );
    } finally {
      setSendingBluffs(false);
    }
  };

  const submitMessage = async () => {
    const body = messageBody.trim();
    if (!currentRole || !selectedPlayer || !body || !canSend) return;
    setSendingMode("message");
    setSendError("");
    try {
      await onSendMessage({
        playerId: selectedPlayer.id,
        roleId: currentRole.id,
        body,
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
      setSendingMode(null);
    }
  };

  const submitSkill = async (body: string) => {
    if (!currentRole || !selectedPlayer || !body.trim() || !canUseSkill) {
      return false;
    }
    setSendingMode("skill");
    setSendError("");
    try {
      await onSendMessage({
        playerId: selectedPlayer.id,
        roleId: currentRole.id,
        body: buildRoleSkillMessage(body),
      });
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /claimed player/i.test(message)
          ? "该玩家尚未入座，暂时无法接收信息"
          : /function|night_messages|schema cache/i.test(message)
            ? "夜间消息数据库尚未配置"
            : "技能信息发送失败，请稍后重试",
      );
      return false;
    } finally {
      setSendingMode(null);
    }
  };

  const submitSkillToPlayer = async (
    playerId: string,
    roleId: string,
    body: string,
    asSkill = true,
  ) => {
    if (!body.trim() || sending) return false;
    setSendingMode("skill");
    setSendError("");
    try {
      await onSendMessage({
        playerId,
        roleId,
        body: asSkill ? buildRoleSkillMessage(body) : body,
      });
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /claimed player/i.test(message)
          ? "目标玩家尚未入座，暂时无法接收信息"
          : "技能信息发送失败，请稍后重试",
      );
      return false;
    } finally {
      setSendingMode(null);
    }
  };

  const pairTargetsReady =
    Boolean(skillTargets.first) &&
    Boolean(skillTargets.second) &&
    skillTargets.first !== skillTargets.second;
  const sendPairRoleSkill = async () => {
    if (
      !currentRole ||
      (currentRole.id === "librarian" && librarianNoOutsider
        ? false
        : !pairTargetsReady || !skillRoleId)
    ) {
      return;
    }
    const first = getNightPublicPlayerLabel(skillTargets.first);
    const second = getNightPublicPlayerLabel(skillTargets.second);
    const selectedInfoRole = getRole(skillRoleId);
    const body =
      currentRole.id === "washerwoman"
        ? `${first} 和 ${second} 中，有一人是${selectedInfoRole.name}`
        : currentRole.id === "librarian"
          ? librarianNoOutsider
            ? "本局没有外来者"
            : `${first} 和 ${second} 中，有一人是${selectedInfoRole.name}`
          : `${first} 和 ${second} 中，有一人是${selectedInfoRole.name}`;
    const targetPlayers = [skillTargets.first, skillTargets.second]
      .map((playerId) => state.players.find((player) => player.id === playerId))
      .filter((player): player is Player => Boolean(player));
    const actualOutsiders = state.players.filter(
      (player) => getRole(player.roleId).team === "外来者",
    );
    const sentMatchesBaseline =
      currentRole.id === "librarian" && librarianNoOutsider
        ? actualOutsiders.length === 0
        : targetPlayers.some((player) => player.roleId === skillRoleId);
    const baseline =
      currentRole.id === "librarian" && librarianNoOutsider
        ? actualOutsiders.length
          ? `场上实际有外来者：${actualOutsiders.map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`).join("、")}`
          : "场上确实没有外来者"
        : `两名目标的真实身份为${targetPlayers.map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`).join("、") || "未知"}`;
    const hasRelevantRegistrationRole =
      currentRole.id === "investigator"
        ? targetPlayers.some((player) => player.roleId === "recluse")
        : targetPlayers.some((player) => player.roleId === "spy") ||
          (currentRole.id === "librarian" &&
            librarianNoOutsider &&
            actualOutsiders.some((player) => player.roleId === "recluse"));
    const caveats = hasRelevantRegistrationRole
      ? [
          currentRole.id === "investigator"
            ? "陌客可能被登记为爪牙或特定爪牙角色"
            : currentRole.id === "librarian" && librarianNoOutsider
              ? "陌客可能被登记为非外来者，最终信息可由上帝裁定"
              : "间谍可能被登记为镇民或外来者及相应角色",
        ]
      : [];
    if (
      !(await confirmSkillResult({
        title: `确认发送${currentRole.name}信息？`,
        sendLines: [`发送内容：${body}`],
        sentMatchesBaseline,
        baseline,
        caveats,
      }))
    ) return;
    void submitSkill(body);
  };

  const sendChefResult = async () => {
    const registrationRoles = state.players.filter((player) =>
      ["recluse", "spy"].includes(player.roleId),
    );
    if (!(await confirmSkillResult({
      title: "确认发送厨师结果？",
      sendLines: [`发送结果：${chefResult} 对`],
      sentMatchesBaseline: chefResult === calculatedChefResult,
      baseline: `按真实阵营计算为 ${calculatedChefResult} 对相邻邪恶玩家`,
      caveats: registrationRoles.length
        ? [`${registrationRoles.map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`).join("、")}可能改变登记结果`]
        : [],
    }))) return;
    void submitSkill(`相邻邪恶玩家共有 ${chefResult} 对`);
  };

  const sendEmpathResult = async (count: number) => {
    const registrationRoles = empathNeighbors.filter((player) =>
      ["recluse", "spy"].includes(player.roleId),
    );
    if (!(await confirmSkillResult({
      title: "确认发送共情者结果？",
      sendLines: [`发送结果：${count} 名邪恶玩家`],
      sentMatchesBaseline: count === calculatedEmpathResult,
      baseline: `两名存活邻座为${empathNeighbors.map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`).join("、") || "未找到"}，按真实阵营计算为 ${calculatedEmpathResult}`,
      caveats: registrationRoles.length
        ? [`${registrationRoles.map((player) => getRole(player.roleId).name).join("、")}可能改变善恶登记`]
        : [],
    }))) return;
    void submitSkill(`本晚两名存活邻座中有 ${count} 名邪恶玩家`);
  };

  const sendSingleTargetSkill = async () => {
    if (!currentRole || !singleSkillTargetId) return;
    if (
      currentRole.id === "godfather" &&
      (!godfatherRevengeNotified || !latestPlayerSkillChoice)
    ) {
      return;
    }
    const targetLabel = getNightSeatLabel(singleSkillTargetId);
    const targetIsSelf = singleSkillTargetId === selectedPlayer?.id;
    const impSuccessor =
      currentRole.id === "imp" && targetIsSelf
        ? impSuccessorCandidates.find(
            (player) => player.id === impSuccessorPlayerId,
          )
        : undefined;
    if (currentRole.id === "imp" && targetIsSelf && !impSuccessor) return;
    if (
      currentRole.id === "imp" &&
      targetIsSelf &&
      impSuccessor &&
      !window.confirm(
        `确认小恶魔自杀，并将小恶魔身份传给${getNightSeatLabel(impSuccessor.id)}？`,
      )
    ) {
      return;
    }
    const body =
      currentRole.id === "monk"
        ? "本晚保护目标：" + targetLabel
        : currentRole.id === "butler"
          ? "本晚主人：" + targetLabel
          : currentRole.id === "poisoner"
            ? "本晚中毒目标：" + targetLabel
            : currentRole.id === "imp"
              ? "本晚攻击目标：" +
                targetLabel +
                (impSuccessor
                  ? `（自杀，恶魔传给${getNightSeatLabel(impSuccessor.id)}）`
                  : "")
              : currentRole.id === "pukka"
                ? "本晚新中毒目标：" + targetLabel + "；结算上一名中毒者死亡并恢复健康"
                : currentRole.id === "vigormortis"
                  ? "本晚攻击目标：" + targetLabel +
                    (getRole(state.players.find((player) => player.id === singleSkillTargetId)?.roleId ?? "").team === "爪牙"
                      ? `；目标为爪牙，保留能力，${getNightSeatLabel(skillTargets.second)}中毒`
                      : "")
                  : currentRole.id === "nodashii"
                    ? "本晚攻击目标：" + targetLabel +
                      `；${nodashiiPoisonedPlayers.map((player) => formatSeat(player.seat)).join("、") || "未找到镇民"}中毒`
                    : currentRole.id === "godfather"
                      ? "本晚复仇目标：" + targetLabel
              : currentRole.id === "slayer"
                ? "本局射击目标：" + targetLabel
                : "本轮选择目标：" + targetLabel;
    const sent = await submitSkill(body);
    if (
      !sent ||
      selectedPlayerHasNoShownAbility ||
      currentRole.id !== "imp" ||
      !targetIsSelf ||
      !impSuccessor
    ) {
      return;
    }
    onUpdate({
      players: state.players.map((player) => {
        if (player.id === selectedPlayer?.id) return { ...player, alive: false };
        if (player.id === impSuccessor.id) {
          return {
            ...player,
            roleId: "imp",
            drunkRoleId: "",
            identityMessage: "你已继承小恶魔身份。",
          };
        }
        return player;
      }),
    });
  };

  const sendNightwatchmanNotice = async () => {
    if (!selectedPlayer || !singleSkillTargetId) return;
    const target = state.players.find(
      (player) => player.id === singleSkillTargetId,
    );
    if (!target) return;
    const targetLabel = formatSeat(target.seat);
    const sourceLabel = formatSeat(selectedPlayer.seat);
    if (selectedPlayerHasNoShownAbility) {
      await submitSkillToPlayer(
        selectedPlayer.id,
        "nightwatchman",
        `你选择了${targetLabel}接收守夜人通知`,
      );
      return;
    }
    const sent = await submitSkillToPlayer(
      target.id,
      getPlayerVisibleRoleId(target.roleId, target.drunkRoleId),
      `${sourceLabel}是守夜人`,
      false,
    );
    if (sent) {
      await submitSkillToPlayer(
        selectedPlayer.id,
        "nightwatchman",
        `已向${targetLabel}确认你的守夜人身份`,
      );
    }
  };

  const sendMarionetteNotice = () => {
    if (!selectedPlayer || !singleSkillTargetId) return;
    void submitSkillToPlayer(
      singleSkillTargetId,
      state.players.find((player) => player.id === singleSkillTargetId)
        ?.roleId ?? "imp",
      `${formatSeat(selectedPlayer.seat)}是提线木偶`,
      false,
    );
  };

  const sendRoleRevealSkill = async () => {
    if (
      !currentRole ||
      !singleSkillTargetId ||
      !revealedSkillRoleId ||
      !canResolveRoleReveal
    ) return;
    const targetLabel = getNightSeatLabel(singleSkillTargetId);
    const shownRole = getRole(revealedSkillRoleId);
    const body = currentRole.id === "undertaker"
      ? "今天被处决的" + targetLabel + "是" + shownRole.name
      : "你查验的" + targetLabel + "是" + shownRole.name;
    const target = state.players.find(
      (player) => player.id === singleSkillTargetId,
    );
    const actualRole = getRole(target?.roleId ?? "");
    const caveats = target && ["recluse", "spy"].includes(target.roleId)
      ? [`${actualRole.name}可能登记为其他阵营或角色`]
      : [];
    if (!(await confirmSkillResult({
      title: `确认发送${currentRole.name}角色信息？`,
      sendLines: [`查验目标：${targetLabel}`, `发送角色：${shownRole.name}`],
      sentMatchesBaseline: Boolean(target) && target?.roleId === revealedSkillRoleId,
      baseline: target
        ? `${targetLabel}的真实身份是${actualRole.name}`
        : "未找到查验目标",
      caveats,
    }))) return;
    void submitSkill(body);
  };

  const notifyRavenkeeperDeath = async () => {
    if (!selectedPlayer || currentRole?.id !== "ravenkeeper" || !canUseSkill) {
      return;
    }
    if (selectedPlayer.alive) {
      const notified = await onSetPlayerAlive(selectedPlayer.id, false);
      if (!notified) setSendError("死亡状态或通知发送失败，请稍后重试");
      return;
    }
    await submitSkillToPlayer(
      selectedPlayer.id,
      "ravenkeeper",
      ravenkeeperDeathNotice,
      false,
    );
  };

  const notifyGodfatherRevenge = async () => {
    if (
      !selectedPlayer ||
      currentRole?.id !== "godfather" ||
      state.round <= 1 ||
      !canUseSkill
    ) {
      return;
    }
    if (!window.confirm("确认今天有外来者死亡，并通知教父发动能力？")) {
      return;
    }
    await submitSkillToPlayer(
      selectedPlayer.id,
      "godfather",
      triggeredAbilityNotices.godfather,
      false,
    );
  };

  const sendSpyGrimoire = () => {
    const snapshot = [...state.players]
      .sort((left, right) => left.seat - right.seat)
      .map((player) => {
        const disguise = player.drunkRoleId ? " / 展示" + getRole(player.drunkRoleId).name : "";
        const deathMark = player.alive ? "" : " 死亡";
        return formatSeat(player.seat) + " " + getRole(player.roleId).name + disguise + deathMark;
      })
      .join("；");
    const actionLines = getSpyNightActionLines(
      state.players,
      nightMessages,
      state.round,
    );
    const actionSummary = actionLines.length
      ? `本晚行动：\n${actionLines.map((line) => `- ${line}`).join("\n")}`
      : "本晚行动：暂无已记录行动";
    void submitSkill(`当前魔典：${snapshot}\n\n${actionSummary}`);
  };

  const sendScarletWomanResult = async (triggered: boolean) => {
    const aliveCount = state.players.filter((player) => player.alive).length;
    const deadDemons = state.players.filter(
      (player) =>
        !player.alive && getRole(player.roleId).team === "恶魔",
    );
    const deadRecluses = state.players.filter(
      (player) => !player.alive && player.roleId === "recluse",
    );
    const baselineTriggered = aliveCount >= 5 && deadDemons.length > 0;
    if (!(await confirmSkillResult({
      title: "确认发送红唇女郎继承结果？",
      sendLines: [
        `发送结果：${triggered ? "已继承小恶魔能力" : "本晚未触发恶魔继承"}`,
      ],
      sentMatchesBaseline: triggered === baselineTriggered,
      baseline: `${aliveCount} 名玩家存活；${
        deadDemons.length
          ? `已死亡的真实恶魔为${deadDemons
              .map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`)
              .join("、")}`
          : "没有真实恶魔死亡"
      }，按真实身份基准${baselineTriggered ? "应触发继承" : "不应触发继承"}`,
      caveats: deadRecluses.length
        ? [
            `${deadRecluses
              .map((player) => formatSeat(player.seat))
              .join("、")}是陌客，可能被登记为恶魔并影响继承判定`,
          ]
        : [],
    }))) return;
    void submitSkill(
      triggered ? "已继承小恶魔能力" : "本晚未触发恶魔继承",
    );
  };

  const sendGrandmotherInfo = async () => {
    if (!singleSkillTargetId || !revealedSkillRoleId) return;
    const target = state.players.find(
      (player) => player.id === singleSkillTargetId,
    );
    const targetLabel = getNightSeatLabel(singleSkillTargetId);
    const shownRole = getRole(revealedSkillRoleId);
    const actualRole = getRole(target?.roleId ?? "");
    if (!(await confirmSkillResult({
      title: "确认发送祖母首夜信息？",
      sendLines: [
        `孙辈玩家：${targetLabel}`,
        `发送角色：${shownRole.name}`,
      ],
      sentMatchesBaseline: Boolean(target) && target?.roleId === revealedSkillRoleId,
      baseline: target
        ? `${targetLabel}的真实身份是${actualRole.name}，真实阵营为${["镇民", "外来者"].includes(actualRole.team) ? "善良" : "邪恶"}`
        : "未找到选择的孙辈玩家",
      caveats: target?.roleId === "spy"
        ? ["间谍可能被登记为善良角色及相应角色"]
        : [],
    }))) return;
    void submitSkill(`你的孙辈是${targetLabel}，角色是${shownRole.name}`);
  };

  const sendFortuneTellerResult = async (hasDemon: boolean) => {
    if (!pairTargetsReady) return;
    const first = getNightSeatLabel(skillTargets.first);
    const second = getNightSeatLabel(skillTargets.second);
    const result = hasDemon ? "有恶魔" : "没有恶魔";
    const targets = [skillTargets.first, skillTargets.second]
      .map((playerId) => state.players.find((player) => player.id === playerId))
      .filter((player): player is Player => Boolean(player));
    const demonTargets = targets.filter(
      (player) => getRole(player.roleId).team === "恶魔",
    );
    const redHerringTargets = targets.filter(isFortuneTellerRedHerring);
    const baselineHasDemon = demonTargets.length > 0 || redHerringTargets.length > 0;
    const baselineReasons = [
      ...demonTargets.map(
        (player) => `${formatSeat(player.seat)}是真实恶魔`,
      ),
      ...redHerringTargets.map(
        (player) => `${formatSeat(player.seat)}是占卜师宿敌`,
      ),
    ];
    const recluseTargets = !baselineHasDemon
      ? targets.filter((player) => player.roleId === "recluse")
      : [];
    if (!(await confirmSkillResult({
      title: "确认发送占卜结果？",
      sendLines: [
        `查验目标：${first}、${second}`,
        `发送结果：${result}`,
      ],
      sentMatchesBaseline: hasDemon === baselineHasDemon,
      baseline: baselineHasDemon
        ? `应为“有恶魔”（${baselineReasons.join("、")}）`
        : "两名目标均非真实恶魔，也不是占卜师宿敌，应为“没有恶魔”",
      caveats: recluseTargets.length
        ? [`${recluseTargets.map((player) => formatSeat(player.seat)).join("、")}是陌客，可被登记为恶魔`]
        : [],
    }))) return;

    void submitSkill(
      `本晚查验${first}和${second}：${result}`,
    );
  };

  const sendJugglerResult = async (count: number) => {
    if (!hasJugglerSubmission) {
      if (
        !window.confirm(
          "玩家尚未通过系统提交首日猜测，无法自动核对。确认按上帝线下记录发送该数字？",
        )
      ) {
        return;
      }
      void submitSkill(`你在首日的公开猜测中猜对了 ${count} 个`);
      return;
    }
    const registrationRows = jugglerGuessRows.filter(
      (guess) =>
        guess.target && ["recluse", "spy"].includes(guess.target.roleId),
    );
    const detail = jugglerGuessRows.length
      ? jugglerGuessRows
          .map(
            (guess, index) =>
              `${index + 1}. ${
                guess.target ? formatSeat(guess.target.seat) : "未知座位"
              }猜${guess.guessedRole.name}，实际为${
                guess.actualRole.name
              }（${guess.correct ? "正确" : "错误"}）`,
          )
          .join("；")
      : "玩家提交了 0 项猜测";
    if (
      !(await confirmSkillResult({
        title: "确认发送杂耍艺人结果？",
        sendLines: [
          `玩家共提交 ${jugglerGuessRows.length} 项猜测`,
          `发送结果：猜对 ${count} 个`,
        ],
        sentMatchesBaseline: count === calculatedJugglerResult,
        baseline: `${detail}；按真实身份计算共猜对 ${calculatedJugglerResult} 个`,
        caveats: registrationRows.length
          ? [
              `${registrationRows
                .map(
                  (guess) =>
                    `${formatSeat(guess.target?.seat)} ${
                      guess.actualRole.name
                    }`,
                )
                .join("、")}可能登记为其他角色`,
            ]
          : [],
      }))
    ) {
      return;
    }
    void submitSkill(`你在首日的公开猜测中猜对了 ${count} 个`);
  };
  const sendOracleResult = async (count: number) => {
    const registrationRoles = state.players.filter(
      (player) => !player.alive && ["recluse", "spy"].includes(player.roleId),
    );
    if (!(await confirmSkillResult({
      title: "确认发送神谕者结果？",
      sendLines: [`发送结果：${count} 名邪恶玩家`],
      sentMatchesBaseline: count === calculatedOracleResult,
      baseline: `按死亡玩家真实阵营计算为 ${calculatedOracleResult} 名邪恶玩家`,
      caveats: registrationRoles.length
        ? [`死亡玩家中的${registrationRoles.map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`).join("、")}可能改变善恶登记`]
        : [],
    }))) return;
    void submitSkill(`死亡玩家中有 ${count} 名邪恶玩家`);
  };

  const sendGamblerResult = async (reportedCorrect: boolean) => {
    const target = state.players.find(
      (player) => player.id === latestPlayerSkillChoice?.playerIds[0],
    );
    const guessedRole = getRole(
      latestPlayerSkillChoice?.roleIdChoice ?? "",
    );
    const actualRole = getRole(target?.roleId ?? "");
    const baselineCorrect = Boolean(
      target && latestPlayerSkillChoice?.roleIdChoice === target.roleId,
    );
    const targetLabel = target ? formatSeat(target.seat) : "未知目标";
    if (!(await confirmSkillResult({
      title: "确认发送赌徒判定？",
      sendLines: [
        `玩家猜测：${targetLabel}是${guessedRole.name}`,
        `发送结果：${reportedCorrect ? "正确，赌徒存活" : "错误，赌徒死亡"}`,
      ],
      sentMatchesBaseline: reportedCorrect === baselineCorrect,
      baseline: target
        ? `${targetLabel}的真实身份是${actualRole.name}，猜测${baselineCorrect ? "正确" : "错误"}`
        : "未找到玩家选择的目标",
      caveats: target && ["recluse", "spy"].includes(target.roleId)
        ? [`${actualRole.name}可能登记为其他角色`]
        : [],
    }))) return;
    void submitSkill(
      `${latestPlayerSkillChoice?.summary ?? "本晚猜测"}：${reportedCorrect ? "正确，赌徒存活" : "错误，赌徒死亡"}`,
    );
  };

  const sendAlignmentResult = async (reportedGood: boolean) => {
    if (!currentRole || (currentRole.id !== "moonchild" && currentRole.id !== "klutz")) return;
    const target = state.players.find(
      (player) => player.id === latestPlayerSkillChoice?.playerIds[0],
    );
    const actualRole = getRole(target?.roleId ?? "");
    const baselineGood = Boolean(
      target && ["镇民", "外来者"].includes(actualRole.team),
    );
    const targetLabel = target ? formatSeat(target.seat) : "未知目标";
    const outcome = currentRole.id === "moonchild"
      ? reportedGood
        ? "目标为善良，今晚死亡"
        : "目标不按善良判定，不会因此死亡"
      : reportedGood
        ? "目标为善良，游戏继续"
        : "目标为邪恶，你的阵营落败";
    if (!(await confirmSkillResult({
      title: `确认发送${currentRole.name}判定？`,
      sendLines: [`选择目标：${targetLabel}`, `发送结果：${outcome}`],
      sentMatchesBaseline: reportedGood === baselineGood,
      baseline: target
        ? `${targetLabel}的真实身份是${actualRole.name}，真实阵营为${baselineGood ? "善良" : "邪恶"}`
        : "未找到玩家选择的目标",
      caveats: target && ["recluse", "spy"].includes(target.roleId)
        ? [`${actualRole.name}可能改变善恶登记`]
        : [],
    }))) return;
    void submitSkill(`${latestPlayerSkillChoice?.summary ?? "选择目标"}：${outcome}`);
  };

  return (
    <div className="night-layout">
      <section className="night-main">
        <section className="night-action-section">
          <GameStageToolbar state={state} onUpdate={onUpdate} />
          <div className="panel-heading night-action-heading">
            <div>
              <p className="eyebrow">NIGHT ORDER · {getGameStageLabel(state.phase, state.round)}</p>
              <h2>行动角色列表</h2>
            </div>
            <div className="night-nav">
              <button className="icon-button" onClick={() => onChangeNight(-1)} disabled={!nightActions.length} title="上一个行动"><ChevronLeft size={17} /></button>
              <button className="icon-button" onClick={() => onChangeNight(1)} disabled={!nightActions.length} title="下一个行动"><ChevronRight size={17} /></button>
            </div>
          </div>
          {currentAction ? (
            <div className="night-list">
              {nightActions.map((action, index) => {
                const statusMarks = action.playerId
                  ? nightStatusByPlayerId.get(action.playerId) ?? []
                  : [];
                const isDead = statusMarks.some((mark) => mark.kind === "dead");
                return (
                  <button
                    className={[
                      "night-row",
                      state.nightIndex === index ? "active" : "",
                      isDead ? "is-dead" : "",
                      statusMarks.some((mark) => mark.kind === "poisoned")
                        ? "is-poisoned"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={`${action.id}-${action.playerId ?? "na"}-${index}`}
                    disabled={!action.canAct}
                    onClick={() => onSelectNight(index)}
                  >
                    <span
                      className={`mini-role-icon ${teamLabels[action.role.team]}`}
                    >
                      <RoleIcon roleId={action.role.id} size={16} />
                    </span>
                    <span className="night-role-name">
                      <span className="night-role-title">
                        <span>{action.name}</span>
                        {action.seat ? (
                          <small className="night-role-seat">
                            {formatSeat(action.seat)}
                          </small>
                        ) : null}
                      </span>
                      {action.isDisguised ? (
                        <b className="night-role-truth">
                          真实：{action.actualRole.name}
                        </b>
                      ) : null}
                      {statusMarks.length ? (
                        <span className="night-status-marks" aria-label="状态标记">
                          {statusMarks.map((mark) => (
                            <b
                              className={`night-status-mark kind-${mark.kind}`}
                              key={mark.key}
                              title={mark.label}
                            >
                              {mark.label}
                            </b>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="night-role-team">{action.role.team}</span>
                    {state.nightIndex === index ? (
                      <span className="on-air">进行中</span>
                    ) : null}
                  </button>
                );
              })}
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
          <>
            <section className="night-current-role-section">
              <div className="night-current-role-header">
                <div className="night-current-role-heading">
                  <span
                    className={`mini-role-icon ${teamLabels[currentRole.team]}`}
                  >
                    <RoleIcon roleId={currentRole.id} size={22} />
                  </span>
                  <div>
                    <p className="eyebrow">CURRENT NIGHT ROLE</p>
                    <h3>当前角色 · {currentRole.name}</h3>
                    <small>{currentRole.short}</small>
                    {currentSkillDefinition ? (
                      <span className="night-role-interaction">
                        {currentSkillDefinition.phase} · {currentSkillDefinition.interaction}
                      </span>
                    ) : null}
                  </div>
                </div>
                <label className="night-chat-recipient">
                  <span>技能接收玩家</span>
                  <CompactSelect
                    value={targetPlayerId}
                    onChange={(event) => setTargetPlayerId(event.target.value)}
                    disabled={!rolePlayers.length || sending}
                  >
                    {rolePlayers.map((player) => {
                      const roomPlayer = roomPlayersById.get(player.id);
                      const playerName =
                        roomPlayer?.is_claimed && roomPlayer.name
                          ? roomPlayer.name
                          : "未入座";
                      const actualRole = getRole(player.roleId);
                      const visibleRole = getRole(
                        getPlayerVisibleRoleId(
                          player.roleId,
                          player.drunkRoleId,
                        ),
                      );
                      const roleLabel =
                        actualRole.id === visibleRole.id
                          ? visibleRole.name
                          : `${visibleRole.name}（真实：${actualRole.name}）`;
                      return (
                        <option key={player.id} value={player.id}>
                          {formatSeat(player.seat)}
                          {` · ${playerName} · ${roleLabel}`}
                        </option>
                      );
                    })}
                  </CompactSelect>
                </label>
              </div>
              {selectedPlayerHasNoShownAbility ? (
                <div className="night-disguise-warning">
                  <AlertTriangle size={14} />
                  <span>
                    该玩家真实身份是{getRole(selectedPlayer?.roleId ?? "drunk").name}，
                    展示能力不会产生真实效果；可以发送误导信息，但不要实际改变其他玩家状态。
                  </span>
                </div>
              ) : null}
            {currentRole.id === "fortune-teller" ? (
              <div className="fortune-teller-setting">
                <div>
                  <Target size={15} />
                  <span>
                    <strong>占卜师宿敌</strong>
                    <small>该善良玩家始终被占卜师视为恶魔</small>
                  </span>
                </div>
                <div className="fortune-teller-setting-control">
                  <CompactSelect
                    value={redHerringPlayerId}
                    onChange={(event) => updateRedHerring(event.target.value)}
                    aria-label="选择占卜师宿敌"
                  >
                    <option value="">尚未设置</option>
                    {redHerringCandidates.map((player) => (
                      <option value={player.id} key={player.id}>
                        {getNightPlayerLabel(player.id)}
                      </option>
                    ))}
                  </CompactSelect>
                  <button
                    className="icon-button"
                    title="随机选择一名善良玩家"
                    aria-label="随机选择占卜师宿敌"
                    disabled={!redHerringCandidates.length}
                    onClick={() => {
                      const player =
                        redHerringCandidates[
                          Math.floor(
                            Math.random() * redHerringCandidates.length,
                          )
                        ];
                      if (player) updateRedHerring(player.id);
                    }}
                  >
                    <Dices size={15} />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="night-skill-composer">
              {currentRole.id === "washerwoman" ||
              currentRole.id === "librarian" ||
              currentRole.id === "investigator" ? (
                <div className="night-skill-panel">
                <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span>
                        <ScrollText size={14} />
                        {currentRole.name}技能
                      </span>
                      <small>{currentRole.short}</small>
                    </div>
                    <div className="night-skill-heading-actions">
                      <button
                        className="secondary-button night-skill-reroll"
                        disabled={sending || state.players.length < 2}
                        onClick={generateAutomaticPairSkill}
                      >
                        <Dices size={13} />
                        重新生成
                      </button>
                    </div>
                  </div>
                  {currentRole.id === "librarian" ? (
                    <div className="night-skill-mode">
                      <button
                        className={!librarianNoOutsider ? "active" : ""}
                        onClick={() => setLibrarianNoOutsider(false)}
                      >
                        展示外来者
                      </button>
                      <button
                        className={librarianNoOutsider ? "active" : ""}
                        onClick={() => setLibrarianNoOutsider(true)}
                      >
                        没有外来者
                      </button>
                    </div>
                  ) : null}
                  {!librarianNoOutsider ||
                  currentRole.id !== "librarian" ? (
                    <div className="night-skill-fields">
                      <div className="night-skill-target-grid">
                        <CompactSelect
                          value={skillTargets.first}
                          disabled={sending}
                          aria-label={`${currentRole.name}第一名信息玩家`}
                          onChange={(event) =>
                            setSkillTargets((current) => ({
                              ...current,
                              first: event.target.value,
                            }))
                          }
                        >
                          {fortuneTellerCandidates.map((player) => (
                            <option
                              value={player.id}
                              key={player.id}
                              disabled={player.id === skillTargets.second}
                            >
                              {getNightPlayerLabel(player.id)}
                            </option>
                          ))}
                        </CompactSelect>
                        <CompactSelect
                          value={skillTargets.second}
                          disabled={sending}
                          aria-label={`${currentRole.name}第二名信息玩家`}
                          onChange={(event) =>
                            setSkillTargets((current) => ({
                              ...current,
                              second: event.target.value,
                            }))
                          }
                        >
                          {fortuneTellerCandidates.map((player) => (
                            <option
                              value={player.id}
                              key={player.id}
                              disabled={player.id === skillTargets.first}
                            >
                              {getNightPlayerLabel(player.id)}
                            </option>
                          ))}
                        </CompactSelect>
                      </div>
                      <label className="night-skill-role-field">
                        <span>展示角色</span>
                        <CompactSelect
                          value={skillRoleId}
                          disabled={sending}
                          onChange={(event) =>
                            setSkillRoleId(event.target.value)
                          }
                        >
                          {skillRoleOptions.map((role) => (
                            <option value={role.id} key={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </CompactSelect>
                      </label>
                    </div>
                  ) : null}
                  <button
                    className="primary-button night-skill-submit"
                    disabled={
                      !canUseSkill ||
                      (currentRole.id === "librarian" &&
                      librarianNoOutsider
                        ? false
                        : !pairTargetsReady || !skillRoleId)
                    }
                    onClick={sendPairRoleSkill}
                  >
                    <Send size={15} />
                    {sendingMode === "skill"
                      ? "发送中"
                      : librarianNoOutsider &&
                          currentRole.id === "librarian"
                        ? "发送“没有外来者”"
                        : "发送技能信息"}
                  </button>
                </div>
              ) : null}
              {currentRole.id === "chef" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span>
                        <ScrollText size={14} />
                        厨师结果
                      </span>
                      <small>{currentRole.short}</small>
                    </div>
                  </div>
                  <div className="night-skill-result-grid">
                    {[0, 1, 2, 3, 4].map((count) => (
                      <button
                        className={`secondary-button ${
                          chefResult === count ? "active" : ""
                        }`}
                        key={count}
                        disabled={sending}
                        onClick={() => setChefResult(count)}
                      >
                        {count}
                        <small>对</small>
                      </button>
                    ))}
                  </div>
                  <div className="night-skill-footer">
                    <button
                      className="secondary-button night-skill-reroll"
                      disabled={sending}
                      onClick={() => setChefResult(calculatedChefResult)}
                    >
                      <RotateCcw size={13} />
                      重新计算
                    </button>
                    <button
                      className="primary-button night-skill-submit"
                      disabled={!canUseSkill}
                      onClick={sendChefResult}
                    >
                      <Send size={15} />
                      {sendingMode === "skill"
                        ? "发送中"
                        : "发送技能信息"}
                    </button>
                  </div>
                </div>
              ) : null}
              {currentRole.id === "empath" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span>
                        <ScrollText size={14} />
                        共情者结果
                      </span>
                      <small>{currentRole.short}</small>
                    </div>
                  </div>
                  <div className="night-skill-result-grid">
                    {[0, 1, 2].map((count) => (
                      <button
                        className="secondary-button"
                        key={count}
                        disabled={!canUseSkill}
                        onClick={() => sendEmpathResult(count)}
                      >
                        {count}
                        <small>名邪恶</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {currentRole.id === "imp" && state.round <= 1 ? (
                <div className="night-skill-panel demon-bluff-draft">
                  <div className="demon-bluff-draft-heading">
                    <div><strong>小恶魔不在场身份</strong><small>首夜选择并发送三张不在场身份</small></div>
                    <button className="icon-button" title="整组重选" aria-label="整组重选不在场身份" disabled={sendingBluffs || availableDemonBluffRoles.length < 3} onClick={() => persistDemonBluffs(chooseRandomBluffs(currentDemonBluffSignature))}><Dices size={16} /></button>
                  </div>
                  {demonBluffRoleIds.length === 3 ? (
                    <div className="demon-bluff-draft-roles">
                      {demonBluffRoleIds.map((roleId, index) => {
                        const role = getRole(roleId);
                        return (
                          <div className="demon-bluff-draft-role" key={`${index}-${roleId}`}>
                            <span className="demon-bluff-draft-icon"><RoleIcon roleId={roleId} size={20} /></span>
                            <CompactSelect value={roleId} disabled={sendingBluffs} aria-label={`第 ${index + 1} 个不在场身份`} onChange={(event) => replaceDemonBluff(index, event.target.value)}>
                              {availableDemonBluffRoles.map((option) => <option value={option.id} key={option.id} disabled={option.id !== roleId && demonBluffRoleIds.includes(option.id)}>{option.name} · {option.team}</option>)}
                            </CompactSelect>
                            <button className="icon-button" title="更换这个身份" aria-label={`更换${role.name}`} disabled={sendingBluffs} onClick={() => replaceDemonBluff(index)}><RotateCcw size={15} /></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="inline-error">当前剧本中不足三张可用的不在场善良身份</div>}
                  <button className="primary-button demon-bluff-send" disabled={demonBluffsAlreadySent || sendingBluffs || !canUseSkill || demonBluffRoleIds.length !== 3} onClick={() => void sendDemonBluffs()}>
                    {demonBluffsAlreadySent ? <Check size={15} /> : <Send size={15} />}
                    {demonBluffsAlreadySent ? "本组已发送" : sendingBluffs ? "发送中" : selectedRoomPlayer?.is_claimed ? "发送这三个身份" : "小恶魔入座后可发送"}
                  </button>
                </div>
              ) : null}
              {currentRole.id === "monk" ||
              currentRole.id === "butler" ||
              currentRole.id === "poisoner" ||
              (currentRole.id === "imp" && state.round > 1) ? (
                <div className="night-skill-panel">
                  <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span><Target size={14} />{currentRole.name}本轮选择</span>
                      <small>{currentRole.short}</small>
                    </div>
                  </div>
                  {latestPlayerSkillChoice ? (
                    <div className="night-player-choice"><Check size={14} /><span>玩家已提交：{latestPlayerSkillChoice.summary}</span></div>
                  ) : (
                    <div className="night-player-choice waiting"><Target size={14} /><span>玩家尚未提交，可由上帝代选</span></div>
                  )}
                  {currentRole.id === "imp" && singleSkillTargetId === selectedPlayer?.id ? (
                    <label className="night-skill-role-field">
                      <span>恶魔继承玩家</span>
                      <CompactSelect value={impSuccessorPlayerId} disabled={sending} aria-label="选择恶魔继承玩家" onChange={(event) => setImpSuccessorPlayerId(event.target.value)}>
                        {impSuccessorCandidates.map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}
                      </CompactSelect>
                    </label>
                  ) : null}
                  <div className="night-skill-single-row">
                    <CompactSelect value={singleSkillTargetId} disabled={sending} onChange={(event) => setSingleSkillTargetId(event.target.value)} aria-label={currentRole.name + "目标"}>
                      {singleTargetCandidates.map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}
                    </CompactSelect>
                    <button className="primary-button" disabled={!canUseSkill || !singleSkillTargetId || (currentRole.id === "imp" && singleSkillTargetId === selectedPlayer?.id && !impSuccessorPlayerId)} onClick={() => void sendSingleTargetSkill()}>
                      <Send size={15} />{sendingMode === "skill" ? "发送中" : "确认并发送"}
                    </button>
                  </div>
                </div>
              ) : null}
              {currentRole.id === "undertaker" || currentRole.id === "ravenkeeper" ? (
                <div className="night-skill-panel">
                  <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span><ScrollText size={14} />{currentRole.name}角色信息</span>
                      <small>{currentRole.short}</small>
                    </div>
                  </div>
                  {currentRole.id === "ravenkeeper" ? (
                    <>
                      <button
                        className="secondary-button night-ravenkeeper-notify"
                        disabled={!canUseSkill}
                        onClick={() => void notifyRavenkeeperDeath()}
                      >
                        <Skull size={15} />
                        {sendingMode === "skill"
                          ? "通知中"
                          : selectedPlayer?.alive
                            ? "确认夜间死亡并通知"
                            : ravenkeeperDeathNotified
                              ? "再次发送死亡通知"
                              : "发送死亡通知"}
                      </button>
                      <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}>
                        {latestPlayerSkillChoice ? <Check size={14} /> : <Target size={14} />}
                        <span>
                          {latestPlayerSkillChoice
                            ? `玩家已提交：${latestPlayerSkillChoice.summary}`
                            : ravenkeeperDeathNotified
                              ? "已通知玩家死亡，等待玩家选择查验目标"
                              : "请先确认夜间死亡并通知玩家"}
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div className="night-skill-reveal-grid">
                    <label><span>{currentRole.id === "undertaker" ? "被处决玩家" : "查验玩家"}</span><CompactSelect value={singleSkillTargetId} disabled={sending || !canResolveRoleReveal} onChange={(event) => setSingleSkillTargetId(event.target.value)}>{singleTargetCandidates.map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect></label>
                    <label><span>展示角色</span><CompactSelect value={revealedSkillRoleId} disabled={sending || !canResolveRoleReveal} onChange={(event) => setRevealedSkillRoleId(event.target.value)}>{getScriptRoles(state.scriptId).map((role) => <option value={role.id} key={role.id}>{role.name} · {role.team}</option>)}</CompactSelect></label>
                  </div>
                  <button className="primary-button night-skill-submit" disabled={!canUseSkill || !canResolveRoleReveal || !singleSkillTargetId || !revealedSkillRoleId} onClick={sendRoleRevealSkill}><Send size={15} />{sendingMode === "skill" ? "发送中" : "发送角色信息"}</button>
                </div>
              ) : null}
              {currentRole.id === "spy" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><BookOpen size={14} />间谍查看魔典</span><small>发送当前所有座位、真实角色、死亡状态与本晚行动</small></div></div>
                  <button className="primary-button night-skill-submit" disabled={!canUseSkill} onClick={sendSpyGrimoire}><Send size={15} />{sendingMode === "skill" ? "发送中" : "发送魔典与行动"}</button>
                </div>
              ) : null}
              {currentRole.id === "scarlet-woman" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Skull size={14} />红唇女郎继承</span><small>恶魔死亡且至少五人存活时成为小恶魔</small></div></div>
                  <div className="night-skill-result-grid fortune-results">
                    <button className="secondary-button" disabled={!canUseSkill} onClick={() => sendScarletWomanResult(false)}>未触发</button>
                    <button className="secondary-button positive" disabled={!canUseSkill} onClick={() => sendScarletWomanResult(true)}>已继承</button>
                  </div>
                </div>
              ) : null}
              {currentRole.id === "grandmother" ? (
                <div className="night-skill-panel">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><ScrollText size={14} />祖母与孙辈</span><small>{currentRole.short}</small></div></div>
                  {state.round <= 1 ? (
                    <>
                      <div className="night-skill-reveal-grid">
                        <label><span>孙辈玩家</span><CompactSelect value={singleSkillTargetId} disabled={sending} onChange={(event) => setSingleSkillTargetId(event.target.value)}>{state.players.filter((player) => ["镇民", "外来者"].includes(getRole(player.roleId).team) && player.id !== selectedPlayer?.id).map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect></label>
                        <label><span>展示角色</span><CompactSelect value={revealedSkillRoleId} disabled={sending} onChange={(event) => setRevealedSkillRoleId(event.target.value)}>{getScriptRoles(state.scriptId).filter((role) => ["镇民", "外来者"].includes(role.team)).map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</CompactSelect></label>
                      </div>
                      <button className="primary-button night-skill-submit" disabled={!canUseSkill || !singleSkillTargetId || !revealedSkillRoleId} onClick={sendGrandmotherInfo}><Send size={15} />发送孙辈信息</button>
                    </>
                  ) : (
                    <div className="night-skill-result-grid fortune-results">
                      <button className="secondary-button" disabled={!canUseSkill} onClick={() => void submitSkill("本晚孙辈未被恶魔杀死")}>未触发</button>
                      <button className="secondary-button positive" disabled={!canUseSkill} onClick={() => void submitSkill("孙辈被恶魔杀死，祖母同时死亡")}>祖母同死</button>
                    </div>
                  )}
                </div>
              ) : null}
              {currentRole.id === "gambler" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Target size={14} />赌徒判定</span><small>{currentRole.short}</small></div></div>
                  <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}><Target size={14} /><span>{latestPlayerSkillChoice ? `玩家已提交：${latestPlayerSkillChoice.summary}` : "玩家尚未提交猜测"}</span></div>
                  <div className="night-skill-result-grid fortune-results">
                    <button className="secondary-button negative" disabled={!canUseSkill || !latestPlayerSkillChoice} onClick={() => sendGamblerResult(true)}>正确</button>
                    <button className="secondary-button positive" disabled={!canUseSkill || !latestPlayerSkillChoice} onClick={() => sendGamblerResult(false)}>错误·死亡</button>
                  </div>
                </div>
              ) : null}
              {currentRole.id === "chambermaid" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Target size={14} />侍女查验</span><small>{currentRole.short}</small></div></div>
                  <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}><Target size={14} /><span>{latestPlayerSkillChoice ? `玩家已提交：${latestPlayerSkillChoice.summary}` : "玩家尚未提交，可由上帝代选"}</span></div>
                  <div className="night-skill-target-grid">
                    <CompactSelect value={skillTargets.first} onChange={(event) => setSkillTargets((current) => ({...current, first: event.target.value}))}>{singleTargetCandidates.map((player) => <option value={player.id} key={player.id} disabled={player.id === skillTargets.second}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect>
                    <CompactSelect value={skillTargets.second} onChange={(event) => setSkillTargets((current) => ({...current, second: event.target.value}))}>{singleTargetCandidates.map((player) => <option value={player.id} key={player.id} disabled={player.id === skillTargets.first}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect>
                  </div>
                  <div className="night-skill-result-grid">{[0,1,2].map((count) => <button className="secondary-button" key={count} disabled={!canUseSkill || !pairTargetsReady} onClick={() => void submitSkill(`你选择的${getNightSeatLabel(skillTargets.first)}和${getNightSeatLabel(skillTargets.second)}中，有 ${count} 人因自身能力醒来`)}>{count}<small>人醒来</small></button>)}</div>
                </div>
              ) : null}
              {currentRole.id === "philosopher" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><ScrollText size={14} />哲学家选角</span><small>{currentRole.short}</small></div></div>
                  <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}><Target size={14} /><span>{latestPlayerSkillChoice ? `玩家已提交：${latestPlayerSkillChoice.summary}` : "等待玩家选择善良角色"}</span></div>
                  <button className="primary-button night-skill-submit" disabled={!canUseSkill || !latestPlayerSkillChoice?.roleIdChoice} onClick={() => void submitSkill(`你获得了${getRole(latestPlayerSkillChoice?.roleIdChoice ?? "").name}的能力；若该角色在场，其进入醉酒状态`)}><Send size={15} />确认获得能力</button>
                </div>
              ) : null}
              {currentRole.id === "juggler" ? (
                <div className="night-skill-panel juggler-host-panel">
                  <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span>
                        <ScrollText size={14} />
                        杂耍结算
                      </span>
                      <small>自动核对玩家首日提交的全部公开猜测</small>
                    </div>
                  </div>
                  <div
                    className={
                      hasJugglerSubmission
                        ? "night-player-choice"
                        : "night-player-choice waiting"
                    }
                  >
                    <Target size={14} />
                    <span>
                      {hasJugglerSubmission
                        ? latestPlayerSkillChoice?.summary
                        : "玩家尚未通过系统提交；仍可按线下公开猜测手动发送"}
                    </span>
                  </div>
                  {hasJugglerSubmission ? (
                    <>
                      <div className="juggler-host-guesses">
                        {jugglerGuessRows.length ? (
                          jugglerGuessRows.map((guess, index) => (
                            <article
                              className={guess.correct ? "correct" : "incorrect"}
                              key={`${guess.target?.id ?? "missing"}-${guess.guessedRole.id}-${index}`}
                            >
                              <span>{index + 1}</span>
                              <div>
                                <strong>
                                  {guess.target
                                    ? getNightPublicPlayerLabel(guess.target.id)
                                    : "未知玩家"}
                                  <em>猜 {guess.guessedRole.name}</em>
                                </strong>
                                <small>实际身份：{guess.actualRole.name}</small>
                              </div>
                              <b>{guess.correct ? "正确" : "错误"}</b>
                            </article>
                          ))
                        ) : (
                          <p>玩家提交了 0 项猜测。</p>
                        )}
                      </div>
                      <div className="juggler-auto-result">
                        <Check size={15} />
                        <span>
                          自动计算：共猜对
                          <strong>{calculatedJugglerResult}</strong>个
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div className="night-skill-result-grid juggler-results">
                    {[0, 1, 2, 3, 4, 5].map((count) => (
                      <button
                        className={`secondary-button ${
                          hasJugglerSubmission &&
                          count === calculatedJugglerResult
                            ? "active recommended"
                            : ""
                        }`}
                        key={count}
                        disabled={!canUseSkill}
                        onClick={() => void sendJugglerResult(count)}
                      >
                        {count}
                        <small>
                          {hasJugglerSubmission &&
                          count === calculatedJugglerResult
                            ? "自动结果"
                            : "个正确"}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {currentRole.id === "oracle" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><ScrollText size={14} />神谕者结果</span><small>当前死亡玩家中有 {state.players.filter((player) => !player.alive && ["爪牙", "恶魔"].includes(getRole(player.roleId).team)).length} 名真实邪恶玩家</small></div></div>
                  <div className="night-skill-result-grid">{Array.from({length: Math.max(3, state.players.filter((player) => !player.alive).length + 1)}, (_, count) => count).map((count) => <button className="secondary-button" key={count} disabled={!canUseSkill} onClick={() => sendOracleResult(count)}>{count}<small>名邪恶</small></button>)}</div>
                </div>
              ) : null}
              {currentRole.id === "nightwatchman" ? (
                <div className="night-skill-panel">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Target size={14} />守夜人通知</span><small>{currentRole.short}</small></div></div>
                  <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}><Target size={14} /><span>{latestPlayerSkillChoice ? `玩家已提交：${latestPlayerSkillChoice.summary}` : "玩家尚未提交，可由上帝代选"}</span></div>
                  <div className="night-skill-single-row"><CompactSelect value={singleSkillTargetId} onChange={(event) => setSingleSkillTargetId(event.target.value)}>{singleTargetCandidates.map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect><button className="primary-button" disabled={!canUseSkill || !singleSkillTargetId} onClick={() => void sendNightwatchmanNotice()}><Send size={15} />{selectedPlayerHasNoShownAbility ? "仅回复该玩家" : "通知双方"}</button></div>
                </div>
              ) : null}
              {currentRole.id === "moonchild" || currentRole.id === "klutz" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Target size={14} />{currentRole.name}判定</span><small>{currentRole.short}</small></div></div>
                  <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}><Target size={14} /><span>{latestPlayerSkillChoice ? `玩家已提交：${latestPlayerSkillChoice.summary}` : "等待玩家公开选择"}</span></div>
                  <div className="night-skill-result-grid fortune-results">
                    {currentRole.id === "moonchild" ? <><button className="secondary-button positive" disabled={!canUseSkill || !latestPlayerSkillChoice} onClick={() => sendAlignmentResult(true)}>善良·死亡</button><button className="secondary-button negative" disabled={!canUseSkill || !latestPlayerSkillChoice} onClick={() => sendAlignmentResult(false)}>非善良</button></> : <><button className="secondary-button negative" disabled={!canUseSkill || !latestPlayerSkillChoice} onClick={() => sendAlignmentResult(true)}>善良·继续</button><button className="secondary-button positive" disabled={!canUseSkill || !latestPlayerSkillChoice} onClick={() => sendAlignmentResult(false)}>邪恶·落败</button></>}
                  </div>
                </div>
              ) : null}
              {currentRole.id === "godfather" && state.round <= 1 ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><ScrollText size={14} />教父首夜信息</span><small>向教父展示本局在场外来者</small></div></div>
                  <button className="primary-button night-skill-submit" disabled={!canUseSkill} onClick={() => { const outsiders = state.players.filter((player) => getRole(player.roleId).team === "外来者"); void submitSkill(outsiders.length ? `本局在场外来者：${outsiders.map((player) => getRole(player.roleId).name).join("、")}` : "本局没有在场外来者"); }}><Send size={15} />发送外来者信息</button>
                </div>
              ) : null}
              {(["godfather", "pukka", "vigormortis", "nodashii"].includes(currentRole.id) && !(currentRole.id === "godfather" && state.round <= 1)) ? (
                <div className="night-skill-panel">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Target size={14} />{currentRole.name}本轮目标</span><small>{currentRole.short}</small></div></div>
                  {currentRole.id === "godfather" ? (
                    <button className="secondary-button night-ravenkeeper-notify" disabled={!canUseSkill} onClick={() => void notifyGodfatherRevenge()}>
                      <Skull size={15} />
                      {sendingMode === "skill" ? "通知中" : godfatherRevengeNotified ? "再次通知教父" : "确认外来者死亡并通知"}
                    </button>
                  ) : null}
                  <div className={latestPlayerSkillChoice ? "night-player-choice" : "night-player-choice waiting"}><Target size={14} /><span>{latestPlayerSkillChoice ? `玩家已提交：${latestPlayerSkillChoice.summary}` : currentRole.id === "godfather" ? godfatherRevengeNotified ? "已通知教父，等待玩家选择目标" : "仅在白天有外来者死亡时通知教父" : "玩家尚未提交，可由上帝代选"}</span></div>
                  {currentRole.id === "nodashii" ? <div className="night-player-choice"><Check size={14} /><span>当前中毒镇民：{nodashiiPoisonedPlayers.map((player) => `${formatSeat(player.seat)} ${getRole(player.roleId).name}`).join("、") || "未找到"}</span></div> : null}
                  {currentRole.id === "vigormortis" && getRole(state.players.find((player) => player.id === singleSkillTargetId)?.roleId ?? "").team === "爪牙" ? <label className="night-skill-role-field"><span>中毒镇民</span><CompactSelect value={skillTargets.second} onChange={(event) => setSkillTargets((current) => ({...current, second: event.target.value}))}>{state.players.filter((player) => getRole(player.roleId).team === "镇民").map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect></label> : null}
                  <div className="night-skill-single-row"><CompactSelect value={singleSkillTargetId} disabled={currentRole.id === "godfather" && !latestPlayerSkillChoice} onChange={(event) => setSingleSkillTargetId(event.target.value)}>{singleTargetCandidates.map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect><button className="primary-button" disabled={!canUseSkill || !singleSkillTargetId || (currentRole.id === "godfather" && (!godfatherRevengeNotified || !latestPlayerSkillChoice))} onClick={sendSingleTargetSkill}><Send size={15} />确认并发送</button></div>
                </div>
              ) : null}
              {currentRole.id === "marionette" ? (
                <div className="night-skill-panel compact">
                  <div className="night-skill-panel-heading"><div className="night-skill-heading-title"><span><Skull size={14} />告知恶魔</span><small>此消息不会发送给提线木偶本人</small></div></div>
                  <div className="night-skill-single-row"><CompactSelect value={singleSkillTargetId} onChange={(event) => setSingleSkillTargetId(event.target.value)}>{state.players.filter((player) => getRole(player.roleId).team === "恶魔").map((player) => <option value={player.id} key={player.id}>{getNightPlayerLabel(player.id)}</option>)}</CompactSelect><button className="primary-button" disabled={sending || !singleSkillTargetId} onClick={sendMarionetteNotice}><Send size={15} />发送给恶魔</button></div>
                </div>
              ) : null}
              {currentRole.id === "fortune-teller" ? (
                <div className="night-skill-panel">
                  <div className="night-skill-panel-heading">
                    <div className="night-skill-heading-title">
                      <span>
                        <Target size={14} />
                        占卜师本晚查验
                      </span>
                      <small>{currentRole.short}</small>
                    </div>
                  </div>
                  {latestPlayerSkillChoice ? (
                    <div className="night-player-choice">
                      <Check size={14} />
                      <span>
                        玩家已选择：
                        {getNightPlayerLabel(skillTargets.first)}、
                        {getNightPlayerLabel(skillTargets.second)}
                      </span>
                    </div>
                  ) : (
                    <div className="night-player-choice waiting">
                      <Target size={14} />
                      <span>玩家尚未提交，本次可由上帝代选</span>
                    </div>
                  )}
                  <div className="night-skill-target-grid">
                    <CompactSelect
                      value={skillTargets.first}
                      disabled={sending}
                      onChange={(event) =>
                        setSkillTargets((current) => ({
                          ...current,
                          first: event.target.value,
                        }))
                      }
                      aria-label="占卜师第一名查验玩家"
                    >
                      {fortuneTellerCandidates.map((player) => (
                        <option
                          value={player.id}
                          key={player.id}
                          disabled={player.id === skillTargets.second}
                        >
                          {getNightPlayerLabel(player.id)}
                        </option>
                      ))}
                    </CompactSelect>
                    <CompactSelect
                      value={skillTargets.second}
                      disabled={sending}
                      onChange={(event) =>
                        setSkillTargets((current) => ({
                          ...current,
                          second: event.target.value,
                        }))
                      }
                      aria-label="占卜师第二名查验玩家"
                    >
                      {fortuneTellerCandidates.map((player) => (
                        <option
                          value={player.id}
                          key={player.id}
                          disabled={player.id === skillTargets.first}
                        >
                          {getNightPlayerLabel(player.id)}
                        </option>
                      ))}
                    </CompactSelect>
                  </div>
                  <div className="night-skill-result-grid fortune-results">
                    <button
                      className="secondary-button positive"
                      disabled={!canUseSkill || !pairTargetsReady}
                      onClick={() => sendFortuneTellerResult(true)}
                    >
                      是
                      <small>有恶魔</small>
                    </button>
                    <button
                      className="secondary-button negative"
                      disabled={!canUseSkill || !pairTargetsReady}
                      onClick={() => sendFortuneTellerResult(false)}
                    >
                      否
                      <small>无恶魔</small>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            </section>

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
                  <span className="night-chat-recipient-label">
                    <span>对话玩家</span>
                    <b>{currentRole.name}</b>
                  </span>
                  <CompactSelect
                    value={targetPlayerId}
                    onChange={(event) => setTargetPlayerId(event.target.value)}
                    disabled={!rolePlayers.length || sending}
                  >
                    {rolePlayers.map((player) => {
                      const roomPlayer = roomPlayersById.get(player.id);
                      const roleName = getRole(player.roleId).name;
                      const playerName =
                        roomPlayer?.is_claimed && roomPlayer.name
                          ? roomPlayer.name
                          : "未入座";
                      return (
                        <option key={player.id} value={player.id}>
                          {formatSeat(player.seat)}
                          {` · ${playerName} · ${roleName}`}
                        </option>
                      );
                    })}
                  </CompactSelect>
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
                <div className="night-chat-actions">
                  <button
                    className="primary-button night-send-button"
                    disabled={!canSend}
                    onClick={() => void submitMessage()}
                  >
                    <Send size={15} />
                    {sendingMode === "message" ? "发送中" : "发送"}
                  </button>
                </div>
              </div>
              {sendError ? <div className="inline-error">{sendError}</div> : null}
            </div>
            </section>
          </>
        ) : null}
      </section>
      {skillResultConfirmation ? (
        <div
          className="skill-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSkillResultConfirmation(false);
            }
          }}
        >
          <section
            className="skill-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-confirm-title"
          >
            <header className="skill-confirm-header">
              <span
                className={`skill-confirm-icon${
                  skillResultConfirmation.mismatch ? " mismatch" : ""
                }`}
                aria-hidden="true"
              >
                <AlertTriangle size={21} />
              </span>
              <div>
                <p className="eyebrow">SKILL RESULT CHECK</p>
                <h3 id="skill-confirm-title">
                  {skillResultConfirmation.title}
                </h3>
              </div>
            </header>
            <div className="skill-confirm-content">
              <p className="skill-confirm-recipient">
                接收玩家：<strong>{skillResultConfirmation.recipient}</strong>
              </p>
              <div className="skill-confirm-send-lines">
                {skillResultConfirmation.sendLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div
                className={`skill-confirm-judgement${
                  skillResultConfirmation.mismatch ? " mismatch" : ""
                }`}
              >
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <strong>{skillResultConfirmation.judgement}</strong>
                  <span>实际基准：{skillResultConfirmation.baseline}</span>
                </div>
              </div>
              {skillResultConfirmation.issueLines.map((line) => (
                <p className="skill-confirm-note" key={line}>
                  {line}
                </p>
              ))}
              {skillResultConfirmation.caveatLines.map((line) => (
                <p className="skill-confirm-note caveat" key={line}>
                  {line}
                </p>
              ))}
              <p className="skill-confirm-question">仍要发送吗？</p>
            </div>
            <footer className="skill-confirm-actions">
              <button
                className="secondary-button"
                onClick={() => closeSkillResultConfirmation(false)}
              >
                取消
              </button>
              <button
                className="primary-button"
                onClick={() => closeSkillResultConfirmation(true)}
              >
                仍要发送
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function HostMessagesPanel({
  state,
  room,
  roomPlayers,
  nightMessages,
  playerMessages,
  unreadPlayerMessages,
  onReadPlayerMessages,
  onSendMessage,
}: {
  state: GameState;
  room: SharedRoom | null;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  unreadPlayerMessages: PlayerMessage[];
  onReadPlayerMessages: (playerId: string) => void;
  onSendMessage: (message: {
    playerId: string;
    roleId: string;
    body: string;
  }) => Promise<void>;
}) {
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
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
  const selectedPlayerId = selectedConversationId;


  useEffect(() => {
    if (
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
      latestAvailablePlayer?.player.id ??
        firstClaimed?.player.id ??
        availablePlayers[0]?.player.id ??
        "",
    );
  }, [
    availablePlayers,
    nightMessages,
    playerMessages,
    selectedConversationId,
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
            body:
              message.direction === "outgoing"
                ? parseDemonBluffMessage(message.body)
                  ? "3 个不在场身份"
                  : getNightMessageDisplayBody(message.body)
                : getPlayerMessageDisplayBody(message.body),
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
      ? formatSeat(selectedPlayer.seat)
      : "玩家");
  const playerTimeline = [
    ...nightMessages
      .filter((message) => message.player_id === selectedPlayerId)
      .map((message) => {
        const skillBody = getRoleSkillMessage(message.body);
        const demonBluffRoleIds = parseDemonBluffMessage(message.body);
        return {
          ...message,
          body: getNightMessageDisplayBody(message.body),
          direction: "outgoing" as const,
          label: `上帝 · ${getGameStageLabel("夜晚", message.round)} · ${getRole(message.role_id).name}${demonBluffRoleIds ? " · 不在场身份" : skillBody ? " · 技能" : ""}`,
          avatar: "上",
          demonBluffRoleIds,
        };
      }),
    ...playerMessages
      .filter((message) => message.player_id === selectedPlayerId)
      .map((message) => {
        const skillChoice = parsePlayerSkillChoiceMessage(message.body);
        return {
          ...message,
          body: getPlayerMessageDisplayBody(message.body),
          direction: "incoming" as const,
          label: `${selectedSenderName} · 第 ${message.round} 回合${skillChoice ? " · 技能选择" : ""}`,
          avatar: selectedPlayer
            ? formatSeat(selectedPlayer.seat)
            : "未知",
          demonBluffRoleIds: null,
        };
      }),
  ];
  const timeline = playerTimeline.sort(
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
      selectedPlayerId &&
      unreadPlayerMessages.some(
        (message) => message.player_id === selectedPlayerId,
      )
    ) {
      onReadPlayerMessages(selectedPlayerId);
    }
  }, [
    onReadPlayerMessages,
    selectedPlayerId,
    unreadPlayerMessages,
  ]);

  const canSend =
    Boolean(room) &&
    Boolean(selectedPlayer) &&
    Boolean(selectedRoomPlayer?.is_claimed) &&
    Boolean(messageBody.trim()) &&
    !sending;

  const submitMessage = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError("");
    try {
      if (selectedPlayer) {
        await onSendMessage({
          playerId: selectedPlayer.id,
          roleId: getPlayerVisibleRoleId(
            selectedPlayer.roleId,
            selectedPlayer.drunkRoleId,
          ),
          body: messageBody.trim(),
        });
      }
      setMessageBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /claimed player/i.test(message)
          ? "该玩家尚未入座，暂时无法接收信息"
          : /function|night_messages|schema cache/i.test(message)
            ? "消息数据库尚未配置"
            : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
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
          <strong>{unreadPlayerMessages.length}</strong>
        </div>
        <div className="host-player-tabs">
          {conversationPlayers.map(({ player, roomPlayer }) => {
            const latest = latestByPlayer.get(player.id);
            const incomingCount = incomingCountByPlayer.get(player.id) ?? 0;
            const playerLabel =
              roomPlayer?.name ||
              (latest
                ? formatSeat(player.seat)
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
                  {formatSeat(player.seat)} · {getRole(player.roleId).name}
                </span>
                <span className="host-player-summary">
                  <strong>{playerLabel}</strong>
                  <small>
                    {latest
                      ? `${latest.direction === "outgoing" ? "我：" : ""}${latest.body}`
                      : "暂无消息"}
                  </small>
                </span>
                {incomingCount ? (
                  <span className="host-player-count">{incomingCount}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="host-chat-panel">
        {selectedPlayer && selectedRole ? (
          <>
            <header className="host-chat-header">
              <div className={`host-chat-role ${teamLabels[selectedRole.team]}`}>
                <RoleIcon roleId={selectedRole.id} size={24} />
              </div>
              <div>
                <h3>{selectedRoomPlayer?.name || formatSeat(selectedPlayer.seat)}</h3>
                <p>
                  {formatSeat(selectedPlayer.seat)} ·{" "}
                  {selectedRole.name} ·{" "}
                  {selectedRoomPlayer?.is_claimed ? "已入座" : "未入座"}
                </p>
              </div>
            </header>


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
                  玩家来信和你发送的信息会按时间显示在这里。
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
                  selectedRoomPlayer?.is_claimed
                    ? "回复该玩家"
                    : "该玩家入座后即可发送"
                }
                maxLength={500}
                rows={2}
                disabled={!selectedRoomPlayer?.is_claimed || sending}
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
  const scriptRoles = getScriptRoles(scriptId);
  const filteredRoles = scriptRoles.filter((role) => {
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
            <a
              className="role-row role-row-link"
              href={getRoleDetailsUrl(role)}
              key={role.id}
              target="_blank"
              rel="noreferrer"
              title={`查看${role.name}的详细说明`}
              aria-label={`查看${role.name}的详细说明`}
            >
              <span className={`mini-role-icon ${teamLabels[role.team]}`}>
                <RoleIcon roleId={role.id} size={16} />
              </span>
              <strong>{role.name}</strong>
              <span className={`team-label ${teamLabels[role.team]}`}>{role.team}</span>
              <p>{role.short}</p>
              <ExternalLink className="role-details-icon" size={13} aria-hidden="true" />
            </a>
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
