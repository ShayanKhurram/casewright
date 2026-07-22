import { useState } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  FileText,
  Calendar,
  Settings,
  Bell,
  Search,
  ChevronRight,
  AlertTriangle,
  Plus,
  X,
  Download,
  MoreHorizontal,
  Briefcase,
  Globe,
  SlidersHorizontal,
  ArrowUpRight,
} from "lucide-react";

type CaseStatus = "Active" | "Urgent" | "Document Review" | "Approved" | "On Hold";
type VisaType = "H-1B" | "Green Card (EB-2)" | "L-1A" | "Asylum" | "O-1A" | "TN" | "Marriage-Based GC" | "F-1 → H-1B";
type NavItem = "Dashboard" | "Cases" | "Clients" | "Documents" | "Calendar" | "Settings";

interface Case {
  id: string;
  client: string;
  nationality: string;
  visaType: VisaType;
  status: CaseStatus;
  attorney: string;
  deadline: string;
  filedDate: string;
  documents: number;
  notes: string;
  nextAction: string;
}

const CASES: Case[] = [
  { id: "IMM-2026-0041", client: "Ivan Petrov",      nationality: "Russian",   visaType: "F-1 → H-1B",       status: "Urgent",          attorney: "Sarah Okonkwo", deadline: "2026-07-30", filedDate: "2026-06-01", documents: 12, notes: "Change of status filing — cap-subject. Must submit before July 30 cutoff.", nextAction: "Submit I-129 to USCIS" },
  { id: "IMM-2026-0038", client: "Mei Lin Chen",     nationality: "Chinese",   visaType: "L-1A",             status: "Urgent",          attorney: "James Alvarez", deadline: "2026-07-28", filedDate: "2026-05-15", documents: 18, notes: "Intracompany transfer. Parent company docs still pending from HR.",         nextAction: "Collect org chart and employment verification" },
  { id: "IMM-2026-0035", client: "Maria Santos",     nationality: "Brazilian", visaType: "H-1B",             status: "Active",          attorney: "Sarah Okonkwo", deadline: "2026-08-15", filedDate: "2026-04-22", documents: 9,  notes: "Extension of current H-1B. LCA certified.",                               nextAction: "Await employer signature on I-129" },
  { id: "IMM-2026-0033", client: "Carlos Mendoza",   nationality: "Mexican",   visaType: "Asylum",           status: "Active",          attorney: "James Alvarez", deadline: "2026-08-20", filedDate: "2026-03-10", documents: 24, notes: "Affirmative asylum. Country conditions evidence being compiled.",           nextAction: "Prepare for USCIS interview" },
  { id: "IMM-2026-0030", client: "Ahmed Al-Rashid",  nationality: "Jordanian", visaType: "Green Card (EB-2)",status: "Document Review", attorney: "Priya Mehta",   deadline: "2026-09-03", filedDate: "2026-02-28", documents: 31, notes: "National interest waiver. Publications and citations being compiled.",       nextAction: "Review expert opinion letters" },
  { id: "IMM-2026-0027", client: "Kenji Watanabe",   nationality: "Japanese",  visaType: "TN",               status: "Document Review", attorney: "Priya Mehta",   deadline: "2026-09-22", filedDate: "2026-07-01", documents: 7,  notes: "Canadian TN renewal. Simple extension, all docs nearly ready.",            nextAction: "Final review of support letter" },
  { id: "IMM-2026-0024", client: "Priya Sharma",     nationality: "Indian",    visaType: "O-1A",             status: "Active",          attorney: "Sarah Okonkwo", deadline: "2026-10-01", filedDate: "2026-06-18", documents: 22, notes: "Extraordinary ability in tech. 3 peer review letters confirmed.",           nextAction: "Compile award documentation" },
  { id: "IMM-2026-0019", client: "Fatima Al-Zahra",  nationality: "Moroccan",  visaType: "Marriage-Based GC",status: "On Hold",         attorney: "James Alvarez", deadline: "2026-11-15", filedDate: "2026-01-20", documents: 16, notes: "I-485 adjustment. RFE received — awaiting additional evidence.",             nextAction: "Draft RFE response letter" },
  { id: "IMM-2026-0014", client: "Ana Lucía Rivera", nationality: "Colombian", visaType: "H-1B",             status: "Approved",        attorney: "Priya Mehta",   deadline: "2026-12-01", filedDate: "2025-11-10", documents: 11, notes: "H-1B approved. Coordinating employer for visa stamp appointment.",          nextAction: "Schedule consular appointment" },
];

