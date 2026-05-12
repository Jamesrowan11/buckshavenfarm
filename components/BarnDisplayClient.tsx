"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type BarnFilter = "log-barn" | "arena-barn";

type Horse = {
  id: string;
  name: string;
  notes: string | null;
  active: boolean;
  barn: BarnFilter | null;
};
type Chart = {
  id: string;
  horse_id: string;
  am_feed: string | null;
  pm_feed: string | null;
  supplements: string | null;
  special_notes: string | null;
  responsible_employee: string | null;
  barn: BarnFilter | null;
  profiles: { name: string } | null;
};
type Log = { horse_id: string; feeding_type: "AM" | "PM"; done: boolean; date: string };
type Announcement = { id: string; title: string; body: string | null; created_at: string };
type Weather = {
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
};

const WEATHER_API =
  "https://api.open-meteo.com/v1/forecast?latitude=39.2668&longitude=-77.0911&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph";

function weatherInfo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: "☀️", label: "Clear" };
  if (code === 1) return { emoji: "🌤️", label: "Mostly clear" };
  if (code === 2) return { emoji: "⛅", label: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "Overcast" };
  if (code === 45 || code === 48) return { emoji: "🌫️", label: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { emoji: "🌦️", label: "Drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { emoji: "🌧️", label: "Rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { emoji: "🌨️", label: "Snow" };
  if ([95, 96, 99].includes(code)) return { emoji: "⛈️", label: "Thunderstorm" };
  return { emoji: "🌤️", label: "—" };
}

export default function BarnDisplayClient({
  barnFilter,
  barnLabel,
}: {
  barnFilter?: BarnFilter;
  barnLabel?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [charts, setCharts] = useState<Chart[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);

    let horsesQuery = supabase.from("horses").select("*").eq("active", true).order("name");
    if (barnFilter) horsesQuery = horsesQuery.eq("barn", barnFilter);

    const [horseRes, chartRes, logRes, annRes] = await Promise.all([
      horsesQuery,
      supabase.from("feeding_charts").select("*, profiles:responsible_employee(name)"),
      supabase.from("feeding_logs").select("horse_id, feeding_type, done, date").eq("date", today),
      supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    setHorses((horseRes.data as Horse[] | null) ?? []);
    setCharts((chartRes.data as unknown as Chart[] | null) ?? []);
    setLogs((logRes.data as Log[] | null) ?? []);
    setAnnouncements((annRes.data as Announcement[] | null) ?? []);
    setLastUpdated(new Date());
  }, [barnFilter]);

  const fetchWeather = useCallback(async () => {
    try {
      const r = await fetch(WEATHER_API);
      const j = await r.json();
      if (j?.current) setWeather(j.current as Weather);
    } catch {
      // silent — display falls back to "—"
    }
  }, []);

  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    void fetchAll();

    const supabase = createClient();
    const channel = supabase
      .channel(`barn-display-${barnFilter ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "feeding_logs" }, () =>
        void fetchAll()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "feeding_charts" }, () =>
        void fetchAll()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "horses" }, () =>
        void fetchAll()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () =>
        void fetchAll()
      )
      .subscribe();

    const poll = setInterval(fetchAll, 60_000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [fetchAll, barnFilter]);

  useEffect(() => {
    void fetchWeather();
    const t = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchWeather]);

  const chartByHorse = new Map<string, Chart>();
  charts.forEach((c) => chartByHorse.set(c.horse_id, c));
  const logKey = (h: string, t: "AM" | "PM") => `${h}|${t}`;
  const logMap = new Map<string, Log>();
  logs.forEach((l) => logMap.set(logKey(l.horse_id, l.feeding_type), l));

  const wx = weather ? weatherInfo(weather.weather_code) : null;

  return (
    <div className="min-h-screen w-full bg-[#0a1a0a] text-white p-6 grid grid-rows-[auto_1fr_auto] gap-4 font-sans">
      {/* Header — barn name + clock + date */}
      <header className="text-center">
        {barnLabel && (
          <div className="text-3xl font-extrabold tracking-[0.3em] text-[#4ade80] mb-2">
            {barnLabel}
          </div>
        )}
        <div className="text-[7rem] leading-none font-bold tabular-nums tracking-tight text-white">
          {now
            ? now.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })
            : "—"}
        </div>
        <div className="mt-2 text-4xl font-semibold text-[#4ade80]">
          {now
            ? now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </div>
      </header>

      {/* Main grid: 60/40 */}
      <main className="grid grid-cols-[3fr_2fr] gap-6 min-h-0">
        {/* LEFT — feeding */}
        <section className="rounded-2xl bg-black/40 border border-[#4ade80]/30 p-6 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-[#4ade80]/30">
            <h2 className="text-3xl font-extrabold tracking-wide text-[#4ade80]">
              TODAY&apos;S FEEDING SCHEDULE
            </h2>
            <span className="text-xl text-white/60">
              {horses.length} {horses.length === 1 ? "horse" : "horses"}
            </span>
          </div>
          {horses.length === 0 ? (
            <div className="flex-1 grid place-items-center text-2xl text-white/50 text-center px-6">
              {barnFilter
                ? `No horses assigned to ${barnLabel ?? "this barn"} yet.`
                : "No horses configured."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 overflow-auto pr-1">
              {horses.map((h) => {
                const c = chartByHorse.get(h.id);
                const amDone = !!logMap.get(logKey(h.id, "AM"))?.done;
                const pmDone = !!logMap.get(logKey(h.id, "PM"))?.done;
                return (
                  <div
                    key={h.id}
                    className="rounded-xl bg-black/60 border border-white/10 p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-4xl" aria-hidden>
                        🐴
                      </span>
                      <span className="text-3xl font-bold leading-tight">{h.name}</span>
                    </div>
                    {c?.profiles?.name && (
                      <div className="text-base text-white/60">
                        Responsible: <span className="text-white/90">{c.profiles.name}</span>
                      </div>
                    )}
                    <FeedRow label="AM" text={c?.am_feed} done={amDone} />
                    <FeedRow label="PM" text={c?.pm_feed} done={pmDone} />
                    {c?.supplements && (
                      <div className="text-base text-amber-300">
                        <span className="font-semibold">Supplements:</span> {c.supplements}
                      </div>
                    )}
                    {c?.special_notes && (
                      <div className="text-base text-orange-300">
                        <span className="font-semibold">Note:</span> {c.special_notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* RIGHT — weather + announcements */}
        <aside className="grid grid-rows-[auto_1fr] gap-6 min-h-0">
          {/* Weather */}
          <section className="rounded-2xl bg-black/40 border border-[#4ade80]/30 p-6">
            <h2 className="text-2xl font-extrabold tracking-wide text-[#4ade80] mb-3 pb-2 border-b border-[#4ade80]/30">
              CLARKSVILLE, MD
            </h2>
            {!weather ? (
              <div className="text-2xl text-white/50">Loading…</div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-7xl" aria-hidden>
                  {wx?.emoji}
                </div>
                <div className="flex-1">
                  <div className="text-6xl font-bold tabular-nums leading-none">
                    {Math.round(weather.temperature_2m)}°F
                  </div>
                  <div className="text-xl text-white/80 mt-1">{wx?.label}</div>
                  <div className="text-base text-white/60 mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span>Humidity</span>
                    <span className="text-right text-white/90">
                      {Math.round(weather.relative_humidity_2m)}%
                    </span>
                    <span>Wind</span>
                    <span className="text-right text-white/90">
                      {Math.round(weather.wind_speed_10m)} mph
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Announcements */}
          <section className="rounded-2xl bg-black/40 border border-[#4ade80]/30 p-6 flex flex-col min-h-0">
            <h2 className="text-2xl font-extrabold tracking-wide text-[#4ade80] mb-3 pb-2 border-b border-[#4ade80]/30">
              ANNOUNCEMENTS
            </h2>
            {announcements.length === 0 ? (
              <div className="flex-1 grid place-items-center text-xl text-white/50">
                No announcements.
              </div>
            ) : (
              <ul className="space-y-4 overflow-auto">
                {announcements.map((a) => (
                  <li key={a.id} className="border-b border-white/10 pb-3 last:border-b-0">
                    <div className="text-2xl font-bold text-[#4ade80] leading-tight">{a.title}</div>
                    <div className="text-sm text-white/50 mt-1">
                      {new Date(a.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    {a.body && (
                      <p className="text-lg text-white/85 mt-2 whitespace-pre-wrap leading-snug">
                        {a.body}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-2 text-white/50 text-sm">
        <span className="font-semibold text-[#4ade80]/80">
          BUCKS HAVEN FARM{barnLabel ? ` · ${barnLabel}` : ""}
        </span>
        <span>
          Last updated{" "}
          {lastUpdated
            ? lastUpdated.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })
            : "—"}
        </span>
      </footer>
    </div>
  );
}

function FeedRow({
  label,
  text,
  done,
}: {
  label: "AM" | "PM";
  text: string | null | undefined;
  done: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        done ? "bg-[#4ade80]/15 border border-[#4ade80]/40" : "bg-white/5 border border-white/10"
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-2xl" aria-hidden>
          {done ? "✅" : "⭕"}
        </span>
        <span className="text-xl font-bold text-[#4ade80]/90">{label}</span>
      </div>
      <div className="mt-1 text-lg text-white/90 whitespace-pre-wrap leading-snug min-h-[1.5rem]">
        {text || "—"}
      </div>
    </div>
  );
}
