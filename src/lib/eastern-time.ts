function sundayOfMonth(year: number, monthIndex: number, ordinal: number) {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - firstWeekday) % 7) + (ordinal - 1) * 7;
}

export function easternLocalTimestamp(date: string, time = "00:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const year = Number(date.slice(0, 4));
  const springForward = year + "-03-" + String(sundayOfMonth(year, 2, 2)).padStart(2, "0") + "T02:00";
  const fallBack = year + "-11-" + String(sundayOfMonth(year, 10, 1)).padStart(2, "0") + "T02:00";
  const local = date + "T" + time;
  const offset = local >= springForward && local < fallBack ? "-04:00" : "-05:00";
  return local + ":00" + offset;
}
