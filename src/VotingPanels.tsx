import { useEffect, useState } from "react";
import {
  Check,
  CircleSlash2,
  Gavel,
  Hand,
  LockKeyhole,
  Skull,
  UserRoundPlus,
  Vote,
} from "lucide-react";
import {
  castNominationVote,
  nominatePlayer,
  type DayResolution,
  type DayVote,
  type Nomination,
  type PublicRoomPlayer,
} from "./room";
import { CompactSelect } from "./CompactSelect";
import { formatSeat } from "./seat";
import { getRole } from "./data";
import { getPhilosopherAbilityRoleId } from "./philosopher";
import { parsePlayerSkillChoiceMessage } from "./playerSkillChoices";
import { parsePlayerNotes } from "./playerNotes";
import type { Phase, Player } from "./types";

const getPlayer = (players: PublicRoomPlayer[], playerId: string) =>
  players.find((player) => player.id === playerId);

const getPlayerLabel = (players: PublicRoomPlayer[], playerId: string) => {
  const player = getPlayer(players, playerId);
  return player
    ? `${formatSeat(player.seat)} · ${player.name || "未入座"}`
    : "未知玩家";
};

const getNominationVotes = (votes: DayVote[], nominationId: string) =>
  votes.filter((vote) => vote.nomination_id === nominationId);

const getExecutionLeader = (nominations: Nomination[]) => {
  const closed = nominations.filter(
    (nomination) => nomination.status !== "open",
  );
  if (!closed.length) return null;
  const topVotes = Math.max(...closed.map((nomination) => nomination.vote_count));
  const leaders = closed.filter(
    (nomination) => nomination.vote_count === topVotes,
  );
  if (leaders.length !== 1) return null;
  const leader = leaders[0];
  return leader.required_votes !== null &&
    leader.vote_count >= leader.required_votes
    ? leader
    : null;
};

const getVotingError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : "";
  if (/only available during the day|voting is not available/i.test(message)) {
    return "只有白天阶段可以提名和投票";
  }
  if (/another nomination is currently open/i.test(message)) {
    return "当前已有一项提名正在投票";
  }
  if (/already nominated today/i.test(message)) {
    return "你今天已经发起过提名";
  }
  if (/already been nominated today/i.test(message)) {
    return "这名玩家今天已经被提名过";
  }
  if (/only alive players may nominate/i.test(message)) {
    return "死亡玩家不能发起提名";
  }
  if (/already voted on this nomination/i.test(message)) {
    return "你已经对这项提名投过票";
  }
  if (/dead vote has already been used/i.test(message)) {
    return "你的死亡票已经使用";
  }
  if (/day voting is already resolved/i.test(message)) {
    return "今天的处决结果已经确定";
  }
  if (/function|schema cache|xueran_(nominate|cast_vote)/i.test(message)) {
    return "投票数据库功能尚未配置";
  }
  return "操作失败，请刷新后重试";
};

function VoteCount({
  count,
  required,
  open,
}: {
  count: number;
  required: number;
  open: boolean;
}) {
  return (
    <div className={count >= required ? "vote-count reached" : "vote-count"}>
      <strong>{count}</strong>
      <span>/ {required} 票{open ? "起" : "门槛"}</span>
    </div>
  );
}

