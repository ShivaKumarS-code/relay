"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { 
  ArrowLeft, 
  Clock, 
  User, 
  Calendar, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Mail,
  Database,
  Bell,
  Check,
  X,
  Edit2,
  ChevronRight,
  TrendingUp,
  Info
} from "lucide-react";

function Slack({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M3.362 10.11c0 .926-.756 1.681-1.681 1.681S0 11.036 0 10.111.756 8.43 1.68 8.43h1.682zm.846 0c0-.924.756-1.68 1.681-1.68s1.681.756 1.681 1.68v4.21c0 .924-.756 1.68-1.68 1.68a1.685 1.685 0 0 1-1.682-1.68zM5.89 3.362c-.926 0-1.682-.756-1.682-1.681S4.964 0 5.89 0s1.68.756 1.68 1.68v1.682zm0 .846c.924 0 1.68.756 1.68 1.681S6.814 7.57 5.89 7.57H1.68C.757 7.57 0 6.814 0 5.89c0-.926.756-1.682 1.68-1.682zm6.749 1.682c0-.926.755-1.682 1.68-1.682S16 4.964 16 5.889s-.756 1.681-1.68 1.681h-1.681zm-.848 0c0 .924-.755 1.68-1.68 1.68A1.685 1.685 0 0 1 8.43 5.89V1.68C8.43.757 9.186 0 10.11 0c.926 0 1.681.756 1.681 1.68zm-1.681 6.748c.926 0 1.682.756 1.682 1.681S11.036 16 10.11 16s-1.681-.756-1.681-1.68v-1.682h1.68zm0-.847c-.924 0-1.68-.755-1.68-1.68s.756-1.681 1.68-1.681h4.21c.924 0 1.68.756 1.68 1.68 0 .926-.756 1.681-1.68 1.681z" />
    </svg>
  );
}

interface Transcript {
  speaker: string;
  text: string;
  timestamp: string;
  created_at: string;
}

interface ExtractedItem {
  id: string;
  category: string;
  text: string;
  owner: string | null;
  deadline: string | null;
  confidence_score: number;
  status: string; // pending_clarification, approved, ignored
  clarification_question: string | null;
  user_response: string | null;
}

interface IntegrationLog {
  service: string;
  status: string;
  details: string;
}

interface Meeting {
  id: string;
  title: string;
  url: string;
  status: string;
  created_at: string;
  finished_at: string | null;
}

