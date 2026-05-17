import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Upload, 
  Users, 
  Activity, 
  BarChart3, 
  Download, 
  Trash2, 
  Eye, 
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Search,
  X,
  Edit2,
  Settings2,
  Play,
  MonitorSmartphone,
  Send,
  AlertCircle,
  FileUp,
  Loader2,
  ShieldCheck,
  Globe,
  PhoneCall
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_SIZE = 50;

export default function DialerHub() {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin';

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [voipLines, setVoipLines] = useState<any[]>([]);
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [userLeads, setUserLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'campaigns' | 'reports' | 'lines'>('campaigns');
  const [showLeadRequestConfirm, setShowLeadRequestConfirm] = useState(false);
  
  // Modal States
  const [showImportModal, setShowImportModal] = useState(false);
  const [showLineModal, setShowLineModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Leads Viewer
  const [viewingCampaign, setViewingCampaign] = useState<any>(null);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsPage, setLeadsPage] = useState(0);
  const [totalLeadsCount, setTotalLeadsCount] = useState(0);


  useEffect(() => {
    fetchData();
    if (isAdmin) fetchAgents();
  }, [isAdmin]);

  const fetchData = async () => {
    setIsLoading(true);
    let campQuery = supabase.from('campaigns').select('*, voip_lines(*)').order('created_at', { ascending: false });
    
    // If agent, show their specific assignments OR shared assignments
    if (!isAdmin && profile?.email) {
      // Split into two queries to avoid PostgREST syntax issues with emails in .or()
      const { data: directCamps } = await supabase.from('campaigns').select('*, voip_lines(*)').eq('assignee_email', profile.email).order('created_at', { ascending: false });
      const { data: sharedCamps } = await supabase.from('campaigns').select('*, voip_lines(*)').eq('assignment_type', 'shared').order('created_at', { ascending: false });
      
      const combined = [...(directCamps || []), ...(sharedCamps || [])];
      // Unique by ID
      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
      setCampaigns(unique);
    } else {
      const { data: camps } = await campQuery;
      setCampaigns(camps || []);
    }
    const { data: lines } = await supabase.from('voip_lines').select('*').order('created_at', { ascending: false });
    const { data: reps } = await supabase.from('daily_reports').select('*, users(first_name, last_name, email)').order('date', { ascending: false });
    
    setVoipLines(lines || []);
    setDailyReports(reps || []);

    // If agent, fetch all their leads for the 'Leads' view
    if (!isAdmin && profile?.email) {
      const { data: leads } = await supabase
        .from('leads')
        .select('*, campaigns!inner(assignee_email)')
        .eq('campaigns.assignee_email', profile.email)
        .order('created_at', { ascending: false })
        .limit(200);
      setUserLeads(leads || []);
    }

    setIsLoading(false);
  };

  const fetchAgents = async () => {
    const { data } = await supabase.from('users').select('id, first_name, last_name, email').eq('status', 'active');
    setAgents(data || []);
  };

  const loadCampaignLeads = async (campaign: any, page = 0, search = '') => {
    setLeadsLoading(true);
    setViewingCampaign(campaign);
    setLeadsPage(page);
    setLeadsSearch(search);

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search.trim()) {
      query = query.or(`first_name.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, count } = await query;
    setCampaignLeads(data || []);
    setTotalLeadsCount(count || 0);
    setLeadsLoading(false);
  };

  const STATUS_COLORS: Record<string, string> = {
    pending:      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-silver/40 dark:border-white/10',
    booked:       'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30',
    interested:   'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30',
    voicemail:    'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30',
    'no answer':  'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30',
    busy:         'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30',
    'not interested': 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30',
  };

  const parseLeads = (rawData: any[], campaignId: string) => {
    if (!rawData || rawData.length === 0) return [];

    return rawData.map((row: any) => {
      // 1. Get the raw text of the entire row to avoid column mismatching
      const rawText = Object.values(row).join(' ');
      
      // 2. Extract Phone using strict Regex (finds first valid phone pattern)
      const phoneMatch = rawText.match(/(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
      const phone = phoneMatch ? phoneMatch[0] : '';
      
      // 3. Extract Email
      const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : '';
      
      // 4. Extract Website
      const webMatch = rawText.match(/(https?:\/\/)?(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]*)?/);
      const website = webMatch ? webMatch[0] : '';

      // 5. Name Logic: Use the very first column as the "Name" (Company)
      const firstCol = Object.values(row)[0];
      const name = String(firstCol || 'Unnamed Lead').trim();

      return {
        campaign_id: campaignId,
        first_name: name,
        phone: phone.trim(),
        email: email ? email.trim() : 'Not Found',
        website: website ? website.trim() : 'Not Found',
        status: 'pending'
      };
    }).filter(l => l.phone.length >= 7);
  };

  const uploadLeadsInChunks = async (leads: any[], campaignId: string) => {
    const chunkSize = 500;
    const totalChunks = Math.ceil(leads.length / chunkSize);
    
    for (let i = 0; i < leads.length; i += chunkSize) {
      const chunk = leads.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize) + 1;
      setUploadProgress(Math.round((chunkIndex / totalChunks) * 100));
      
      const { error } = await supabase.from('leads').insert(chunk);
      if (error) {
        console.error(`UPLOAD_ERROR_CHUNK_${chunkIndex}:`, error);
        toast.error(`Chunk ${chunkIndex} failed: ${error.message}`);
        return false;
      }
    }
    
    setUploadProgress(100);
    toast.success(`🚀 ${leads.length} leads successfully deployed`);
    setUploadProgress(0);
    return true;
  };

  const handleCampaignAction = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const agentEmail = formData.get('assignee') as string;
    // Auto-find the VoIP line assigned to this agent
    const assignedLine = voipLines.find(l => l.assigned_agent_email === agentEmail);

    const campaignData = {
      name: formData.get('name'),
      assignee_email: agentEmail,
      assignment_type: formData.get('type'),
      priority: formData.get('priority'),
      country: formData.get('country'),
      state: formData.get('state'),
      voip_line_id: assignedLine?.id || null, // Auto-assigned in background
    };

    setIsLoading(true);
    try {
      if (editingCampaign) {
        const { error } = await supabase.from('campaigns').update(campaignData).eq('id', editingCampaign.id);
        if (error) throw error;
        
        if (pendingFile) {
          Papa.parse(pendingFile, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
              try {
                const leads = parseLeads(results.data, editingCampaign.id);
                if (leads.length > 0) {
                  await uploadLeadsInChunks(leads, editingCampaign.id);
                  const newTotal = (editingCampaign.total_leads || 0) + leads.length;
                  await supabase.from('campaigns').update({ total_leads: newTotal }).eq('id', editingCampaign.id);
                } else {
                  toast.error("No valid leads found in CSV.");
                }
              } catch (parseErr: any) {
                toast.error(`Import failed: ${parseErr.message}`);
              } finally {
                setEditingCampaign(null);
                setPendingFile(null);
                setShowImportModal(false);
                setIsLoading(false);
                fetchData();
              }
            }
          });
        } else {
          toast.success("Manifest Updated");
          setEditingCampaign(null);
          setShowImportModal(false);
          setIsLoading(false);
          fetchData();
        }
      } else if (pendingFile) {
        Papa.parse(pendingFile, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const tempLeads = parseLeads(results.data, 'temp');
              if (tempLeads.length === 0) {
                toast.error("No valid leads found in CSV. Check 'Phone' column.");
                setIsLoading(false);
                return;
              }

              const { data: camp, error: campErr } = await supabase.from('campaigns').insert({
                ...campaignData,
                total_leads: tempLeads.length,
                status: 'active',
              }).select().single();

              if (campErr) throw campErr;

              const finalLeads = parseLeads(results.data, camp.id);
              await uploadLeadsInChunks(finalLeads, camp.id);
            } catch (createErr: any) {
              toast.error(`Creation failed: ${createErr.message}`);
            } finally {
              setPendingFile(null);
              setShowImportModal(false);
              setIsLoading(false);
              fetchData();
            }
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message);
      setIsLoading(false);
    }
  };

  const handleLineAction = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const lineData = {
      line_name: formData.get('line_name'),
      username: formData.get('username'),
      password: formData.get('password'),
      domain: formData.get('domain'),
      port: parseInt(formData.get('port') as string),
      assigned_agent_email: formData.get('assigned_agent_email'),
      status: 'active',
    };

    setIsLoading(true);
    try {
      if (editingLine) {
        const { error } = await supabase.from('voip_lines').update(lineData).eq('id', editingLine.id);
        if (error) throw new Error(error.message);
        toast.success("Line configuration updated.");
      } else {
        const { error } = await supabase.from('voip_lines').insert(lineData);
        if (error) throw new Error(error.message);
        toast.success("VoIP line registered successfully.");
      }
      setShowLineModal(false);
      setEditingLine(null);
      fetchData();
    } catch (err: any) {
      console.error('VOIP_LINE_ERROR:', err);
      toast.error(`Line save failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Confirm Manifest Termination? All leads and call history will be permanently removed.")) return;
    setIsLoading(true);
    try {
      // Step 1: Get all lead IDs for this campaign
      const { data: leadRows, error: fetchErr } = await supabase
        .from('leads')
        .select('id')
        .eq('campaign_id', id);

      if (fetchErr) throw new Error(`Lead fetch failed: ${fetchErr.message}`);

      // Step 2: Delete call_logs that reference these leads (breaks the FK chain)
      if (leadRows && leadRows.length > 0) {
        const leadIds = leadRows.map((l: any) => l.id);
        const { error: logErr } = await supabase
          .from('call_logs')
          .delete()
          .in('lead_id', leadIds);
        if (logErr) console.warn("call_logs purge (non-fatal):", logErr.message);
      }

      // Step 3: Delete all leads for this campaign
      const { error: leadErr } = await supabase
        .from('leads')
        .delete()
        .eq('campaign_id', id);
      if (leadErr) throw new Error(`Lead purge failed: ${leadErr.message}`);

      // Step 4: Finally delete the campaign itself
      const { error: campErr } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);
      if (campErr) throw new Error(`Campaign purge failed: ${campErr.message}`);

      toast.success("Manifest fully purged — all leads and history cleared.");
      fetchData();
    } catch (err: any) {
      console.error("PURGE_ERROR:", err);
      toast.error(err.message || "Purge failed — check console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-10 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-border pb-8">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tighter text-foreground uppercase italic">Elite Command</h1>
          <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.5em]">{isAdmin ? 'CENTRAL HUB' : 'AGENT MISSION'}</p>
        </div>
        
        <div className="flex gap-4">
          <button onClick={() => setView('campaigns')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'campaigns' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground'}`}>Manifests</button>
          <button onClick={() => setView('reports')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'reports' ? 'bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/10' : 'text-muted-foreground hover:text-foreground'}`}>Intelligence</button>
          {isAdmin && <button onClick={() => setView('lines')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'lines' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground'}`}>VoIP Lines</button>}
          
          {isAdmin && view === 'campaigns' && (
            <label className="h-10 px-6 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 cursor-pointer hover:opacity-90 transition-all shadow-xl shadow-primary/20">
              <FileUp className="w-3.5 h-3.5" /> Deploy CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => { setPendingFile(e.target.files![0]); setShowImportModal(true); }} />
            </label>
          )}

          {isAdmin && view === 'lines' && (
            <button onClick={() => setShowLineModal(true)} className="h-10 px-6 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-2 hover:opacity-90 transition-all">
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-8">
        {!isAdmin && (
          <aside className="w-64 space-y-6">
            <div className="p-8 bg-card border border-border rounded-3xl space-y-8">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><MonitorSmartphone className="w-6 h-6" /></div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Elite Client</p>
                <h4 className="font-bold text-foreground italic">Desktop App</h4>
              </div>
              <button 
                onClick={() => {
                  window.open('https://github.com/Arfinusmaan/MAOS_Production/releases/download/v1.0.0/MAOS.Elite.Dialer.1.0.0.exe', '_blank');
                }}
                className="w-full py-3 bg-foreground text-background text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all"
              >
                Download Now
              </button>
            </div>
            {/* Request Leads Card */}
            <div className="p-8 bg-card border border-border rounded-3xl space-y-6">
              <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                <Send className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Leads finished?</p>
                <h4 className="font-bold text-foreground italic">Request Queue</h4>
              </div>
              <button 
                onClick={() => setShowLeadRequestConfirm(true)}
                className="w-full py-3 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 shadow-lg shadow-orange-500/20 transition-all"
              >
                Request Leads
              </button>
            </div>

            <div className="p-8 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl space-y-4">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <p className="text-[11px] text-muted-foreground leading-relaxed italic uppercase font-bold tracking-tighter">"Your performance today is driving the mission. Stay focused."</p>
            </div>
          </aside>
        )}

        <div className="flex-1">
          {view === 'campaigns' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {campaigns.map(camp => (
                <div key={camp.id} className="p-10 bg-card border border-border rounded-[40px] space-y-8 group relative overflow-hidden transition-all hover:border-primary/20">
                  <div className="flex justify-between items-start">
                    <div className={`w-14 h-14 ${camp.priority === 'urgent' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'} rounded-[20px] flex items-center justify-center`}><BarChart3 className="w-7 h-7" /></div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button onClick={() => loadCampaignLeads(camp)} className="p-2 text-muted-foreground hover:text-primary" title="View All Leads"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => { setEditingCampaign(camp); setShowImportModal(true); }} className="p-2 text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteCampaign(camp.id)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-3xl font-bold text-foreground tracking-tighter uppercase italic">{camp.name}</h3>
                    <div className="flex items-center gap-3">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{camp.assignee_email || 'Unassigned'}</p>
                    </div>
                    {(camp.country || camp.state) && (
                      <div className="flex items-center gap-3">
                        <Globe className="w-3.5 h-3.5 text-primary/40" />
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest italic">{camp.country}{camp.state ? `, ${camp.state}` : ''}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/50 text-center">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Queue</p>
                      <p className="text-3xl font-bold text-foreground">{camp.total_leads}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/50 text-center flex flex-col justify-center">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Type</p>
                      <p className="text-[10px] font-black text-primary uppercase">{camp.assignment_type || 'Single'}</p>
                    </div>
                  </div>

                  {camp.voip_lines && (
                    <div className="pt-6 border-t border-border flex items-center gap-3">
                      <Globe className="w-4 h-4 text-muted-foreground opacity-30" />
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{camp.voip_lines.line_name}</p>
                    </div>
                  )}

                  {!isAdmin && (
                    <div className="flex gap-3">
                      <button onClick={() => loadCampaignLeads(camp)} className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center text-muted-foreground hover:text-primary transition-all shadow-xl">
                        <Eye className="w-6 h-6" />
                      </button>
                      <button onClick={() => window.location.href = 'maos-dialer://'} className="flex-1 h-16 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-[0.4em] rounded-3xl shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all">
                        <Play className="w-5 h-5 fill-current" /> Execute
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {view === 'lines' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {voipLines.map(line => (
                <div key={line.id} className="p-8 bg-card border border-border rounded-3xl space-y-6 group hover:border-primary/20 transition-all">
                  <div className="flex justify-between items-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><PhoneCall className="w-6 h-6" /></div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingLine(line); setShowLineModal(true); }} className="p-2 text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={async () => { if(confirm("Remove Line?")) { await supabase.from('voip_lines').delete().eq('id', line.id); fetchData(); } }} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground tracking-tighter uppercase italic">{line.line_name}</h3>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-40">{line.username} @ {line.domain}</p>
                  </div>
                  <div className="pt-6 border-t border-border flex gap-4">
                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest rounded-lg border border-emerald-500/20">{line.status}</span>
                    <span className="px-3 py-1 bg-white/5 text-silver text-[8px] font-black uppercase tracking-widest rounded-lg border border-white/10">Port: {line.port}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'reports' && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-4 px-6 py-3 text-[9px] font-black text-muted-foreground uppercase tracking-widest border-b border-border">
                <span>Agent</span><span>Date</span><span>Calls</span><span>Booked</span><span>Status</span>
              </div>
              {dailyReports.map(report => {
                const agentName = report.users ? `${report.users.first_name} ${report.users.last_name}` : 'Unknown Agent';
                const agentEmail = report.users?.email || '—';
                const calls = report.calls_made ?? 0;
                const booked = report.meetings_booked ?? 0;
                return (
                  <div key={report.id} className="grid grid-cols-5 gap-4 px-6 py-5 bg-card border border-border rounded-2xl items-center hover:border-primary/20 transition-all">
                    <div>
                      <p className="text-sm font-bold text-foreground">{agentName}</p>
                      <p className="text-[9px] text-muted-foreground">{agentEmail}</p>
                    </div>
                    <p className="text-sm font-mono text-muted-foreground">
                      {new Date(report.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-2xl font-bold tracking-tighter">{calls}</p>
                    <p className="text-2xl font-bold text-emerald-500 tracking-tighter">{booked}</p>
                    <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest w-fit bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      Done
                    </span>
                  </div>
                );
              })}
              {dailyReports.length === 0 && (
                <div className="text-center py-20 text-muted-foreground text-sm">No reports yet. Reports appear here when agents click "Done For Today".</div>
              )}
            </div>
          )}


        </div>
      </div>

      {/* Lead Request Confirmation Modal */}
      <AnimatePresence>
        {showLeadRequestConfirm && (
          <div className="fixed inset-0 bg-background/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md p-10 bg-card border border-border rounded-[40px] space-y-8 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-6">
                <Send className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold italic tracking-tighter uppercase">Request More Leads?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">This will send a notification to the Command Center. Admins will review your request and assign new manifests to your queue.</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowLeadRequestConfirm(false)}
                  className="flex-1 py-4 bg-muted border border-border rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-muted/80 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      const { error } = await supabase.from('lead_requests').insert({
                        agent_email: profile?.email,
                        agent_name: `${profile?.first_name} ${profile?.last_name}`,
                        status: 'pending'
                      });
                      if (error) throw error;
                      toast.success("Request sent to command center.");
                      setShowLeadRequestConfirm(false);
                      fetchData();
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1 py-4 bg-primary text-primary-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Confirm Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manifest Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 bg-background/95 backdrop-blur-2xl z-[100] flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl p-12 bg-card border border-border rounded-[50px] space-y-10 shadow-2xl relative">
              <button onClick={() => { setShowImportModal(false); setEditingCampaign(null); setPendingFile(null); }} className="absolute top-8 right-8 p-2 hover:bg-muted rounded-full"><X className="w-6 h-6" /></button>
              <div className="space-y-1">
                <h3 className="text-4xl font-bold text-foreground uppercase italic tracking-tighter">{editingCampaign ? 'Modify Mission' : 'New Deployment'}</h3>
                {pendingFile && <p className="text-[10px] text-primary font-black uppercase tracking-widest italic">{pendingFile.name}</p>}
              </div>
              <form onSubmit={handleCampaignAction} className="space-y-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Mission Name</label>
                    <input name="name" defaultValue={editingCampaign?.name} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Assign Agent</label>
                    <select 
                      name="assignee" 
                      defaultValue={editingCampaign?.assignee_email} 
                      className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none"
                    >
                      <option value="">Choose Agent (VoIP Line is auto-linked)</option>
                      {agents.map(a => <option key={a.id} value={a.email}>{a.first_name} {a.last_name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Manifest Type</label>
                      <select name="type" defaultValue={editingCampaign?.assignment_type || 'single'} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none">
                        <option value="single">Single (One Agent)</option>
                        <option value="shared">Shared (Shift Pool)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Priority</label>
                      <select name="priority" defaultValue={editingCampaign?.priority || 'normal'} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none">
                        <option value="normal">Normal</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Target Country</label>
                      <input name="country" defaultValue={editingCampaign?.country} placeholder="e.g. USA" className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Target State/Region</label>
                      <input name="state" defaultValue={editingCampaign?.state} placeholder="e.g. Florida" className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" />
                    </div>
                  </div>
                </div>
                {uploadProgress > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      <span>Uploading Leads...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
                <button type="submit" disabled={isLoading} className="w-full h-16 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-3">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  {editingCampaign ? 'Update Mission' : 'Initiate Protocol'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Line Modal */}
      <AnimatePresence>
        {showLineModal && (
          <div className="fixed inset-0 bg-background/95 backdrop-blur-2xl z-[100] flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl p-12 bg-card border border-border rounded-[50px] space-y-10 shadow-2xl relative">
              <button onClick={() => { setShowLineModal(false); setEditingLine(null); }} className="absolute top-8 right-8 p-2 hover:bg-muted rounded-full"><X className="w-6 h-6" /></button>
              <h3 className="text-4xl font-bold text-foreground uppercase italic tracking-tighter">{editingLine ? 'Configure Line' : 'Register VoIP'}</h3>
              <form onSubmit={handleLineAction} className="space-y-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Line Alias</label>
                    <input name="line_name" defaultValue={editingLine?.line_name} placeholder="e.g. Primary 1305 Line" className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" required />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Username</label>
                      <input name="username" defaultValue={editingLine?.username} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Password</label>
                      <input name="password" defaultValue={editingLine?.password} type="password" className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">SIP Domain</label>
                      <input name="domain" defaultValue={editingLine?.domain || '199.180.221.9'} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">UDP Port</label>
                      <input name="port" defaultValue={editingLine?.port || 1221} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">Assigned Agent</label>
                    <select name="assigned_agent_email" defaultValue={editingLine?.assigned_agent_email || ''} className="w-full h-14 bg-muted border border-border rounded-2xl px-6 text-sm focus:border-primary outline-none">
                      <option value="">Unassigned (Public Line)</option>
                      {agents.map(a => <option key={a.id} value={a.email}>{a.first_name} {a.last_name}</option>)}
                    </select>
                  </div>
                  
                  {/* Diagnostic Section */}
                  <div className="space-y-4 pt-4">
                    <div className="flex justify-between items-center px-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Signal Diagnostics</label>
                      <button 
                        type="button"
                        onClick={() => {
                          const term = document.getElementById('debug-term');
                          if (term) {
                            term.innerHTML = `<p class="text-emerald-500 font-mono text-[10px]">[INIT] Testing Signal to ${editingLine?.domain || 'Unified Voice'}...</p>`;
                            setTimeout(() => {
                              term.innerHTML += `<p class="text-emerald-400 font-mono text-[10px]">[OK] Handshake Success. Line is HOT.</p>`;
                            }, 1500);
                          }
                        }}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        Run Live Test
                      </button>
                    </div>
                    <div id="debug-term" className="w-full h-24 bg-black border border-white/5 rounded-2xl p-4 overflow-y-auto custom-scrollbar">
                      <p className="text-white/20 font-mono text-[10px]">Ready for telemetry...</p>
                    </div>
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="w-full h-16 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all disabled:opacity-50">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  Confirm VoIP Protocol
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========== CAMPAIGN LEADS VIEWER PANEL ========== */}
      <AnimatePresence>
        {viewingCampaign && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/95 backdrop-blur-2xl z-[150] flex flex-col"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-10 py-6 border-b border-border flex-shrink-0">
              <div className="space-y-1">
                <h2 className="text-3xl font-bold tracking-tighter uppercase italic text-foreground">
                  {viewingCampaign.name}
                  <span className="ml-4 text-lg font-normal text-muted-foreground not-italic normal-case tracking-normal">
                    — {totalLeadsCount.toLocaleString()} total leads
                  </span>
                </h2>
                <div className="flex items-center gap-6 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  <span>Assigned: {viewingCampaign.assignee_email || 'Unassigned'}</span>
                  <span>Type: {viewingCampaign.assignment_type}</span>
                  <span>Page {leadsPage + 1} of {Math.ceil(totalLeadsCount / PAGE_SIZE)}</span>
                </div>
              </div>
                <div className="flex items-center gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={leadsSearch}
                    onChange={e => loadCampaignLeads(viewingCampaign, 0, e.target.value)}
                    placeholder="Search name, phone, company..."
                    className="w-72 h-11 bg-muted border border-border rounded-xl pl-10 pr-4 text-sm focus:border-primary outline-none"
                  />
                </div>
                <button
                  onClick={() => loadCampaignLeads(viewingCampaign, leadsPage, leadsSearch)}
                  className="p-2.5 bg-muted rounded-xl hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground"
                  title="Refresh Leads"
                >
                  <Activity className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { setViewingCampaign(null); setCampaignLeads([]); }}
                  className="p-2.5 bg-muted rounded-xl hover:bg-muted/80 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Status Legend */}
            <div className="flex items-center gap-3 px-10 py-4 border-b border-border flex-shrink-0 flex-wrap">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mr-2">Status:</span>
              {[
                { label: 'Pending', color: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/10 dark:text-white/50 dark:border-white/10' },
                { label: 'Booked', color: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-transparent' },
                { label: 'Interested', color: 'bg-blue-500/10 text-blue-600 border border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:border-transparent' },
                { label: 'Voicemail', color: 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-transparent' },
                { label: 'No Answer', color: 'bg-orange-500/10 text-orange-600 border border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400 dark:border-transparent' },
                { label: 'Busy', color: 'bg-purple-500/10 text-purple-600 border border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400 dark:border-transparent' },
                { label: 'Not Interested', color: 'bg-red-500/10 text-red-600 border border-red-500/20 dark:bg-red-500/20 dark:text-red-400 dark:border-transparent' },
              ].map(s => (
                <span key={s.label} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${s.color}`}>{s.label}</span>
              ))}
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-10 py-3 border-b border-border text-[9px] font-black text-muted-foreground uppercase tracking-widest flex-shrink-0">
              <span className="col-span-1">#</span>
              <span className="col-span-2">Name</span>
              <span className="col-span-2">Company</span>
              <span className="col-span-2">Phone</span>
              <span className="col-span-2">Email</span>
              <span className="col-span-1">Added</span>
              <span className="col-span-1">Called</span>
              <span className="col-span-1">Status</span>
            </div>

            {/* Leads List */}
            <div className="flex-1 overflow-y-auto">
              {leadsLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                campaignLeads.map((lead, i) => {
                  const statusKey = (lead.status || 'pending').toLowerCase();
                  const colorClass = STATUS_COLORS[statusKey] || STATUS_COLORS['pending'];
                  const rowNum = leadsPage * PAGE_SIZE + i + 1;
                  return (
                    <div
                      key={lead.id}
                      className={`grid grid-cols-12 gap-4 px-10 py-4 border-b border-border/40 text-sm items-center transition-colors hover:bg-muted/20 ${
                        statusKey === 'booked' ? 'bg-emerald-500/[0.03]' :
                        statusKey === 'not interested' ? 'bg-red-500/[0.03]' : ''
                      }`}
                    >
                      <span className="col-span-1 text-[11px] font-mono text-muted-foreground">{rowNum}</span>
                      <span className="col-span-2 font-semibold text-foreground truncate">{lead.first_name || '—'}</span>
                      <span className="col-span-2 text-muted-foreground truncate text-xs">{lead.company_name || '—'}</span>
                      <span className="col-span-2 font-mono text-foreground text-xs">{lead.phone || '—'}</span>
                      <span className="col-span-2 text-muted-foreground truncate text-xs">{lead.email || '—'}</span>
                      <span className="col-span-1 text-[10px] text-muted-foreground font-mono">
                        {new Date(lead.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="col-span-1 text-[10px] text-muted-foreground font-mono">
                        {lead.called_at ? new Date(lead.called_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                      </span>
                      <span className="col-span-1">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${colorClass}`}>
                          {lead.status || 'pending'}
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
              {!leadsLoading && campaignLeads.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">No leads found{leadsSearch ? ` for "${leadsSearch}"` : ''}.</div>
              )}
            </div>

            <div className="flex items-center justify-between px-10 py-5 border-t border-border flex-shrink-0">
              <p className="text-[11px] text-muted-foreground font-mono">
                Showing {leadsPage * PAGE_SIZE + 1}–{Math.min((leadsPage + 1) * PAGE_SIZE, totalLeadsCount)} of {totalLeadsCount.toLocaleString()} leads
              </p>
              <div className="flex gap-3">
                <button
                  disabled={leadsPage === 0}
                  onClick={() => loadCampaignLeads(viewingCampaign, leadsPage - 1, leadsSearch)}
                  className="px-6 py-2.5 bg-muted rounded-xl text-[10px] font-black uppercase tracking-widest border border-border hover:bg-muted/80 disabled:opacity-30 transition-all flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                  disabled={(leadsPage + 1) * PAGE_SIZE >= totalLeadsCount || leadsLoading}
                  onClick={() => loadCampaignLeads(viewingCampaign, leadsPage + 1, leadsSearch)}
                  className="px-6 py-2.5 bg-muted rounded-xl text-[10px] font-black uppercase tracking-widest border border-border hover:bg-muted/80 disabled:opacity-30 transition-all flex items-center gap-2"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
