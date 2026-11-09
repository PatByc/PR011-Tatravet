"use client";
import { webhookStatus } from "@/lib/integration";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  LayoutDashboard,
  LogOut,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  Settings,
  X,
  CalendarDays,
  CircleAlert,
  MessageSquareText,
} from "lucide-react";
import Brand from "./brand";
import { contactReasons, followLabels, statusLabels, terminationLabel } from "@/lib/calls";
import type { DashboardData } from "@/lib/dashboard";
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
type Data = Serialized<DashboardData>;
type Call = Data["calls"][number];
type Detail = Call & {
  transcript: string | null;
  note: string;
  revision: number;
  endedAt: string | null;
  summary: string | null;
  endedReason: string | null;
};
const reasonColors: Record<string, string> = {
  appointment: "#4e9c2c",
  appointment_change: "#8dbd6a",
  animal_health: "#2f7564",
  services_prices: "#d6a94e",
  test_results: "#4f8eae",
  clinic_info: "#adc9ac",
  other: "#8a9b8b",
  unknown: "#c8cdc4",
};
type Tab = "overview" | "calls" | "analytics" | "settings";
const tabs = [
  { id: "overview" as const, label: "Przegląd", icon: LayoutDashboard },
  { id: "calls" as const, label: "Połączenia", icon: Phone },
  { id: "analytics" as const, label: "Analityka", icon: BarChart3 },
  { id: "settings" as const, label: "Ustawienia", icon: Settings },
];
const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const shiftDay = (days: number) => {
  const date = new Date(`${dateKey(new Date())}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const duration = (value: number | null) =>
  value === null
    ? "—"
    : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (response.status === 401 && path !== "/api/auth/password") {
    window.location.href = "/login";
    throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Nie udało się pobrać danych.");
  return data;
}
export default function Dashboard({
  username,
  publicUrl,
}: {
  username: string;
  publicUrl: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [from, setFrom] = useState(shiftDay(0)),
    [to, setTo] = useState(shiftDay(0));
  const [preset, setPreset] = useState("1"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [follow, setFollow] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<string | null>(null),
    [toast, setToast] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const generationId = ++generation.current;
    try {
      const result = await request<Data>(
        `/api/dashboard?${new URLSearchParams({ from, to, q: query, follow, status, page: String(page) })}`,
      );
      if (generationId === generation.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (generationId === generation.current)
        setError(e instanceof Error ? e.message : "Błąd połączenia.");
    } finally {
      if (generationId === generation.current) setLoading(false);
    }
  }, [from, to, query, follow, status, page]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      clearInterval(timer);
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: Tab) {
    setTab(next);
    setPage(1);
    setSearch("");
    setQuery("");
    setFollow("");
    setStatus("");
    const days = next === "overview" ? 1 : 30;
    setPreset(String(days));
    setFrom(shiftDay(days - 1));
    setTo(shiftDay(0));
  }
  function choosePreset(value: string) {
    setPreset(value);
    setPage(1);
    if (value !== "custom") {
      setFrom(shiftDay(Number(value) - 1));
      setTo(shiftDay(0));
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setToast("Link do panelu skopiowany");
    } catch {
      setToast(`Adres panelu: ${publicUrl}`);
    }
  }
  async function logout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  const integration = data?.integration;
  const lastSync = integration?.lastWebhook;
  const connection = webhookStatus(
    Boolean(data?.demo),
    Boolean(integration?.configured),
    Boolean(lastSync),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">Panel przychodni</div>
        <nav aria-label="Nawigacja główna">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "calls" && !!data?.outstanding && (
                <span className="nav-count">{data.outstanding}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="clinic-card">
            <span className="clinic-avatar">T</span>
            <div>
              <strong>Tatravet</strong>
              <span>Zakopane</span>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={17} />
            Wyloguj się
          </button>
          <span className="powered">Obsługa połączeń · LiniaVet</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Tatravet <span>/</span>{" "}
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
          </div>
          <button className="button copy-button" onClick={copy}>
            <Copy size={15} />
            <span>Kopiuj link do panelu</span>
          </button>
        </header>
        <main className="main-content">
          {data?.demo && (
            <div className="demo-banner">
              <CircleAlert size={16} />
              <span>
                Tryb demonstracyjny — fikcyjne połączenia. To nie są dane
                pacjentów.
              </span>
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>
                {tab === "overview"
                  ? "Rozmowy pod kontrolą"
                  : tab === "calls"
                    ? "Historia połączeń"
                    : tab === "analytics"
                      ? "Rytm rozmów"
                      : "Ustawienia panelu"}
              </h1>
              <p>
                {tab === "overview"
                  ? "Zobacz, co dzieje się na linii przychodni."
                  : tab === "calls"
                    ? "Każda rozmowa i jej dalszy ciąg."
                    : tab === "analytics"
                      ? "Sprawdź, kiedy dzwonią klienci i jak przebiegają połączenia."
                      : "Dostęp do panelu i stan połączenia z asystentem."}
              </p>
            </div>
            {tab !== "settings" && (
              <div className="date-control">
                <CalendarDays size={17} />
                <select
                  aria-label="Zakres dat"
                  value={preset}
                  onChange={(e) => choosePreset(e.target.value)}
                >
                  <option value="1">Dzisiaj</option>
                  <option value="7">Ostatnie 7 dni</option>
                  <option value="30">Ostatnie 30 dni</option>
                  <option value="custom">Własny zakres</option>
                </select>
              </div>
            )}
          </div>
          {preset === "custom" && tab !== "settings" && (
            <div className="custom-dates">
              <label>
                Od
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Do
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>
          )}
          {error && (
            <div className="error error-banner" role="alert">
              {error}
              <button onClick={() => void load()} className="text-button">
                Spróbuj ponownie
              </button>
            </div>
          )}
          {!data && loading ? (
            <div className="loading-state">
              <RefreshCw className="spin" />
              Wczytywanie połączeń…
            </div>
          ) : (
            data && (
              <>
                {(tab === "overview" || tab === "analytics") && (
                  <div className="stats-strip">
                    <Stat
                      icon={PhoneCall}
                      label="Połączenia"
                      value={String(data.metrics.count)}
                      caption="w wybranym okresie"
                    />
                    <Stat
                      icon={Clock3}
                      label="Czas rozmów"
                      value={String(Math.round(data.metrics.seconds / 60))}
                      unit="min"
                      caption="łącznie na linii"
                    />
                    <Stat
                      icon={Activity}
                      label="Średnia rozmowa"
                      value={duration(data.metrics.average)}
                      caption="minuty : sekundy"
                    />
                    <Stat
                      icon={ArrowRight}
                      label="Do oddzwonienia"
                      value={String(data.outstanding)}
                      caption="ze wszystkich dni"
                      highlight
                    />
                  </div>
                )}
                {tab === "overview" && (
                  <>
                    <div className="overview-grid">
                      <section className="panel callback-panel">
                        <div className="section-title">
                          <h2>Wymagają Twojej uwagi</h2>
                          <span className="count-pill">{data.outstanding}</span>
                        </div>
                        <p className="section-description">
                          Rozmowy oznaczone do oddzwonienia
                        </p>
                        {data.queue.length ? (
                          data.queue.slice(0, 4).map((call) => (
                            <button
                              className="callback-item"
                              key={call.id}
                              onClick={() => setSelected(call.id)}
                            >
                              <span className="call-icon">
                                <Phone size={17} />
                              </span>
                              <span className="callback-info">
                                <strong>
                                  {call.caller || "Numer zastrzeżony"}
                                </strong>
                                <span>
                                  {call.summary ||
                                    "Otwórz rozmowę, aby sprawdzić szczegóły."}
                                </span>
                                <small>{dateTime(call.startedAt)}</small>
                              </span>
                              <ChevronRight size={18} />
                            </button>
                          ))
                        ) : (
                          <Empty
                            title="Wszystko pod opieką"
                            text="Nie ma rozmów oznaczonych do oddzwonienia."
                          />
                        )}
                        <button
                          className="text-button queue-link"
                          onClick={() => {
                            navigate("calls");
                            setFollow("CALLBACK");
                          }}
                        >
                          Zobacz kolejkę <ArrowRight size={16} />
                        </button>
                      </section>
                      <section className="panel hours-panel">
                        <div className="section-title">
                          <h2>Kiedy dzwonią klienci</h2>
                          <span className="muted small">Godziny</span>
                        </div>
                        <p className="section-description">
                          Natężenie połączeń w wybranym okresie
                        </p>
                        <HoursChart data={data.hours} />
                        <div className="chart-footnote">
                          <span className="legend-dot" />
                          Połączenia przychodni{" "}
                          <span>Czas lokalny · Warszawa</span>
                        </div>
                      </section>
                    </div>
                    <section className="panel recent-panel">
                      <div className="section-title">
                        <h2>Ostatnie połączenia</h2>
                        <button
                          className="text-button"
                          onClick={() => navigate("calls")}
                        >
                          Wszystkie połączenia <ArrowRight size={16} />
                        </button>
                      </div>
                      <CallTable
                        calls={data.calls.slice(0, 5)}
                        open={setSelected}
                      />
                    </section>
                  </>
                )}
                {tab === "calls" && (
                  <section className="panel">
                    <div className="filters">
                      <div className="search-input">
                        <Search size={18} />
                        <input
                          aria-label="Szukaj połączeń"
                          placeholder="Szukaj numeru lub treści rozmowy…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      <select
                        aria-label="Status obsługi"
                        value={follow}
                        onChange={(e) => {
                          setFollow(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">Wszystkie sprawy</option>
                        {Object.entries(followLabels).map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Status połączenia"
                        value={status}
                        onChange={(e) => {
                          setStatus(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">Wszystkie połączenia</option>
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <>
                      {follow === "CALLBACK" && (
                        <p
                          className="section-description"
                          style={{ marginBottom: 16 }}
                        >
                          Kolejka do oddzwonienia obejmuje wszystkie dni,
                          niezależnie od zakresu dat.
                        </p>
                      )}
                      <CallTable calls={data.calls} open={setSelected} />
                    </>
                    <div className="pagination">
                      <span>
                        {data.total} połączeń{loading ? " · Odświeżanie…" : ""}
                      </span>
                      <div>
                        <button
                          className="icon-button"
                          aria-label="Poprzednia strona"
                          disabled={page === 1}
                          onClick={() => setPage(page - 1)}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <span>
                          Strona {page} z{" "}
                          {Math.max(1, Math.ceil(data.total / 20))}
                        </span>
                        <button
                          className="icon-button"
                          aria-label="Następna strona"
                          disabled={page * 20 >= data.total}
                          onClick={() => setPage(page + 1)}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                {tab === "analytics" && (
                  <>
                    <section className="panel analytics-main">
                      <div className="section-title">
                        <h2>Połączenia dzień po dniu</h2>
                        <span className="small muted">
                          {from} — {to}
                        </span>
                      </div>
                      <DailyChart data={data.daily} />
                    </section>
                    <div className="analytics-grid">
                      <section className="panel reasons-panel">
                        <h2>Powody kontaktu</h2>
                        <p className="section-description">Główny temat każdej rozmowy w wybranym okresie</p>
                        {data.reasons.length ? (
                          <div className="reason-breakdown">
                            <div className="reason-pie" role="img" aria-label={`Powody kontaktu: ${data.reasons.map((item) => `${item.name}: ${item.value} (${Math.round(item.value / data.metrics.count * 100)}%)`).join(", ")}`}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={data.reasons} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={104} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                                    {data.reasons.map((item) => <Cell key={item.key} fill={reasonColors[item.key]} />)}
                                  </Pie>
                                  <Tooltip formatter={(value, name) => [`${value} połączeń`, name]} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <ul className="reason-legend">
                              {data.reasons.map((item) => (
                                <li key={item.key}>
                                  <span className="reason-swatch" style={{ backgroundColor: reasonColors[item.key] }} aria-hidden="true" />
                                  <span className="reason-name">{item.name}</span>
                                  <strong>{Math.round(item.value / data.metrics.count * 100)}%</strong>
                                  <span className="reason-count">{item.value}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : <Empty title="Brak powodów kontaktu" text="Wybierz okres z połączeniami." />}
                      </section>
                      <section className="panel">
                        <h2>Godziny największego ruchu</h2>
                        <HoursChart data={data.hours} />
                      </section>
                      <section className="panel endings">
                        <h2>Jak kończą się połączenia</h2>
                        <p className="section-description">
                          Zakończenie rozmowy nie oznacza rezerwacji wizyty.
                        </p>
                        {data.endings.length ? (
                          data.endings.map((item) => (
                            <div className="ending-row" key={item.name}>
                              <div>
                                <span>{item.name}</span>
                                <strong>{item.value}</strong>
                              </div>
                              <progress
                                aria-label={item.name}
                                value={item.value}
                                max={data.metrics.count}
                              />
                            </div>
                          ))
                        ) : (
                          <Empty
                            title="Jeszcze bez statystyk"
                            text="Wybierz inny okres lub poczekaj na pierwsze połączenie."
                          />
                        )}
                      </section>
                    </div>
                  </>
                )}
                {tab === "settings" && (
                  <SettingsPanel
                    username={username}
                    publicUrl={publicUrl}
                    copy={copy}
                    logout={logout}
                    connection={connection}
                    lastSync={lastSync || null}
                  />
                )}
                <footer className="content-footer">
                  <span>
                    <i className="status-dot" />
                    {connection}
                    {lastSync ? ` · ${dateTime(lastSync)}` : ""}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    <RefreshCw size={13} className={loading ? "spin" : ""} />
                    Odśwież
                  </button>
                </footer>
              </>
            )
          )}
        </main>
      </div>
      {selected && (
        <CallDetail
          id={selected}
          onClose={() => setSelected(null)}
          onSave={() => {
            void load();
            setToast("Zmiany zapisane");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  unit,
  caption,
  highlight = false,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  unit?: string;
  caption: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "stat highlight" : "stat"}>
      <div className="stat-label">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <div className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <span className="stat-caption">{caption}</span>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <MessageSquareText size={26} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function CallTable({
  calls,
  open,
}: {
  calls: Call[];
  open: (id: string) => void;
}) {
  return calls.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Rozmówca</th>
            <th>Data i godzina</th>
            <th>Czas</th>
            <th>Połączenie</th>
            <th>Obsługa</th>
            <th>
              <span className="sr-only">Szczegóły</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id}>
              <td>
                <button className="caller-button" onClick={() => open(call.id)}>
                  <span className="table-phone">
                    <ArrowDownLeft size={17} />
                  </span>
                  {call.caller || "Numer zastrzeżony"}
                </button>
              </td>
              <td>{dateTime(call.startedAt)}</td>
              <td className="numeric">{duration(call.duration)}</td>
              <td>
                <span
                  className={`status-label ${call.status === "ended" ? "ended" : ""}`}
                >
                  {statusLabels[call.status] || "Nieznany status"}
                </span>
              </td>
              <td>
                <span className={`badge ${call.followUp.toLowerCase()}`}>
                  {followLabels[call.followUp] || call.followUp}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Otwórz połączenie ${call.caller || "bez numeru"}`}
                  onClick={() => open(call.id)}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="Brak połączeń w tym widoku"
      text="Zmień filtry lub poczekaj na pierwszą rozmowę asystenta."
    />
  );
}
function HoursChart({ data }: { data: Data["hours"] }) {
  return (
    <div
      className="chart"
      role="img"
      aria-label={`Połączenia według godzin. ${
        data
          .filter((d) => d.calls)
          .map((d) => `${d.hour}: ${d.calls}`)
          .join(", ") || "Brak danych"
      }`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 15, right: 5, bottom: 0, left: -25 }}
        >
          <CartesianGrid vertical={false} stroke="#edf0e9" />
          <XAxis
            dataKey="hour"
            tickLine={false}
            axisLine={false}
            interval={3}
            tick={{ fontSize: 10, fill: "#737b70" }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#737b70" }}
          />
          <Tooltip
            cursor={{ fill: "#f1f7ec" }}
            formatter={(value) => [value, "Połączenia"]}
          />
          <Bar
            dataKey="calls"
            fill="#58AC27"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function DailyChart({ data }: { data: Data["daily"] }) {
  return (
    <div
      className="chart daily-chart"
      role="img"
      aria-label={`Połączenia dziennie: ${data.map((d) => `${d.date}: ${d.calls}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 20, bottom: 0, left: -20 }}
        >
          <defs>
            <linearGradient id="callFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#58ac27" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#58ac27" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#edf0e9" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => v.slice(5).split("-").reverse().join(".")}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(value) => [value, "Połączenia"]} />
          <Area
            type="monotone"
            dataKey="calls"
            stroke="#58AC27"
            strokeWidth={2.5}
            fill="url(#callFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function SettingsPanel({
  username,
  publicUrl,
  copy,
  logout,
  connection,
  lastSync,
}: {
  username: string;
  publicUrl: string;
  copy: () => void;
  logout: () => void;
  connection: string;
  lastSync: string | null;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      setError("Nowe hasła muszą być takie same.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current: form.get("current"),
          password: form.get("password"),
        }),
      });
      window.location.href = "/login";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Dostęp do panelu</h2>
        <p className="section-description">
          Wspólny login przychodni: <strong>{username}</strong>
        </p>
        <form onSubmit={change} className="password-form">
          <label>
            Obecne hasło
            <input
              type="password"
              name="current"
              required
              maxLength={256}
              autoComplete="current-password"
            />
          </label>
          <label>
            Nowe hasło
            <input
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
            />
            <small>Co najmniej 12 znaków</small>
          </label>
          <label>
            Powtórz nowe hasło
            <input
              type="password"
              name="confirm"
              required
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Zapisywanie…" : "Zmień hasło"}
          </button>
          <p className="small muted">
            Zmiana hasła wyloguje wszystkie urządzenia.
          </p>
        </form>
        <button className="button" style={{ marginTop: 24 }} onClick={logout}>
          <LogOut size={16} />
          Wyloguj to urządzenie
        </button>
      </section>
      <div className="settings-side">
        <section className="panel">
          <h2>Link dla zespołu</h2>
          <p className="section-description">
            Odbiorca linku musi zalogować się do panelu.
          </p>
          <div className="url-box">{publicUrl}</div>
          <button className="button" onClick={copy}>
            <Copy size={16} />
            Kopiuj link do panelu
          </button>
        </section>
        <section className="panel">
          <h2>Połączenie z asystentem</h2>
          <p className="connection-line">
            <span className="status-dot" />
            {connection}
          </p>
          <p className="small muted">
            {lastSync
              ? `Ostatnia aktualizacja: ${dateTime(lastSync)}`
              : "Po uruchomieniu asystenta pojawią się tu dane rozmów."}
          </p>
          <p className="small muted">
            Panel pokazuje połączenia, które dotarły do asystenta.
          </p>
        </section>
      </div>
    </div>
  );
}
function CallDetail({
  id,
  onClose,
  onSave,
}: {
  id: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [call, setCall] = useState<Detail | null>(null),
    [follow, setFollow] = useState("NONE"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const dirty = call && (follow !== call.followUp || note !== call.note);
  const close = useCallback(() => {
    if (!dirty || window.confirm("Odrzucić niezapisane zmiany?")) onClose();
  }, [dirty, onClose]);
  useEffect(() => {
    let active = true;
    request<Detail>(`/api/calls/${encodeURIComponent(id)}`)
      .then((data) => {
        if (active) {
          setCall(data);
          setFollow(data.followUp);
          setNote(data.note);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  async function save() {
    if (!call) return;
    setSaving(true);
    setError("");
    try {
      const updated = await request<Detail>(
        `/api/calls/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            followUp: follow,
            note,
            revision: call.revision,
          }),
        },
      );
      setCall(updated);
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function keys(event: React.KeyboardEvent) {
    if (event.key === "Escape") close();
    if (event.key === "Tab") {
      const focusables = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),select,textarea,input,a[href]",
      );
      if (!focusables?.length) return;
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={keys}
      >
        <header className="detail-header">
          <h2 id="detail-title">Szczegóły połączenia</h2>
          <button
            className="icon-button"
            aria-label="Zamknij szczegóły"
            onClick={close}
          >
            <X size={22} />
          </button>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {call ? (
          <>
            <div className="detail-caller">
              <span className="call-icon">
                <Phone size={24} />
              </span>
              <div>
                <h3>{call.caller || "Numer zastrzeżony"}</h3>
                <p>
                  {dateTime(call.startedAt)} · {duration(call.duration)}
                </p>
              </div>
            </div>
            <div className="detail-section">
              <h3>Podsumowanie rozmowy</h3>
              <p>{call.summary || "Podsumowanie nie jest jeszcze dostępne."}</p>
              <dl className="call-facts">
                <dt>Powód kontaktu</dt>
                <dd>{contactReasons[call.contactReason as keyof typeof contactReasons] || contactReasons.unknown}</dd>
                <dt>Status</dt>
                <dd>{statusLabels[call.status] || "Nieznany status"}</dd>
                <dt>Przyczyna zakończenia</dt>
                <dd>{terminationLabel(call.endedReason)}</dd>
              </dl>
            </div>
            <div className="detail-section followup-form">
              <h3>Dalsza obsługa</h3>
              <label>
                Status sprawy
                <select
                  value={follow}
                  onChange={(e) => setFollow(e.target.value)}
                >
                  {Object.entries(followLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notatka dla zespołu
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Co trzeba ustalić lub przekazać?"
                />
              </label>
              <button
                className="primary"
                onClick={save}
                disabled={saving || !dirty}
              >
                {saving ? "Zapisywanie…" : "Zapisz zmiany"}
              </button>
            </div>
            <div className="detail-section">
              <h3>Transkrypcja</h3>
              {call.transcript ? (
                <div className="transcript">{call.transcript}</div>
              ) : (
                <p className="muted">
                  Transkrypcja nie jest jeszcze dostępna. Sprawdź ponownie po
                  zakończeniu przetwarzania rozmowy.
                </p>
              )}
            </div>
          </>
        ) : (
          !error && <div className="loading-state">Wczytywanie rozmowy…</div>
        )}
      </div>
    </div>
  );
}
