export const formatSeat = (
  seat: number | string | null | undefined,
) => {
  if (seat === null || seat === undefined || seat === "?") {
    return "?号";
  }
  return `${seat}号`;
};