function NominationCard({
  nomination,
  players,
  votes,
  currentRequiredVotes,
  showVoters = true,
  hideLiveVotes = false,
}: {
  nomination: Nomination;
  players: PublicRoomPlayer[];
  votes: DayVote[];
  currentRequiredVotes: number;
  showVoters?: boolean;
  hideLiveVotes?: boolean;
}) {
  const nominationVotes = getNominationVotes(votes, nomination.id);
  const required = nomination.required_votes ?? currentRequiredVotes;
  const liveVotesHidden = hideLiveVotes && nomination.status === "open";
  return (
    <article className={`nomination-card ${nomination.status}`}>
      <div className="nomination-route">
        <span>
          <UserRoundPlus size={14} />
          {getPlayerLabel(players, nomination.nominator_player_id)}
        </span>
        <b>提名</b>
        <strong>{getPlayerLabel(players, nomination.nominee_player_id)}</strong>
      </div>
      <div className="nomination-tally">
        {liveVotesHidden ? (
          <div className="vote-count private">
            <LockKeyhole size={13} />
            <span>计票结束后公开</span>
          </div>
        ) : (
          <VoteCount
            count={
              nomination.status === "open"
                ? nominationVotes.length
                : nomination.vote_count
            }
            required={required}
            open={nomination.status === "open"}
          />
        )}
        <span className={`nomination-status ${nomination.status}`}>
          {nomination.status === "open"
            ? "投票中"
            : nomination.status === "executed"
              ? "已处决"
              : "计票结束"}
        </span>
      </div>
      {showVoters && !liveVotesHidden ? (
        <div className="nomination-voters">
          {nominationVotes.length ? (
            nominationVotes.map((vote) => {
              const voter = getPlayer(players, vote.voter_player_id);
              return (
                <span
                  className={vote.voter_was_alive ? "" : "dead-vote"}
                  key={vote.id}
                  title={vote.voter_was_alive ? "存活玩家投票" : "已使用死亡票"}
                >
                  {formatSeat(voter?.seat)}
                  {!vote.voter_was_alive ? <Skull size={9} /> : null}
                </span>
              );
            })
          ) : (
            <small>还没有玩家举手</small>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function PlayerVotingPanel({
  roomId,
  phase,
  round,
  currentPlayerId,
  players,
  nominations,
  votes,
  resolutions,
  roleId,
  playerMessages,
  onRefresh,
}: {
  roomId: string;
  phase: Phase;
  round: number;
  currentPlayerId: string;
  players: PublicRoomPlayer[];
  nominations: Nomination[];
  votes: DayVote[];
  resolutions: DayResolution[];
  roleId: string;
  playerMessages: { body: string; player_id: string; round: number; created_at: string }[];
  onRefresh: () => Promise<void>;
}) {
  const dayRound = phase === "夜晚" ? Math.max(1, round - 1) : round;
  const currentNominations = nominations.filter(
    (nomination) => nomination.round === dayRound,
  );
  const completedNominations = currentNominations.filter(
    (nomination) => nomination.status !== "open",
  );
  const resolution = resolutions.find((item) => item.round === dayRound);
  const openNomination = currentNominations.find(
    (nomination) => nomination.status === "open",
  );
  const currentPlayer = getPlayer(players, currentPlayerId);
  const myNomination = currentNominations.find(
    (nomination) => nomination.nominator_player_id === currentPlayerId,
  );
  const nominatedPlayerIds = new Set(
    currentNominations.map((nomination) => nomination.nominee_player_id),
  );
  const nomineeOptions = players.filter(
    (player) => !nominatedPlayerIds.has(player.id),
  );
  const [nomineePlayerId, setNomineePlayerId] = useState(
    nomineeOptions[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const aliveCount = players.filter((player) => player.alive).length;
  const currentRequiredVotes = Math.max(1, Math.ceil(aliveCount / 2));
  const myOpenVote = openNomination
    ? votes.find(
        (vote) =>
          vote.nomination_id === openNomination.id &&
          vote.voter_player_id === currentPlayerId,
      )
    : undefined;
  const deadVoteSpent = votes.some(
    (vote) =>
      vote.voter_player_id === currentPlayerId && !vote.voter_was_alive,
  );
  const butlerMasterId = roleId === "butler"
    ? [...playerMessages]
        .filter(
          (message) =>
            message.player_id === currentPlayerId && message.round === dayRound,
        )
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() -
            new Date(left.created_at).getTime(),
        )
        .map((message) => parsePlayerSkillChoiceMessage(message.body))
        .find((choice) => choice?.roleId === "butler")?.playerIds[0] ?? ""
    : "";
  const butlerMasterHasVoted = Boolean(
    !openNomination ||
      (butlerMasterId &&
        votes.some(
          (vote) =>
            vote.nomination_id === openNomination.id &&
            vote.voter_player_id === butlerMasterId,
        )),
  );
  const canNominate = Boolean(
    phase === "白天" &&
      currentPlayer?.alive &&
      !resolution &&
      !openNomination &&
      !myNomination &&
      nomineeOptions.length,
  );
  const canVote = Boolean(
    phase === "白天" &&
      openNomination &&
      !resolution &&
      !myOpenVote &&
      (roleId !== "butler" || butlerMasterHasVoted) &&
      (currentPlayer?.alive || !deadVoteSpent),
  );

  useEffect(() => {
    if (!nomineeOptions.some((player) => player.id === nomineePlayerId)) {
      setNomineePlayerId(nomineeOptions[0]?.id ?? "");
    }
  }, [nomineeOptions, nomineePlayerId]);

  const submitNomination = async () => {
    if (!canNominate || !nomineePlayerId || busy) return;
    const nomineeLabel = getPlayerLabel(players, nomineePlayerId);
    if (!window.confirm(`确认提名 ${nomineeLabel} 进入处决投票？`)) return;
    setBusy(true);
    setError("");
    try {
      await nominatePlayer(roomId, nomineePlayerId);
      await onRefresh();
    } catch (reason) {
      setError(getVotingError(reason));
    } finally {
      setBusy(false);
    }
  };

  const submitVote = async () => {
    if (!canVote || !openNomination || busy) return;
    const nomineeLabel = getPlayerLabel(
      players,
      openNomination.nominee_player_id,
    );
    const deadVoteText = currentPlayer?.alive
      ? ""
      : "这会使用你本局唯一的死亡票。";
    if (!window.confirm(`确认支持处决 ${nomineeLabel}？${deadVoteText}`)) return;
    setBusy(true);
    setError("");
    try {
      await castNominationVote(openNomination.id);
      await onRefresh();
    } catch (reason) {
      setError(getVotingError(reason));
    } finally {
      setBusy(false);
    }
  };

  const resolvedPlayer = resolution?.executed_player_id
    ? getPlayer(players, resolution.executed_player_id)
    : null;

  return (
    <section className="player-view-panel voting-page">
      <div className="player-view-heading voting-heading">
        <div>
          <p className="eyebrow">DAY NOMINATION</p>
          <h2>提名与处决投票</h2>
        </div>
        <Gavel size={22} />
      </div>

      {phase !== "白天" ? (
        <div className="voting-locked-state">
          <LockKeyhole size={22} />
          <strong>夜晚不能发起投票</strong>
          <span>进入白天阶段后开放提名。</span>
        </div>
      ) : resolution ? (
        <div className={resolvedPlayer ? "day-resolution executed" : "day-resolution"}>
          {resolvedPlayer ? <Gavel size={22} /> : <CircleSlash2 size={22} />}
          <div>
            <strong>
              {resolvedPlayer
                ? `${formatSeat(resolvedPlayer.seat)} 已被处决`
                : "今天无人被处决"}
            </strong>
            <span>本日投票已经结束</span>
          </div>
        </div>
      ) : null}

      {phase === "白天" && !resolution ? (
        <>
          {openNomination ? (
            <section className="active-vote-panel">
              <div className="voting-section-title">
                <span><Vote size={15} />当前投票</span>
                <small>{currentRequiredVotes} 票达到处决门槛</small>
              </div>
              <NominationCard
                nomination={openNomination}
                players={players}
                votes={votes}
                currentRequiredVotes={currentRequiredVotes}
                hideLiveVotes
              />
              <button
                className="primary-button player-cast-vote"
                disabled={!canVote || busy}
                onClick={() => void submitVote()}
              >
                {myOpenVote ? <Check size={16} /> : <Hand size={16} />}
                {myOpenVote
                  ? "已经投票"
                  : roleId === "butler" && !butlerMasterHasVoted
                    ? "等待主人投票"
                  : !currentPlayer?.alive && deadVoteSpent
                    ? "死亡票已经使用"
                    : "支持处决"}
              </button>
            </section>
          ) : (
            <section className="nomination-compose">
              <div className="voting-section-title">
                <span><UserRoundPlus size={15} />发起提名</span>
                <small>每人每天只能提名一次</small>
              </div>
              {currentPlayer?.alive ? (
                myNomination ? (
                  <div className="voting-inline-notice">
                    <Check size={14} />你今天已经发起过提名
                  </div>
                ) : nomineeOptions.length ? (
                  <div className="nomination-compose-row">
                    <CompactSelect
                      value={nomineePlayerId}
                      disabled={busy}
                      onValueChange={setNomineePlayerId}
                      ariaLabel="选择被提名玩家"
                    >
                      {nomineeOptions.map((player) => (
                        <option value={player.id} key={player.id}>
                          {getPlayerLabel(players, player.id)}
                          {!player.alive ? " · 已死亡" : ""}
                        </option>
                      ))}
                    </CompactSelect>
                    <button
                      className="primary-button"
                      disabled={!canNominate || busy}
                      onClick={() => void submitNomination()}
                    >
                      <Gavel size={15} />确认提名
                    </button>
                  </div>
                ) : (
                  <div className="voting-inline-notice">今天所有玩家都已被提名</div>
                )
              ) : (
                <div className="voting-inline-notice">
                  <Skull size={14} />死亡玩家不能发起提名
                </div>
              )}
            </section>
          )}
        </>
      ) : null}

      {error ? <p className="voting-error">{error}</p> : null}

      {completedNominations.length ? (
        <section className="nomination-history">
          <div className="voting-section-title">
            <span>今日提名记录</span>
            <small>{completedNominations.length} 项</small>
          </div>
          <div className="nomination-list">
            {[...completedNominations].reverse().map((nomination) => (
              <NominationCard
                nomination={nomination}
                players={players}
                votes={votes}
                currentRequiredVotes={currentRequiredVotes}
                key={nomination.id}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function HostVotingPanel({
  roomAvailable,
  phase,
  round,
  players,
  gamePlayers,
  nominations,
  votes,
  resolutions,
  busy,
  abilityDisabledPlayerIds,
  onCloseNomination,
  onFinalizeExecution,
}: {
  roomAvailable: boolean;
  phase: Phase;
  round: number;
  players: PublicRoomPlayer[];
  gamePlayers: Player[];
  nominations: Nomination[];
  votes: DayVote[];
  resolutions: DayResolution[];
  busy: boolean;
  abilityDisabledPlayerIds: ReadonlySet<string>;
  onCloseNomination: (nominationId: string) => Promise<void>;
  onFinalizeExecution: () => Promise<void>;
}) {
  const dayRound = phase === "夜晚" ? Math.max(1, round - 1) : round;
  const currentNominations = nominations.filter(
    (nomination) => nomination.round === dayRound,
  );
  const completedNominations = currentNominations.filter(
    (nomination) => nomination.status !== "open",
  );
  const resolution = resolutions.find((item) => item.round === dayRound);
  const openNomination = currentNominations.find(
    (nomination) => nomination.status === "open",
  );
  const leader = getExecutionLeader(currentNominations);
  const aliveCount = gamePlayers.filter((player) => player.alive).length;
  const currentRequiredVotes = Math.max(1, Math.ceil(aliveCount / 2));
  const resolvedPlayer = resolution?.executed_player_id
    ? getPlayer(players, resolution.executed_player_id)
    : null;
  const predictedPlayer = leader
    ? getPlayer(players, leader.nominee_player_id)
    : null;
  const gamePlayerById = new Map(gamePlayers.map((player) => [player.id, player]));
  const openNominator = openNomination
    ? gamePlayerById.get(openNomination.nominator_player_id)
    : null;
  const openNominee = openNomination
    ? gamePlayerById.get(openNomination.nominee_player_id)
    : null;
  const openNomineeAbilityRoleId = openNominee
    ? getPhilosopherAbilityRoleId(openNominee) || openNominee.roleId
    : "";
  const virginState = openNomineeAbilityRoleId === "virgin" && openNominee
    ? parsePlayerNotes(openNominee.notes).find((note) =>
        note.id.startsWith("system:role-state:virgin"),
      )
    : null;
  const virginWasPreviouslyNominated = Boolean(
    openNomineeAbilityRoleId === "virgin" &&
      openNominee &&
      nominations.some(
        (nomination) =>
          nomination.nominee_player_id === openNominee.id &&
          nomination.id !== openNomination?.id,
      ),
  );
  const virginCanTrigger = Boolean(
    openNomineeAbilityRoleId === "virgin" &&
      !virginState &&
      !virginWasPreviouslyNominated &&
      openNominee &&
      openNominee.alive &&
      !abilityDisabledPlayerIds.has(openNominee.id) &&
      openNominator &&
      (getRole(openNominator.roleId).team === "镇民" || openNominator.roleId === "spy"),
  );
  const executedGamePlayer = resolution?.executed_player_id
    ? gamePlayerById.get(resolution.executed_player_id)
    : null;
  const saintExecuted = Boolean(
    executedGamePlayer &&
      resolution?.executed_player_was_alive !== false &&
      (getPhilosopherAbilityRoleId(executedGamePlayer) || executedGamePlayer.roleId) === "saint" &&
      !abilityDisabledPlayerIds.has(executedGamePlayer.id),
  );
  const mayorPlayers = gamePlayers.filter(
    (player) =>
      player.alive &&
      (getPhilosopherAbilityRoleId(player) || player.roleId) === "mayor" &&
      !abilityDisabledPlayerIds.has(player.id),
  );
  const mayorWinAvailable = Boolean(
    resolution &&
      !resolution.executed_player_id &&
      aliveCount === 3 &&
      mayorPlayers.length,
  );

  return (
    <section className="host-voting-page">
      <div className="panel-heading host-voting-heading">
        <div>
          <p className="eyebrow">DAY VOTING · 第 {dayRound} 天</p>
          <h2>提名与处决</h2>
        </div>
        <div className="host-voting-metrics">
          <span><strong>{aliveCount}</strong>存活</span>
          <span><strong>{currentRequiredVotes}</strong>票门槛</span>
        </div>
      </div>

      {!roomAvailable ? (
        <div className="voting-locked-state host">
          <Vote size={24} />
          <strong>请先创建共享房间</strong>
          <span>玩家入座后即可在白天发起提名。</span>
        </div>
      ) : phase !== "白天" ? (
        <div className="voting-locked-state host">
          <LockKeyhole size={24} />
          <strong>当前是夜晚阶段</strong>
          <span>切换到白天后开放提名和投票。</span>
        </div>
      ) : resolution ? (
        <div className={resolvedPlayer ? "day-resolution executed host" : "day-resolution host"}>
          {resolvedPlayer ? <Gavel size={25} /> : <CircleSlash2 size={25} />}
          <div>
            <strong>
              {resolvedPlayer
                ? `${getPlayerLabel(players, resolvedPlayer.id)} 已被处决`
                : "本日无人被处决"}
            </strong>
            <span>结算完成，可以进入夜晚阶段</span>
          </div>
        </div>
      ) : (
        <>
          {openNomination ? (
            <section className="host-active-vote">
              <div className="voting-section-title">
                <span><Vote size={15} />玩家正在投票</span>
                <small>票数会实时更新</small>
              </div>
              <NominationCard
                nomination={openNomination}
                players={players}
                votes={votes}
                currentRequiredVotes={currentRequiredVotes}
              />
              {openNomineeAbilityRoleId === "virgin" ? (
                <div className="voting-inline-notice">
                  {openNominee && !openNominee.alive
                    ? "处女已经死亡并失去能力，本次提名不会触发"
                    : openNominee && abilityDisabledPlayerIds.has(openNominee.id)
                    ? "处女能力当前中毒或醉酒，本次提名不会触发能力"
                    : virginState
                    ? `处女能力已有记录：${virginState.body}`
                    : virginWasPreviouslyNominated
                      ? "处女此前已经被提名过，本次不能再次触发能力"
                    : virginCanTrigger
                      ? `首次提名者${formatSeat(openNominator?.seat)}可登记为镇民：应立即处决提名者并结束白天`
                      : `首次提名者${formatSeat(openNominator?.seat)}不是镇民：处女不触发，但能力仍会失去`}
                </div>
              ) : null}
              <button
                className="primary-button host-close-vote"
                disabled={busy}
                onClick={() => void onCloseNomination(openNomination.id)}
              >
                <LockKeyhole size={15} />结束本轮计票
              </button>
            </section>
          ) : (
            <section className="host-vote-resolution">
              <div className="host-current-leader">
                {predictedPlayer ? <Gavel size={19} /> : <CircleSlash2 size={19} />}
                <div>
                  <span>当前结算结果</span>
                  <strong>
                    {predictedPlayer
                      ? `${getPlayerLabel(players, predictedPlayer.id)} 将被处决`
                      : currentNominations.length
                        ? "无人处决（未达门槛或最高票平票）"
                        : "尚无提名"}
                  </strong>
                </div>
              </div>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void onFinalizeExecution()}
              >
                <Check size={15} />确认今日结果
              </button>
            </section>
          )}
        </>
      )}

      {resolution && (saintExecuted || mayorWinAvailable) ? (
        <div className="voting-inline-notice">
          {saintExecuted
            ? `圣徒${formatSeat(executedGamePlayer?.seat)}被处决：其阵营立即落败`
            : `仅 3 名玩家存活且今天无人被处决：存活镇长${formatSeat(mayorPlayers[0]?.seat)}可令其阵营获胜`}
        </div>
      ) : null}

      {completedNominations.length ? (
        <section className="nomination-history host">
          <div className="voting-section-title">
            <span>今日全部提名</span>
            <small>最高票必须唯一且达到门槛</small>
          </div>
          <div className="nomination-list host">
            {[...completedNominations].reverse().map((nomination) => (
              <NominationCard
                nomination={nomination}
                players={players}
                votes={votes}
                currentRequiredVotes={currentRequiredVotes}
                key={nomination.id}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
