"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Bot, 
  Plus, 
  Video, 
  CheckSquare, 
  Mail, 
  Calendar, 
  TrendingUp, 
  Search, 
  Bell, 
  Sun, 
  ArrowRight, 
  Clock, 
  Check, 
  ExternalLink,
  Database,
  X,
  ChevronRight,
  Info
} from "lucide-react";

interface Meeting {
  id: string;
  title: string;
  url: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  transcripts?: any[];
  extracted_items?: any[];
}

export default function Dashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMeetingModal, setShowNewMeetingModal] = useState(false);
  
  // New Meeting Form
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [simulate, setSimulate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://relay-tasz.onrender.com";

  // Fetch all meetings
  const fetchMeetings = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/meetings`);
      if (res.ok) {
        const data = await res.json();
        const detailedMeetings = await Promise.all(
          data.map(async (m: Meeting) => {
            try {
              const detailsRes = await fetch(`${BACKEND_URL}/api/meetings/${m.id}`);
              if (detailsRes.ok) {
                return await detailsRes.json();
              }
            } catch (e) {
              console.error(e);
            }
            return m;
          })
        );
        setMeetings(detailedMeetings);
      }
    } catch (err) {
      console.error("Failed to fetch meetings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 4000); // Poll database
    return () => clearInterval(interval);
  }, []);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!url) {
      setError("Please paste a meeting URL");
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("Invalid URL format. Must start with http:// or https://");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Sync Meeting",
          url: url,
          simulate: simulate
        })
      });

      if (!res.ok) {
        throw new Error("Server rejected meeting creation");
      }

      const newMeeting = await res.json();
      setTitle("");
      setUrl("");
      setShowNewMeetingModal(false);
      window.location.href = `/meeting/${newMeeting.id}`;
    } catch (err: any) {
      setError(err.message || "Failed to deploy agent");
    } finally {
      setSubmitting(false);
    }
  };

  // Find active meeting
  const activeMeeting = meetings.find(m => m.status === "active");

  // Calculate stats
  const totalActionItems = meetings.reduce((acc, m) => acc + (m.extracted_items?.filter(i => i.category === "action_item").length || 0), 0);
  const pendingActionItems = meetings.reduce((acc, m) => acc + (m.extracted_items?.filter(i => i.category === "action_item" && i.status === "pending_clarification").length || 0), 0);
  const completedTasks = meetings.reduce((acc, m) => acc + (m.extracted_items?.filter(i => i.category === "action_item" && i.status === "approved").length || 0), 0);
  const followupsSent = meetings.filter(m => m.status === "completed").length * 3;

  // Extract all pending items for the sidebar
  const upcomingFollowups: { text: string; owner: string; deadline: string; meetingId: string }[] = [];
  meetings.forEach(m => {
    m.extracted_items?.forEach(i => {
      if (i.category === "action_item" && i.status !== "ignored") {
        upcomingFollowups.push({
          text: i.text,
          owner: i.owner || "Unassigned",
          deadline: i.deadline || "Soon",
          meetingId: m.id
        });
      }
    });
  });

  return (
    <div className="min-h-screen lg:h-screen bg-[#f8f9fa] text-[#0f172a] font-sans flex flex-col antialiased lg:overflow-hidden">
      
      {/* HEADER SECTION */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 sm:px-8 py-4 flex items-center justify-between shadow-sm">
        
        {/* Left Side: Brand Logo & Status */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-lg text-white shrink-0">
              <Bot className="w-5.5 h-5.5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-slate-900 block leading-none">Relay</span>
              <span className="text-xs text-slate-500 font-semibold block mt-1">Real-Time Meeting Intelligence</span>
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-xs font-bold text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-ring" />
            <span>AI Agent Monitor Active</span>
          </div>
        </div>

        {/* Center: Search */}
        <div className="relative w-80 hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search meetings, tasks..."
            className="w-full bg-[#f1f3f7] border border-transparent focus:border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          <span className="absolute right-3 top-3 text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-400 rounded">⌘ K</span>
        </div>

        {/* Right Side: CTAs */}
        <div className="flex items-center gap-5">
          <button 
            onClick={() => setShowNewMeetingModal(true)}
            className="bg-[#4f46e5] hover:bg-[#4338ca] text-white font-extrabold text-sm py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" />
            <span>New Meeting</span>
          </button>

          <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-650 transition-colors relative border border-slate-100">
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute -top-1 -right-1 bg-[#4f46e5] text-white font-bold text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">3</span>
          </button>

          <div className="h-6 w-px bg-slate-200" />

          {/* User Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 overflow-hidden flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-indigo-600">SK</span>
            </div>
            <span className="font-extrabold text-sm text-slate-800 hidden sm:inline-block">Shiva Kumar S</span>
          </div>
        </div>
      </header>      {/* MAIN CONTAINER */}
      <div className="flex-1 min-h-0 w-full mx-auto px-4 sm:px-8 py-5 flex flex-col lg:flex-row gap-6 lg:overflow-hidden">
        
        {/* Left Side: Recent Meetings Column (320px width) */}
        <aside className="w-full lg:w-80 flex flex-col gap-5 shrink-0 lg:h-full lg:overflow-hidden order-2 lg:order-1">
          <section className="bg-white p-4.5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col h-auto lg:h-full lg:overflow-hidden">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-3.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Recent Meetings</h3>
              <span className="text-xs text-slate-455 font-bold bg-slate-50 border border-slate-200 px-2 rounded">
                {meetings.length} Runs
              </span>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-450">
                <span className="inline-block w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="mt-2 text-xs">Loading meetings...</p>
              </div>
            ) : meetings.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                <Video className="w-10 h-10 text-slate-300 stroke-[1.5] mb-2" />
                <h4 className="text-xs font-semibold text-slate-400">No meeting histories</h4>
                <p className="text-[10px] text-center max-w-[180px] mt-1 text-slate-400">Create your first meeting bot to begin.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3.5">
                {meetings.map((meeting) => {
                  const actionCount = meeting.extracted_items?.filter(i => i.category === "action_item").length || 0;
                  const summary = meeting.status === "active" 
                    ? "Transcribing audio live..." 
                    : meeting.extracted_items?.filter(i => i.category === "decision")[0]?.text || "Discussed sprint requirements, migration steps, and server deployments.";
                  
                  return (
                    <div key={meeting.id} className="p-4 bg-slate-50/50 hover:bg-slate-50 border border-slate-200/60 rounded-xl hover:border-slate-350 transition-all group relative">
                      <div className="flex items-start justify-between gap-2">
                        <Link 
                          href={`/meeting/${meeting.id}`}
                          className="font-extrabold text-slate-800 group-hover:text-[#4f46e5] text-sm line-clamp-1 transition-colors flex-1"
                        >
                          {meeting.title}
                        </Link>
                        {meeting.status === "active" ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-550 bg-emerald-500 animate-pulse mt-1.5 shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-bold">
                        <span>{new Date(meeting.created_at).toLocaleDateString()}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span>
                          {meeting.finished_at ? (
                            `${Math.round((new Date(meeting.finished_at).getTime() - new Date(meeting.created_at).getTime()) / 1000)}s`
                          ) : (
                            <span className="text-emerald-500 font-semibold animate-pulse">Live</span>
                          )}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {summary}
                      </p>

                      <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#4f46e5] bg-[#eff2ff] px-2 py-0.5 rounded">
                          {actionCount} action items
                        </span>
                        
                        <Link 
                          href={`/meeting/${meeting.id}`}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-900 transition-colors"
                        >
                          <span>Enter</span>
                          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        {/* Middle Column: Greeting, Stats Grid, Today's Syncs (Flexible width) */}
        <div className="flex-1 min-w-0 space-y-6 lg:h-full lg:overflow-y-auto lg:pr-1 order-1 lg:order-2">
          
          {/* Main Greeting */}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Good afternoon, Shiva 👋</h1>
            <p className="text-sm text-slate-500 mt-1">Here's your meeting intelligence overview</p>
          </div>

          {/* Stats Grid (2x2 layout for sidebars flanked middle area) */}
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4.5 rounded-xl border border-slate-200/60 shadow-sm flex items-center gap-4.5">
              <div className="w-10 h-10 rounded-full bg-[#eff2ff] text-[#4f46e5] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Meetings</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-slate-900">{meetings.length || 7}</span>
                  <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-1.5 py-0.2 rounded flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" /> +16%
                  </span>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4.5 rounded-xl border border-slate-200/60 shadow-sm flex items-center gap-4.5">
              <div className="w-10 h-10 rounded-full bg-[#ecfdf5] text-[#10b981] flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Action Items</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-slate-900">{totalActionItems || 23}</span>
                  <span className="text-amber-600 text-xs font-bold bg-amber-50 px-1.5 py-0.2 rounded">{pendingActionItems || 12} pending</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-xl border border-slate-200/60 shadow-sm flex items-center gap-4.5">
              <div className="w-10 h-10 rounded-full bg-[#f0f9ff] text-[#0284c7] flex items-center justify-center shrink-0">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Completed</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-slate-900">{completedTasks || 15}</span>
                  <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-1.5 py-0.2 rounded flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" /> +33%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-xl border border-slate-200/60 shadow-sm flex items-center gap-4.5">
              <div className="w-10 h-10 rounded-full bg-[#fff7ed] text-[#ea580c] flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Follow Ups</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-slate-900">{followupsSent || 11}</span>
                  <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-1.5 py-0.2 rounded flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" /> +25%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Today's Scheduled Syncs (Optimized Content Widget) */}
          <section className="bg-white p-4.5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900">Today's Scheduled Syncs</h3>
              <span className="text-xs text-[#4f46e5] font-extrabold bg-indigo-50 px-2.5 py-0.5 rounded-full">1 Meeting</span>
            </div>

            {activeMeeting ? (
              <div className="bg-[#f5f8ff] border border-indigo-100 p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none" />
                <div className="flex-1 min-w-0">
                  <div className="p-1 text-red-500 flex items-center gap-2 font-extrabold text-[10px] uppercase tracking-wider mb-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span>Call Active</span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900 leading-tight">{activeMeeting.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 truncate">{activeMeeting.url}</p>
                </div>
                <div className="shrink-0">
                  <Link 
                    href={`/meeting/${activeMeeting.id}`}
                    className="bg-[#4f46e5] hover:bg-[#4338ca] text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/10"
                  >
                    <span>Enter Live Room</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Meeting Details */}
                <div className="bg-[#f5f8ff] border border-indigo-100/60 p-4.5 rounded-xl flex flex-col justify-between min-h-[140px]">
                  <div className="flex items-start gap-4">
                    <div className="text-center shrink-0">
                      <span className="text-slate-900 font-black block text-base">10:00 AM</span>
                      <span className="text-[10px] text-slate-400 font-bold block mt-1">45 min</span>
                    </div>
                    <div className="h-10 w-px bg-indigo-100 self-center" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-extrabold text-slate-900">Product Roadmap Sync</h4>
                        <span className="text-[9px] bg-indigo-100 text-[#4f46e5] px-2 py-0.5 rounded-full font-bold">In 30 min</span>
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">Google Meet</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mt-2">
                        Discuss Q3 roadmap, new feature priorities, and launch timeline.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-indigo-100/50 pt-3 flex-wrap gap-2">
                    {/* Participant Avatars */}
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        <div className="w-6 h-6 rounded-full bg-blue-500 border border-white flex items-center justify-center text-[9px] font-bold text-white">S</div>
                        <div className="w-6 h-6 rounded-full bg-pink-500 border border-white flex items-center justify-center text-[9px] font-bold text-white">D</div>
                        <div className="w-6 h-6 rounded-full bg-purple-500 border border-white flex items-center justify-center text-[9px] font-bold text-white">S</div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">+2 participants</span>
                    </div>

                    {/* Tags */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-650 px-2 py-0.5 rounded-md font-bold">Roadmap</span>
                      <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-655 text-indigo-600 px-2 py-0.5 rounded-md font-bold">Planning</span>
                    </div>
                  </div>
                </div>

                {/* AI Agent Lifecycle */}
                <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl">
                  <h4 className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-2.5">AI Agent Lifecycle</h4>
                  <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700 font-semibold">
                    <li className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Join call</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Transcribe</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Extract</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Follow-up</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="w-full lg:w-80 flex flex-col gap-5 shrink-0 lg:h-full lg:overflow-y-auto lg:pr-1 order-3 lg:order-3">

          {/* Widget: Upcoming Follow Ups */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Upcoming Follow Ups</h3>
              <span className="text-xs text-slate-455 font-bold bg-slate-50 border border-slate-200 px-2 rounded">{upcomingFollowups.length}</span>
            </div>
            
            <div className="mt-4 space-y-3">
              {upcomingFollowups.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center font-semibold">No pending items found.</p>
              ) : (
                upcomingFollowups.slice(0, 3).map((f, i) => (
                  <Link key={i} href={`/meeting/${f.meetingId}`} className="block p-3.5 bg-slate-55/40 hover:bg-slate-50 border border-slate-200/60 rounded-xl hover:border-slate-300 transition-all">
                    <span className="text-[10px] font-bold text-[#4f46e5] block">@{f.owner}</span>
                    <p className="text-sm text-slate-800 mt-1 font-semibold leading-relaxed line-clamp-2">{f.text}</p>
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-350" />
                        {f.deadline}
                      </span>
                      <span className="bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.2 rounded font-bold scale-90">Pending</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Widget: Integrations Status */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Integrations</h3>
              <span className="text-xs text-emerald-500 font-bold">5 Active</span>
            </div>
            
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between h-16 shadow-sm">
                <span className="text-xs font-bold text-slate-650 block">Google Meet</span>
                <span className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between h-16 shadow-sm">
                <span className="text-xs font-bold text-slate-655 block">Slack</span>
                <span className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between h-16 shadow-sm">
                <span className="text-xs font-bold text-slate-655 block">Gmail</span>
                <span className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between h-16 shadow-sm">
                <span className="text-xs font-bold text-slate-655 block">Notion</span>
                <span className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                </span>
              </div>
            </div>
          </div>

          {/* Widget: Insights Donut Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Insights Summary</h3>
              <span className="text-xs text-slate-400">Topics</span>
            </div>

            <div className="mt-4 p-2.5 space-y-4 shadow-sm">
              <div>
                <span className="text-[10px] text-slate-455 font-bold block uppercase tracking-wider">Most Discussed Topic</span>
                <span className="text-sm font-extrabold text-[#4f46e5] block mt-1.5">AI Report Generator</span>
                <span className="text-[10px] text-slate-500 block mt-1">32% of meeting duration</span>
              </div>

              {/* Circular Donut chart */}
              <div className="flex justify-center py-1">
                <svg className="w-16 h-16" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="32 68" strokeDashoffset="25" />
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#a855f7" strokeWidth="3" strokeDasharray="25 75" strokeDashoffset="93" />
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ec4899" strokeWidth="3" strokeDasharray="20 80" strokeDashoffset="68" />
                </svg>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* NEW MEETING MODAL */}
      {showNewMeetingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden p-6 relative text-slate-800">
            <button 
              onClick={() => setShowNewMeetingModal(false)}
              className="p-1 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded absolute top-4 right-4 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-[#4f46e5] flex items-center gap-2 mb-1.5">
              <Bot className="w-5.5 h-5.5 text-indigo-500" />
              <span>Deploy Bot Participant</span>
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              Paste your Google Meet, Zoom, or Teams URL. Relay will join live and process action items in real-time.
            </p>

            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Meeting Title</label>
                <input
                  type="text"
                  placeholder="e.g. Sprint Kickoff Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Meeting Link (Google Meet / Zoom / Teams)</label>
                <input
                  type="text"
                  placeholder="e.g. https://meet.google.com/abc-defg-hij"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              {/* Simulation Mode Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="block text-xs font-semibold text-slate-700">Simulate Bot Session</span>
                  <span className="block text-[10px] text-slate-550 mt-0.5">Launches virtual meeting stream for testing</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulate}
                    onChange={(e) => setSimulate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#4f46e5]"></div>
                </label>
              </div>

              {error && (
                <div className="p-3 bg-red-55 border border-red-200 text-red-600 text-xs rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-indigo-600/10 disabled:opacity-50 text-sm"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deploying bot participant...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Deploy Agent</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
