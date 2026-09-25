export const days = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
export const minutes = (t) =>
  Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const clock = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const parisToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function datePlus(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(date) {
  return datePlus(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
}
export function occurs(e, date) {
  return (
    e.day_of_week === (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7 &&
    date >= e.recurrence_start &&
    (!e.recurrence_end || date <= e.recurrence_end) &&
    Math.floor((new Date(date + "T12:00:00Z") - new Date(e.recurrence_start + "T12:00:00Z")) / 604800000) % (e.recurrence_interval_weeks || 1) === 0
  );
}
export function commonSlots({
  events,
  cancellations = [],
  memberIds,
  groupId,
  date,
  from = 480,
  to = 1080,
  minDuration = 30,
}) {
  if (!memberIds.length || from >= to) return [];
  const busy = events
    .filter(
      (e) =>
        memberIds.includes(e.user_id) &&
        occurs(e, date) &&
        !cancellations.some(
          (c) =>
            c.group_id === groupId &&
            c.event_id === e.id &&
            c.occurrence_date === date &&
            c.status === "confirmed",
        ),
    )
    .map((e) => [
      Math.max(from, minutes(e.start_time)),
      Math.min(to, minutes(e.end_time)),
    ])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let cursor = from;
  const free = [];
  for (const [s, e] of busy) {
    if (s - cursor >= minDuration) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= minDuration) free.push([cursor, to]);
  return free;
}