export default function MeetingRoom() {
  const { id } = useParams();
  
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [extractions, setExtractions] = useState<ExtractedItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationLog[]>([]);
  
  const [activeTab, setActiveTab] = useState<"actions" | "decisions" | "questions" | "discussion">("actions");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [activeEditItem, setActiveEditItem] = useState<string | null>(null);
  
  // Edit forms
  const [editForm, setEditForm] = useState({ text: "", owner: "", deadline: "" });
  
  // Custom response forms for clarifications
  const [clarifyResponses, setClarifyResponses] = useState<Record<string, string>>({});
  
  // Log overlays for integrations
  const [activeLogOverlay, setActiveLogOverlay] = useState<IntegrationLog | null>(null);

  const transcriptsEndRef = useRef<HTMLDivElement | null>(null);
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://relay-tasz.onrender.com";

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/meetings/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        setMeeting({
          id: data.id,
          title: data.title,
          url: data.url,
          status: data.status,
          created_at: data.created_at,
          finished_at: data.finished_at
        });
        setTranscripts(data.transcripts);
        setExtractions(data.extracted_items);
        setIntegrations(data.integrations_logs);
      } catch (err) {
        console.error("Failed to load meeting room:", err);
      }
    };
    
    fetchInitialData();
  }, [id]);

  // Connect WebSockets
  useEffect(() => {
    const wsUrl = BACKEND_URL.startsWith("https")
      ? BACKEND_URL.replace("https://", "wss://") + `/api/ws/${id}`
      : BACKEND_URL.replace("http://", "ws://") + `/api/ws/${id}`;
    let socket = new WebSocket(wsUrl);
    
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      const { type, data } = payload;
      
      if (type === "transcript") {
        setTranscripts(prev => [...prev, data]);
      } else if (type === "extractions") {
        setExtractions(data);
      } else if (type === "integrations") {
        setIntegrations(data);
      } else if (type === "meeting_active") {
        setMeeting(prev => prev ? { ...prev, status: "active" } : null);
      } else if (type === "meeting_processing") {
        setMeeting(prev => prev ? { ...prev, status: "processing" } : null);
      } else if (type === "status_update") {
        setStatusMessage(data.message);
        setTimeout(() => setStatusMessage(""), 4000);
      } else if (type === "meeting_completed") {
        setMeeting(prev => prev ? { ...prev, status: "completed", finished_at: new Date().toISOString() } : null);
      }
    };
    
    socket.onclose = () => {
      logger_log("WebSocket connection closed, retrying...");
    };
    
    return () => {
      socket.close();
    };
  }, [id]);

  // Autoscroll transcripts
  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const logger_log = (msg: string) => {
    console.log("[Relay Client]:", msg);
  };

  // Resolve Clarification
  const handleResolveClarification = async (itemId: string, customText?: string) => {
    const responseText = customText || clarifyResponses[itemId] || "Default approval";
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/meetings/${id}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          response: responseText,
          // If we want to automatically apply assignments based on the clarification response:
          edited_owner: responseText.toLowerCase().includes("dev") ? "David" : responseText.toLowerCase().includes("staging") ? "David" : undefined,
          edited_deadline: "by Friday"
        })
      });
      if (res.ok) {
        setClarifyResponses(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Direct edit save
  const handleSaveEdit = async (itemId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/meetings/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          action: "edit",
          text: editForm.text,
          owner: editForm.owner || null,
          deadline: editForm.deadline || null
        })
      });
      if (res.ok) {
        setActiveEditItem(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleIgnoreItem = async (itemId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/meetings/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          action: "ignore"
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveItem = async (itemId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/meetings/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          action: "approve"
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (item: ExtractedItem) => {
    setActiveEditItem(item.id);
    setEditForm({
      text: item.text,
      owner: item.owner || "",
      deadline: item.deadline || ""
    });
  };

  // Split extractions by tab
  const actionItems = extractions.filter(e => e.category === "action_item" && e.status !== "ignored");
  const decisions = extractions.filter(e => e.category === "decision" && e.status !== "ignored");
  const questions = extractions.filter(e => e.category === "question" && e.status !== "ignored");
  const keyPoints = extractions.filter(e => e.category === "key_point" && e.status !== "ignored");

  // Speaker name color utility
  const getSpeakerColor = (speaker: string) => {
    const s = speaker.toLowerCase();
    if (s.includes("sarah")) return "text-purple-700 bg-purple-50/80 border border-purple-200/50 shadow-xs";
    if (s.includes("shiva")) return "text-indigo-700 bg-indigo-50/80 border border-indigo-200/50 shadow-xs";
    if (s.includes("david")) return "text-sky-700 bg-sky-50/80 border border-sky-200/50 shadow-xs";
    return "text-slate-600 bg-slate-100/80 border border-slate-200/50 shadow-xs";
  };

  if (!meeting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[#f8f9fa] text-slate-400 min-h-screen">
        <span className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin shadow-sm" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-indigo-600">Entering meeting workroom...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen max-w-full overflow-hidden bg-[#f8f9fa] text-slate-800 font-sans">
      
      {/* Top Banner Status */}
      {statusMessage && (
        <div className="bg-indigo-600 px-4 py-2.5 text-center text-xs font-semibold text-white transition-all duration-300 animate-pulse flex items-center justify-center gap-2 shadow-sm z-50">
          <Info className="w-4 h-4" />
          {statusMessage}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4.5 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-all border border-slate-200/50 hover:border-slate-300/60 shadow-xs">
            <ArrowLeft className="w-4.5 h-4.5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{meeting.title}</h1>
              {meeting.status === "active" ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-wide bg-rose-50 text-rose-600 border border-rose-200/60 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse-ring" />
                  LIVE DIARIZATION
                </span>
              ) : meeting.status === "scheduled" ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-wide bg-amber-50 text-amber-600 border border-amber-250/60 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-550 animate-pulse" />
                  BOT JOINING...
                </span>
              ) : meeting.status === "processing" ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  PROCESSING SYNC...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-250/60 shadow-xs">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  CONCLUDED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-md font-mono bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/40 inline-block">{meeting.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-650 flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-slate-600">Started:</span>
            <span className="font-mono text-indigo-600">{new Date(meeting.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace split */}
      <div className="flex-1 flex overflow-hidden bg-slate-50/50">
        
        {/* Left Panel: Transcripts (Diarized feed) */}
        <div className="w-1/2 border-r border-slate-200 flex flex-col overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-650 animate-pulse" />
              <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-550">Diarized Transcript Feed</h2>
            </div>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-mono border border-indigo-100 shadow-xs">
              Deepgram Live
            </span>
          </div>

          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-3.5 bg-white/50">
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-24">
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-3.5 shadow-xs">
                  <MessageSquare className="w-5 h-5 text-slate-350 stroke-[1.5]" />
                </div>
                <p className="text-xs font-bold text-slate-700">Waiting for live audio feed...</p>
                <p className="text-[10px] text-slate-450 mt-1 max-w-xs leading-relaxed">Speak in the integrated call window or simulate audio chunks to stream transcription here.</p>
              </div>
            ) : (
              transcripts.map((t, idx) => (
                <div key={idx} className="flex gap-4 items-start animate-fade-in group hover:bg-slate-50/50 p-2.5 -mx-2.5 rounded-2xl transition-all">
                  <div className={`text-[10px] px-2.5 py-0.8 rounded-full border font-bold shrink-0 uppercase tracking-wider w-20 text-center truncate ${getSpeakerColor(t.speaker)}`}>
                    {t.speaker}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed text-slate-700 group-hover:text-slate-900 transition-colors font-normal">{t.text}</p>
                    <span className="text-[9px] text-slate-400 block mt-1.5 font-mono">{t.timestamp}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptsEndRef} />
          </div>
        </div>

        {/* Right Panel: Extraction Hub & Clarification loops */}
        <div className="w-1/2 flex flex-col overflow-hidden bg-slate-50/30">
          
          {/* Navigation tabs */}
          <div className="border-b border-slate-200 bg-white p-3 flex gap-1.5 shrink-0">
            {(["actions", "decisions", "questions", "discussion"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const count = 
                tab === "actions" ? actionItems.length : 
                tab === "decisions" ? decisions.length : 
                tab === "questions" ? questions.length : 
                keyPoints.length;
              const label = 
                tab === "actions" ? "Action Items" : 
                tab === "decisions" ? "Decisions" : 
                tab === "questions" ? "Questions" : 
                "Key Points";
              
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 border cursor-pointer ${
                    isActive
                      ? "bg-indigo-50 border-indigo-200/60 text-indigo-700 shadow-xs"
                      : "bg-transparent border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-mono font-bold ${
                    isActive ? "bg-indigo-200/60 text-indigo-800" : "bg-slate-100 text-slate-400"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            
            {/* 1. Action Items Panel */}
            {activeTab === "actions" && (
              <div className="space-y-4">
                {actionItems.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                      <CheckCircle className="w-5 h-5 text-slate-400 stroke-[1.5]" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">All caught up</p>
                    <p className="text-xs text-slate-450 mt-1 max-w-xs mx-auto leading-relaxed">No action items have been extracted from the meeting transcripts yet.</p>
                  </div>
                ) : (
                  actionItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={`p-5 rounded-2xl border transition-all ${
                        item.status === "pending_clarification" 
                          ? "bg-amber-50/50 border-amber-250 shadow-sm shadow-amber-50/10 animate-pulse-ring-amber" 
                          : "bg-white border-slate-200 shadow-xs hover:border-slate-350 hover:shadow-sm"
                      }`}
                    >
                      {/* Clarification Alert Header */}
                      {item.status === "pending_clarification" && (
                        <div className="flex items-center gap-2 mb-3.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                          <span>Clarification Required</span>
                          <span className="ml-auto text-[9px] bg-amber-100/60 px-2 py-0.5 rounded-md border border-amber-200/60 font-mono font-bold text-amber-800">
                            Confidence: {Math.round(item.confidence_score * 100)}%
                          </span>
                        </div>
                      )}

                      {/* Main Task Row */}
                      {activeEditItem === item.id ? (
                        /* Edit Form */
                        <div className="space-y-3">
                          <textarea
                            value={editForm.text}
                            onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              placeholder="Assignee (Owner)"
                              value={editForm.owner}
                              onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })}
                              className="bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                            />
                            <input
                              type="text"
                              placeholder="Deadline (e.g. by Friday)"
                              value={editForm.deadline}
                              onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                              className="bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setActiveEditItem(null)} className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-655 transition-colors cursor-pointer">
                              Cancel
                            </button>
                            <button onClick={() => handleSaveEdit(item.id)} className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition-all cursor-pointer">
                              Save Task
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Standard View */
                        <div>
                          <p className="text-slate-800 text-sm font-semibold leading-relaxed">{item.text}</p>
                          
                          {/* Tags block */}
                          <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-600 shadow-2xs">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>Owner:</span>
                              <strong className={item.owner ? "text-indigo-650 font-bold" : "text-slate-450 italic font-normal"}>
                                {item.owner || "Unassigned"}
                              </strong>
                            </span>

                            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-600 shadow-2xs">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>Due:</span>
                              <strong className={item.deadline ? "text-purple-650 font-bold" : "text-slate-450 italic font-normal"}>
                                {item.deadline || "No deadline"}
                              </strong>
                            </span>

                            {item.status === "approved" && (
                              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2.5 py-0.8 rounded-full border border-emerald-200/60 shadow-2xs">
                                <CheckCircle className="w-3.5 h-3.5" />
                                CONFIRMED
                              </span>
                            )}
                          </div>

                          {/* Direct Actions (Approve, Edit, Ignore) */}
                          {item.status !== "pending_clarification" && (
                            <div className="mt-4 pt-3.5 border-t border-slate-100 flex gap-2 justify-end opacity-40 hover:opacity-100 transition-opacity">
                              <button onClick={() => handleIgnoreItem(item.id)} className="px-2.5 py-1 text-xs hover:text-rose-600 text-slate-500 hover:bg-rose-50/50 rounded-lg flex items-center gap-1 transition-colors cursor-pointer font-bold">
                                <X className="w-3.5 h-3.5" /> Ignore
                              </button>
                              <button onClick={() => startEdit(item)} className="px-2.5 py-1 text-xs hover:text-indigo-600 text-slate-500 hover:bg-indigo-50/50 rounded-lg flex items-center gap-1 transition-colors cursor-pointer font-bold">
                                <Edit2 className="w-3.5 h-3.5" /> Edit
                              </button>
                              {item.status !== "approved" && (
                                <button onClick={() => handleApproveItem(item.id)} className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-xl border border-indigo-200/50 hover:border-indigo-600 text-xs font-bold transition-all cursor-pointer shadow-2xs">
                                  Approve
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Clarification prompt loop */}
                      {item.status === "pending_clarification" && item.clarification_question && (
                        <div className="mt-4 pt-4 border-t border-amber-200/60 space-y-3.5 bg-amber-50/30 -mx-5 -mb-5 p-5 rounded-b-2xl">
                          <div className="bg-white border border-amber-200/50 rounded-xl p-3.5 shadow-2xs">
                            <span className="text-amber-705 font-bold block uppercase tracking-wider text-[9px] mb-1">Agent Question</span>
                            <p className="text-slate-700 text-xs leading-relaxed font-semibold italic">
                              "{item.clarification_question}"
                            </p>
                          </div>

                          {/* Quick buttons helper for the simulated AWS question */}
                          {item.clarification_question.includes("AWS account") ? (
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleResolveClarification(item.id, "Use the dev account")} 
                                className="flex-1 bg-white border border-slate-200 hover:border-amber-400 text-slate-700 hover:text-amber-800 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left shadow-2xs hover:bg-slate-50"
                              >
                                👉 "Use the dev account"
                              </button>
                              <button 
                                onClick={() => handleResolveClarification(item.id, "Use the staging account")}
                                className="flex-1 bg-white border border-slate-200 hover:border-amber-400 text-slate-700 hover:text-amber-800 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left shadow-2xs hover:bg-slate-50"
                              >
                                👉 "Use the staging account"
                              </button>
                            </div>
                          ) : null}

                          {/* Text input */}
                          <div className="flex gap-2 mt-2">
                            <input
                              type="text"
                              placeholder="Resolve manually... (e.g. Shiva to write notes)"
                              value={clarifyResponses[item.id] || ""}
                              onChange={(e) => setClarifyResponses({ ...clarifyResponses, [item.id]: e.target.value })}
                              className="flex-1 bg-white border border-slate-250 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                            />
                            <button 
                              onClick={() => handleResolveClarification(item.id)}
                              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer hover:shadow-sm"
                            >
                              Resolve
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 2. Decisions Panel */}
            {activeTab === "decisions" && (
              <div className="space-y-4">
                {decisions.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                      <CheckCircle className="w-5 h-5 text-slate-400 stroke-[1.5]" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No decisions yet</p>
                    <p className="text-xs text-slate-450 mt-1 max-w-xs mx-auto leading-relaxed">Decisions made during the sync will be logged here automatically.</p>
                  </div>
                ) : (
                  decisions.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 p-5 rounded-2xl flex gap-3.5 items-start shadow-xs hover:border-slate-350 transition-all">
                      <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-150 shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[9px] text-emerald-600 font-black uppercase tracking-wider">Decision Logged</span>
                        <p className="text-slate-800 text-sm font-bold mt-1 leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 3. Open Questions Panel */}
            {activeTab === "questions" && (
              <div className="space-y-4">
                {questions.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                      <HelpCircle className="w-5 h-5 text-slate-400 stroke-[1.5]" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No questions raised</p>
                    <p className="text-xs text-slate-450 mt-1 max-w-xs mx-auto leading-relaxed">Unresolved questions discussed in the meeting will be listed here.</p>
                  </div>
                ) : (
                  questions.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 p-5 rounded-2xl flex gap-3.5 items-start shadow-xs hover:border-slate-350 transition-all">
                      <HelpCircle className="w-4.5 h-4.5 text-indigo-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-[9px] text-indigo-650 font-black uppercase tracking-wider">Unresolved Question</span>
                        <p className="text-slate-800 text-sm font-bold mt-1 leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 4. Key Discussion Points Panel */}
            {activeTab === "discussion" && (
              <div className="space-y-4">
                {keyPoints.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                      <MessageSquare className="w-5 h-5 text-slate-400 stroke-[1.5]" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No discussion points</p>
                    <p className="text-xs text-slate-450 mt-1 max-w-xs mx-auto leading-relaxed">General highlights and key points from the sync will be shown here.</p>
                  </div>
                ) : (
                  keyPoints.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 p-5 rounded-2xl flex gap-3.5 items-start shadow-xs hover:border-slate-355 transition-all">
                      <ChevronRight className="w-4.5 h-4.5 text-purple-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-slate-700 text-sm font-medium leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Integration Progress Panel Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4.5 flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-4 shadow-xs z-10">
        <div>
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>Autonomous Follow-up Pipeline</span>
            <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.8 py-0.5 rounded-md border border-emerald-200/65 font-bold font-sans">
              Idempotent Logs
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Triggers Gmail email to invitees, Slack channel task post, Notion DB log, and Reminder scheduler immediately after call ends.</p>
        </div>

        {/* Integration icons grid */}
        <div className="flex items-center gap-3">
          {/* Gmail */}
          {(() => {
            const log = integrations.find(l => l.service === "gmail");
            return (
              <div 
                onClick={() => log && setActiveLogOverlay(log)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  !log 
                    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed" 
                    : log.status === "success" 
                    ? "bg-rose-50 border-rose-200/70 text-rose-700 hover:bg-rose-100/40 hover:shadow-xs" 
                    : "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100/40"
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Gmail</span>
                <span className={`w-1.5 h-1.5 rounded-full ${!log ? "bg-slate-300" : log.status === "success" ? "bg-rose-500" : "bg-amber-500 animate-pulse"}`} />
              </div>
            );
          })()}

          {/* Slack */}
          {(() => {
            const log = integrations.find(l => l.service === "slack");
            return (
              <div 
                onClick={() => log && setActiveLogOverlay(log)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  !log 
                    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed" 
                    : log.status === "success" 
                    ? "bg-purple-50 border-purple-200/70 text-purple-700 hover:bg-purple-100/40 hover:shadow-xs" 
                    : "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100/40"
                }`}
              >
                <Slack className="w-4 h-4" />
                <span>Slack</span>
                <span className={`w-1.5 h-1.5 rounded-full ${!log ? "bg-slate-300" : log.status === "success" ? "bg-purple-500" : "bg-amber-500 animate-pulse"}`} />
              </div>
            );
          })()}

          {/* Notion */}
          {(() => {
            const log = integrations.find(l => l.service === "notion");
            return (
              <div 
                onClick={() => log && setActiveLogOverlay(log)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  !log 
                    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed" 
                    : log.status === "success" 
                    ? "bg-slate-100 border-slate-350 text-slate-800 hover:bg-slate-200/60 hover:shadow-xs" 
                    : "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100/40"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Notion</span>
                <span className={`w-1.5 h-1.5 rounded-full ${!log ? "bg-slate-300" : log.status === "success" ? "bg-slate-600" : "bg-amber-500 animate-pulse"}`} />
              </div>
            );
          })()}

          {/* Reminders */}
          {(() => {
            const log = integrations.find(l => l.service === "reminder");
            return (
              <div 
                onClick={() => log && setActiveLogOverlay(log)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  !log 
                    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed" 
                    : log.status === "success" 
                    ? "bg-amber-50 border-amber-200/70 text-amber-750 hover:bg-amber-100/40 hover:shadow-xs" 
                    : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Reminders</span>
                <span className={`w-1.5 h-1.5 rounded-full ${!log ? "bg-slate-300" : log.status === "success" ? "bg-amber-500" : "bg-amber-500 animate-pulse"}`} />
              </div>
            );
          })()}
        </div>
      </footer>

      {/* Integration log details modal overlay */}
      {activeLogOverlay && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-250 max-w-2xl w-full rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh] animate-fade-in">
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-black uppercase tracking-wider text-indigo-700 flex items-center gap-2">
                {activeLogOverlay.service === "gmail" && <Mail className="w-4 h-4 text-rose-500" />}
                {activeLogOverlay.service === "slack" && <Slack className="w-4 h-4 text-purple-600" />}
                {activeLogOverlay.service === "notion" && <Database className="w-4 h-4 text-slate-700" />}
                {activeLogOverlay.service === "reminder" && <Bell className="w-4 h-4 text-amber-550" />}
                <span>{activeLogOverlay.service} Integration Logs</span>
              </h3>
              <button 
                onClick={() => setActiveLogOverlay(null)}
                className="p-1.5 text-slate-450 hover:text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer shadow-3xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-950 font-mono text-[11px] text-indigo-300 whitespace-pre-wrap leading-relaxed border-t border-slate-100">
              {activeLogOverlay.details}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
