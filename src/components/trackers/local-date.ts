const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatLocalDate(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isLocalDateString(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(year, month - 1, day);
  return (
    check.getFullYear() === year &&
    check.getMonth() === month - 1 &&
    check.getDate() === day
  );
}

export function addLocalDays(localDate: string, deltaDays: number): string {
  const match = ISO_DATE.exec(localDate);
  if (!match) return formatLocalDate();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDate(date);
}

export function formatFriendlyDate(localDate: string, today: string = formatLocalDate()): string {
  if (localDate === today) return "Today";
  if (localDate === addLocalDays(today, -1)) return "Yesterday";
  const match = ISO_DATE.exec(localDate);
  if (!match) return localDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatLocalTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
