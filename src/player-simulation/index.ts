export {
  setRoomSimulation,
  simulateDayPrivateMessage,
  simulateNomination,
  simulatePlayerMessage,
  simulateVote,
} from "./api";

export const loadPlayerSimulationConsole = () =>
  import("./PlayerSimulationConsole").then(({ PlayerSimulationConsole }) => ({
    default: PlayerSimulationConsole,
  }));