const STATUS_OPACITY: Record<CaseStatus, string> = {
  Urgent:            "text-white/90",
  Active:            "text-white/70",
  "Document Review": "text-white/60",
  Approved:          "text-white/50",
  "On Hold":         "text-white/35",
};

const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const initials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

/* Glass surface utility */
const glass = "bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]";
const glassHover = "hover:bg-white/[0.07] transition-colors";

function StatusPill({ status }: { status: CaseStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.07] ${STATUS_OPACITY[status]} border border-white/[0.08] tracking-wide`}>
      <span className={`w-1 h-1 rounded-full ${status === "Urgent" ? "bg-white/90" : "bg-white/40"}`} />
      {status}
    </span>
  );
}

function DeadlineTag({ deadline }: { deadline: string }) {
  const d = daysUntil(deadline);
  if (d <= 7)  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/90 bg-white/[0.1] px-2 py-0.5 rounded-full border border-white/10"><AlertTriangle size={9} />{d}d</span>;
  if (d <= 21) return <span className="text-[11px] font-medium text-white/60">{d}d left</span>;
  return <span className="text-[11px] text-white/30">{fmt(deadline)}</span>;
}

function Monogram({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-[11px] font-semibold text-white/60 shrink-0 tracking-wide">
      {initials(name)}
    </div>
  );
}

/* ─── Case detail panel ─────────────────────────────────── */
function CaseDetailPanel({ c, onClose }: { c: Case; onClose: () => void }) {
  const days = daysUntil(c.deadline);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-[400px] flex flex-col overflow-y-auto border-l border-white/[0.08] [scrollbar-width:none]"
        style={{ background: "rgba(12,12,20,0.92)", backdropFilter: "blur(40px) saturate(180%)" }}
      >
        {/* Header */}
        <div className="px-7 pt-8 pb-6 border-b border-white/[0.07]">
          <div className="flex items-start justify-between mb-5">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-sm font-semibold text-white/70 tracking-wider">
              {initials(c.client)}
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.07] text-white/40 hover:text-white/80 transition-colors border border-white/[0.08]">
              <X size={13} />
            </button>
          </div>
          <h2 className="text-xl font-semibold text-white/90 tracking-tight">{c.client}</h2>
          <p className="text-sm text-white/35 mt-1 font-mono tracking-wider">{c.id}</p>
          <div className="mt-3.5">
            <StatusPill status={c.status} />
          </div>
        </div>

        {/* Meta */}
        <div className="px-7 py-6 grid grid-cols-2 gap-5 border-b border-white/[0.07]">
          {[
            { label: "Visa Type",  value: c.visaType },
            { label: "Attorney",   value: c.attorney },
            { label: "Filed",      value: fmt(c.filedDate) },
            { label: "Documents",  value: `${c.documents} files` },
            { label: "Nationality",value: c.nationality },
          ].map((row) => (
            <div key={row.label}>
              <p className="text-[10px] uppercase tracking-widest text-white/25 mb-1">{row.label}</p>
              <p className="text-sm text-white/75 font-medium">{row.value}</p>
            </div>
          ))}
        </div>

        {/* Deadline */}
        <div className="px-7 py-6 border-b border-white/[0.07]">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Filing Deadline</p>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-semibold text-white/85">{fmt(c.deadline)}</span>
              <span className="text-sm text-white/40">{days > 0 ? `${days} days` : "Overdue"}</span>
            </div>
            <div className="h-[3px] bg-white/[0.07] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-white/50"
                style={{ width: `${Math.max(3, Math.min(100, 100 - (days / 120) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="px-7 py-6 border-b border-white/[0.07]">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Case Notes</p>
          <p className="text-sm text-white/55 leading-relaxed">{c.notes}</p>
        </div>

        {/* Next action */}
        <div className="px-7 py-6 border-b border-white/[0.07]">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Next Action</p>
          <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <ChevronRight size={13} className="text-white/40 mt-0.5 shrink-0" />
            <p className="text-sm text-white/75">{c.nextAction}</p>
          </div>
        </div>

        {/* Documents */}
        <div className="px-7 py-6">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Documents</p>
          <div className="flex flex-col gap-2">
            {["I-129 Petition Form", "Support Letter — Employer", "Educational Credentials", "LCA Certification"].map((doc) => (
              <div key={doc} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025]">
                <div className="flex items-center gap-2.5">
                  <FileText size={12} className="text-white/30" />
                  <span className="text-sm text-white/60">{doc}</span>
                </div>
                <button className="text-white/25 hover:text-white/60 transition-colors p-1">
                  <Download size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto px-7 pb-8 pt-2 flex gap-2.5">
          <button className="flex-1 py-2.5 bg-white/90 hover:bg-white transition-colors text-[#080810] text-sm font-semibold rounded-xl tracking-tight">
            Update Case
          </button>
          <button className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-white/40 hover:text-white/70">
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Stat card ─────────────────────────────────────────── */
function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className={`${glass} rounded-2xl p-5 flex flex-col gap-4`}>
      <p className="text-[10px] font-medium text-white/30 uppercase tracking-widest">{label}</p>
      <p className="text-4xl font-semibold text-white/85 tracking-tight">{value}</p>
      <p className="text-xs text-white/30">{sub}</p>
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────── */
function Dashboard({ onSelectCase }: { onSelectCase: (c: Case) => void }) {
  const urgent  = CASES.filter((c) => c.status === "Urgent").length;
  const review  = CASES.filter((c) => c.status === "Document Review").length;
  const approved = CASES.filter((c) => c.status === "Approved").length;

  const sorted = [...CASES]
    .filter((c) => c.status !== "Approved")
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Overview</h1>
        <p className="text-sm text-white/30 mt-1">Tuesday, July 22, 2026</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Cases"  value={CASES.length} sub="Currently managed" />
        <StatCard label="Urgent"       value={urgent}       sub="Require immediate action" />
        <StatCard label="In Review"    value={review}       sub="Awaiting documents" />
        <StatCard label="Approved"     value={approved}     sub="This quarter" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Case list */}
        <div className={`lg:col-span-2 ${glass} rounded-2xl overflow-hidden`}>
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Active Cases</p>
            <button className="text-xs text-white/35 hover:text-white/60 transition-colors flex items-center gap-1">
              View all <ArrowUpRight size={11} />
            </button>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {sorted.slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCase(c)}
                className={`w-full flex items-center gap-4 px-6 py-3.5 ${glassHover} group text-left`}
              >
                <Monogram name={c.client} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/80 truncate">{c.client}</p>
                  <p className="text-xs text-white/30 mt-0.5">{c.visaType}</p>
                </div>
                <StatusPill status={c.status} />
                <DeadlineTag deadline={c.deadline} />
                <ChevronRight size={13} className="text-white/15 group-hover:text-white/35 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Deadline bars */}
        <div className={`${glass} rounded-2xl overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <p className="text-sm font-semibold text-white/80">Deadlines</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {sorted.slice(0, 7).map((c) => {
              const d = daysUntil(c.deadline);
              const pct = Math.max(3, Math.min(100, 100 - (d / 120) * 100));
              return (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/60 truncate">{c.client}</p>
                    <p className="text-xs text-white/30 ml-2 shrink-0 font-mono">{d}d</p>
                  </div>
                  <div className="h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-white/40" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Cases view ─────────────────────────────────────────── */
function CasesView({ onSelectCase }: { onSelectCase: (c: Case) => void }) {
  const [filter, setFilter] = useState<CaseStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"deadline" | "client">("deadline");

  const filters: (CaseStatus | "All")[] = ["All", "Urgent", "Active", "Document Review", "On Hold", "Approved"];

  const filtered = CASES.filter((c) => {
    const mf = filter === "All" || c.status === filter;
    const ms = !search || c.client.toLowerCase().includes(search.toLowerCase()) || c.visaType.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  }).sort((a, b) => sortKey === "deadline"
    ? new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    : a.client.localeCompare(b.client)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Cases</h1>
          <p className="text-sm text-white/30 mt-1">{filtered.length} cases</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white transition-colors text-[#080810] text-sm font-semibold rounded-xl">
          <Plus size={14} />
          New Case
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-2 ${glass} rounded-xl px-3.5 py-2.5 flex-1 min-w-48 max-w-xs`}>
          <Search size={13} className="text-white/30 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases..."
            className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none flex-1"
          />
        </div>

        <div className={`flex items-center gap-0.5 ${glass} rounded-xl p-1`}>
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-white/[0.1] text-white/85" : "text-white/30 hover:text-white/60"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSortKey(sortKey === "deadline" ? "client" : "deadline")}
          className={`flex items-center gap-1.5 px-3 py-2 ${glass} rounded-xl text-xs font-medium text-white/35 hover:text-white/60 transition-colors`}
        >
          <SlidersHorizontal size={12} />
          {sortKey === "deadline" ? "By Deadline" : "By Client"}
        </button>
      </div>

      <div className={`${glass} rounded-2xl overflow-hidden`}>
        <div className="grid grid-cols-[1fr_160px_140px_130px_36px] px-6 py-3 border-b border-white/[0.06]">
          {["Client", "Visa Type", "Status", "Deadline", ""].map((h) => (
            <span key={h} className="text-[10px] font-medium text-white/25 uppercase tracking-widest">{h}</span>
          ))}
        </div>
        <div className="divide-y divide-white/[0.04]">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectCase(c)}
              className={`w-full grid grid-cols-[1fr_160px_140px_130px_36px] items-center px-6 py-4 ${glassHover} group text-left`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Monogram name={c.client} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/80 truncate">{c.client}</p>
                  <p className="text-[11px] text-white/25 font-mono mt-0.5">{c.id}</p>
                </div>
              </div>
              <span className="text-sm text-white/45">{c.visaType}</span>
              <StatusPill status={c.status} />
              <DeadlineTag deadline={c.deadline} />
              <ChevronRight size={13} className="text-white/12 group-hover:text-white/35 transition-colors justify-self-end" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-16 text-center text-white/25 text-sm">No cases match this filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Clients view ────────────────────────────────────────── */
function ClientsView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Clients</h1>
          <p className="text-sm text-white/30 mt-1">{CASES.length} active clients</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white transition-colors text-[#080810] text-sm font-semibold rounded-xl">
          <Plus size={14} />
          Add Client
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {CASES.map((c) => (
          <div key={c.id} className={`${glass} rounded-2xl p-5 flex flex-col gap-4 hover:bg-white/[0.07] transition-colors cursor-pointer`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Monogram name={c.client} />
                <div>
                  <p className="text-sm font-semibold text-white/80">{c.client}</p>
                  <p className="text-xs text-white/30">{c.nationality}</p>
                </div>
              </div>
              <StatusPill status={c.status} />
            </div>
            <div className="pt-3.5 border-t border-white/[0.06] flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/25 font-mono">{c.id}</p>
                <p className="text-xs text-white/45 mt-0.5">{c.visaType}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe size={10} className="text-white/25" />
                <span className="text-xs text-white/30">{c.attorney}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyView({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <p className="text-lg font-semibold text-white/60 tracking-tight">{title}</p>
      <p className="text-sm text-white/25">{message}</p>
    </div>
  );
}

/* ─── Nav ──────────────────────────────────────────────── */
const NAV: { key: NavItem; icon: React.ReactNode; label: string }[] = [
  { key: "Dashboard", icon: <LayoutDashboard size={16} />, label: "Dashboard" },
  { key: "Cases",     icon: <FolderOpen size={16} />,      label: "Cases" },
  { key: "Clients",   icon: <Users size={16} />,           label: "Clients" },
  { key: "Documents", icon: <FileText size={16} />,        label: "Documents" },
  { key: "Calendar",  icon: <Calendar size={16} />,        label: "Calendar" },
];

/* ─── App shell ─────────────────────────────────────────── */
export default function App() {
  const [nav, setNav] = useState<NavItem>("Dashboard");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  const urgentCount = CASES.filter((c) => c.status === "Urgent").length;

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(80,80,120,0.18) 0%, transparent 70%), #080810",
      }}
    >
      {/* Sidebar */}
      <aside className="w-[210px] shrink-0 flex flex-col border-r border-white/[0.07]" style={{ background: "rgba(255,255,255,0.02)", backdropFilter: "blur(20px)" }}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/[0.1] border border-white/[0.12] flex items-center justify-center shrink-0">
              <Briefcase size={13} className="text-white/70" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/80 leading-tight tracking-tight">LexPath</p>
              <p className="text-[10px] text-white/25 leading-tight tracking-wide">Immigration</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2.5 py-3 flex flex-col gap-0.5">
          {NAV.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setNav(key)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors relative ${
                nav === key
                  ? "bg-white/[0.08] text-white/85 font-medium"
                  : "text-white/30 hover:text-white/65 hover:bg-white/[0.04]"
              }`}
            >
              {icon}
              <span>{label}</span>
              {key === "Cases" && urgentCount > 0 && (
                <span className="ml-auto text-[9px] font-semibold bg-white/[0.12] text-white/70 px-1.5 py-0.5 rounded-full min-w-[18px] text-center border border-white/[0.1]">
                  {urgentCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2.5 pb-5 border-t border-white/[0.06] pt-3 flex flex-col gap-0.5">
          <button
            onClick={() => setNav("Settings")}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
              nav === "Settings" ? "bg-white/[0.08] text-white/85 font-medium" : "text-white/30 hover:text-white/65 hover:bg-white/[0.04]"
            }`}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>

          <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
            <div className="w-6 h-6 rounded-full bg-white/[0.1] border border-white/[0.12] flex items-center justify-center text-[9px] font-semibold text-white/50 shrink-0">SO</div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/55 truncate">Sarah Okonkwo</p>
              <p className="text-[9px] text-white/25 truncate">Senior Attorney</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-[52px] flex items-center justify-between px-6 border-b border-white/[0.07] shrink-0" style={{ background: "rgba(8,8,16,0.7)", backdropFilter: "blur(20px)" }}>
          <div className={`flex items-center gap-2 ${glass} rounded-xl px-3.5 py-2 w-56`}>
            <Search size={12} className="text-white/25 shrink-0" />
            <input placeholder="Search cases..." className="bg-transparent text-sm text-white/75 placeholder:text-white/20 outline-none flex-1" />
          </div>
          <button className={`relative w-8 h-8 flex items-center justify-center rounded-xl ${glass} text-white/35 hover:text-white/65 transition-colors`}>
            <Bell size={14} />
            {urgentCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-white/70 rounded-full" />}
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-7 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav === "Dashboard" && <Dashboard onSelectCase={setSelectedCase} />}
          {nav === "Cases"     && <CasesView onSelectCase={setSelectedCase} />}
          {nav === "Clients"   && <ClientsView />}
          {nav === "Documents" && <EmptyView title="Document Library" message="Centralized document storage coming soon." />}
          {nav === "Calendar"  && <EmptyView title="Deadline Calendar" message="Calendar view coming soon." />}
          {nav === "Settings"  && <EmptyView title="Settings" message="Preferences and team management coming soon." />}
        </main>
      </div>

      {selectedCase && <CaseDetailPanel c={selectedCase} onClose={() => setSelectedCase(null)} />}
    </div>
  );
}
