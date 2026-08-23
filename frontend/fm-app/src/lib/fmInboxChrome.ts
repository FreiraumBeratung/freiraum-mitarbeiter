/** Kleine Inbox-Optik und ehrliche Tageszahlen. Keine Netz-Logos, keine Phantasiewerte. */

const STATS_KEY = "fm_daily_mail_stats_v1";

const AVATAR_COLORS = ["#2f6fed", "#1f8a5b", "#c9a227", "#c45c7a", "#6b5ce7", "#d46a2c", "#3a8ea3", "#7a5a3a"];

export type DailyMailStats = {
  day: string;
  sentToday: number;
  repliedToday: number;
};

export function localDayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyStats(day = localDayKey()): DailyMailStats {
  return { day, sentToday: 0, repliedToday: 0 };
}

export function readDailyMailStats(): DailyMailStats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Partial<DailyMailStats>;
    const day = localDayKey();
    if (String(parsed?.day || "") !== day) return emptyStats(day);
    return {
      day,
      sentToday: Math.max(0, Math.floor(Number(parsed.sentToday) || 0)),
      repliedToday: Math.max(0, Math.floor(Number(parsed.repliedToday) || 0)),
    };
  } catch {
    return emptyStats();
  }
}

export function bumpDailyMailStats(kind: "sent" | "replied"): DailyMailStats {
  const current = readDailyMailStats();
  if (kind === "sent") current.sentToday += 1;
  if (kind === "replied") current.repliedToday += 1;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(current));
  } catch {
    // private mode / quota
  }
  return current;
}

export function senderInitial(name?: string | null, email?: string | null): string {
  const src = String(name || email || "?").trim();
  const ch = src.charAt(0);
  return /[a-zäöü]/i.test(ch) ? ch.toUpperCase() : "?";
}

export function senderAvatarColor(key: string): string {
  const raw = String(key || "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
