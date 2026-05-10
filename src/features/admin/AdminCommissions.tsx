import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Check, X, ShieldCheck, DollarSign, Users, Eye, Clock, Calendar } from 'lucide-react';

const EMPTY_FORM = {
  client_id: '', user_id: '', amount: '', type: 'setup',
  commission_role: 'full_cycle_closer', is_recurring: false, status: 'processing',
};

export default function AdminCommissions() {
  const [commissions, setCommissions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [selectedTeammateMRR, setSelectedTeammateMRR] = useState<any | null>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const [{ data: comms }, { data: cls }, { data: tms }] = await Promise.all([
        supabase.from('commissions').select('*, clients(company_name, mrr)').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, company_name, plan_type, setup_fee, mrr, stage'),
        supabase.from('users').select('id, first_name, last_name, role').neq('role', 'viewer'),
      ]);
      // attach user names
      const usersMap: any = {};
      (tms || []).forEach((u: any) => { usersMap[u.id] = u; });
      setCommissions((comms || []).map((c: any) => ({ ...c, _user: usersMap[c.user_id] })));
      setClients(cls || []);
      setTeammates(tms || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  // Active recurring MRR payouts list
  const activeRecurring = commissions.filter(c => c.is_recurring && c.status === 'paid');
  
  // Calculate total client MRR inflow & total teammate payout outflow
  let totalInflow = 0;
  let totalOutflow = 0;
  const seenClients = new Set();
  
  activeRecurring.forEach(c => {
    totalOutflow += Number(c.amount) || 0;
    if (c.clients && !seenClients.has(c.client_id)) {
      seenClients.add(c.client_id);
      totalInflow += Number(c.clients.mrr) || 0;
    }
  });

  // Group active recurring commissions by teammate
  const teammatesMRR: any = {};
  activeRecurring.forEach(c => {
    const key = c.user_id;
    if (!teammatesMRR[key]) {
      teammatesMRR[key] = {
        userId: key,
        name: c._user ? `${c._user.first_name} ${c._user.last_name}` : 'Unknown Teammate',
        role: c._user?.role || '',
        totalMRRPayout: 0,
        deals: []
      };
    }
    teammatesMRR[key].totalMRRPayout += Number(c.amount) || 0;
    teammatesMRR[key].deals.push(c);
  });

  // ─── Setup Fee Track Calculations ──────────────────────────────────────────
  // Sum of setup_fee for all closed clients
  const totalSetupInflow = clients.filter(c => c.stage === 'Closed').reduce((sum, c) => sum + (Number(c.setup_fee) || 0), 0);
  
  // All approved/paid setup or bonus commissions
  const setupCommissions = commissions.filter(c => (c.type === 'setup' || c.type === 'setter_bonus') && (c.status === 'paid' || c.status === 'pending'));
  const totalSetupOutflow = setupCommissions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  
  // Group setup commissions by teammate
  const teammateSetupSummary: Record<string, { userId: string; name: string; role: string; totalSetupPayout: number }> = {};
  setupCommissions.forEach(c => {
    const key = c.user_id;
    const name = c._user ? `${c._user.first_name} ${c._user.last_name}` : 'Unknown Teammate';
    const role = c._user?.role || '';
    if (!teammateSetupSummary[key]) {
      teammateSetupSummary[key] = { userId: key, name, role, totalSetupPayout: 0 };
    }
    teammateSetupSummary[key].totalSetupPayout += Number(c.amount) || 0;
  });

  // Per-person approved payout summary (Unpaid)
  const personSummary: any = {};
  commissions.filter(c => c.status === 'pending').forEach(c => {
    const u = c._user;
    if (!u) return;
    const key = c.user_id;
    if (!personSummary[key]) personSummary[key] = { name: `${u.first_name} ${u.last_name}`, oneTime: 0, monthly: 0 };
    if (c.is_recurring) personSummary[key].monthly += Number(c.amount);
    else personSummary[key].oneTime += Number(c.amount);
  });

  const approve = async (id: string) => {
    const { error } = await supabase.from('commissions').update({ status: 'pending' }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Approved!'); fetch();
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase.from('commissions').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Marked as paid!'); fetch();
  };

  const del = async (id: string) => {
    if (!confirm('Delete this commission?')) return;
    await supabase.from('commissions').delete().eq('id', id);
    toast.success('Deleted.'); fetch();
  };

  const saveEdit = async () => {
    if (!editId) return;
    const { error } = await supabase.from('commissions').update({
      amount: Number(editForm.amount), type: editForm.type, status: editForm.status,
      is_recurring: editForm.is_recurring, user_id: editForm.user_id,
      commission_role: editForm.commission_role,
    }).eq('id', editId);
    if (error) { toast.error(error.message); return; }
    setEditId(null); toast.success('Saved!'); fetch();
  };

  const saveAdd = async () => {
    if (!addForm.client_id || !addForm.user_id || !addForm.amount) {
      toast.error('Fill all required fields.'); return;
    }
    const { error } = await supabase.from('commissions').insert({
      client_id: addForm.client_id, user_id: addForm.user_id,
      amount: Number(addForm.amount), type: addForm.type,
      commission_role: addForm.commission_role, is_recurring: addForm.is_recurring,
      status: addForm.status, split_percentage: 100,
    });
    if (error) { toast.error(error.message); return; }
    setShowAdd(false); setAddForm(EMPTY_FORM);
    toast.success('Commission added!'); fetch();
  };

  const statusBadge = (s: string) => {
    const m: any = { processing: 'bg-orange-500/10 text-orange-500', pending: 'bg-blue-500/10 text-blue-500', paid: 'bg-emerald-500/10 text-emerald-500' };
    const l: any = { processing: 'Awaiting Approval', pending: 'Approved – Unpaid', paid: 'Paid' };
    return <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${m[s] || ''}`}>{l[s] || s}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team Payouts</h1>
          <p className="text-muted-foreground mt-1">Approve, edit, pay, and track all commissions.</p>
        </div>
        <Button onClick={() => setShowAdd(v => !v)} className="gap-2"><Plus className="w-4 h-4" /> Add Commission</Button>
      </div>

      {/* Per-person payout summary */}
      {Object.keys(personSummary).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4" /> What You Owe (Approved — Unpaid)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(personSummary).map((p: any, i) => (
              <Card key={i} className="p-4 border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600 font-bold text-sm">{p.name[0]}</div>
                  <div><p className="font-semibold text-sm">{p.name}</p><p className="text-xs text-muted-foreground">Pending payout</p></div>
                </div>
                <div className="space-y-1 text-sm">
                  {p.oneTime > 0 && <div className="flex justify-between"><span className="text-muted-foreground">One-time</span><span className="font-bold">${p.oneTime.toFixed(2)}</span></div>}
                  {p.monthly > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Monthly recurring</span><span className="font-bold text-blue-500">${p.monthly.toFixed(2)}/mo</span></div>}
                  <div className="flex justify-between border-t border-border pt-1 mt-1">
                    <span className="font-medium">Total due</span>
                    <span className="font-bold text-emerald-500">${(p.oneTime + p.monthly).toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Add Commission Panel */}
      {showAdd && (
        <Card className="p-5 border border-accent/20 bg-accent/5 animate-in fade-in">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Manual Commission Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Client *</label>
              <select className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                value={addForm.client_id} onChange={e => setAddForm({ ...addForm, client_id: e.target.value })}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Teammate *</label>
              <select className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                value={addForm.user_id} onChange={e => setAddForm({ ...addForm, user_id: e.target.value })}>
                <option value="">Select teammate...</option>
                {teammates.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Amount ($) *</label>
              <Input type="number" min={0} step="0.01" placeholder="240.00" value={addForm.amount} onChange={e => setAddForm({ ...addForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })}>
                <option value="setup">Setup / One-Time</option>
                <option value="mrr">Monthly MRR</option>
                <option value="setter_bonus">Setter Bonus</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                value={addForm.commission_role} onChange={e => setAddForm({ ...addForm, commission_role: e.target.value })}>
                <option value="full_cycle_closer">Full Cycle Closer</option>
                <option value="setter">Setter</option>
                <option value="closer">Closer</option>
                <option value="standalone_closer">Standalone Closer</option>
                <option value="split_a">Split A</option>
                <option value="split_b">Split B</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                value={addForm.status} onChange={e => setAddForm({ ...addForm, status: e.target.value })}>
                <option value="processing">Pending Approval</option>
                <option value="pending">Approved – Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="is_rec" checked={addForm.is_recurring} onChange={e => setAddForm({ ...addForm, is_recurring: e.target.checked })} className="rounded" />
              <label htmlFor="is_rec" className="text-sm">Recurring monthly</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={saveAdd} className="gap-2"><Check className="w-4 h-4" /> Save</Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </Card>
      )}


      {/* Comparative Financial Ledger Track (Setup vs MRR) */}
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-accent" /> Agency Revenue & Team Payouts Ledger
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* ── TRACK 1: UPFRONT SETUP LEDGER ────────────────────────── */}
          <Card className="border border-border bg-card/50 backdrop-blur-xl overflow-hidden flex flex-col hover:border-accent/20 transition-all shadow-lg hover:shadow-accent/5 duration-300">
            <div className="p-5 border-b border-border/60 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold text-base shadow-sm">
                  ⚡
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Upfront Setup Track</h3>
                  <p className="text-[10px] text-muted-foreground">One-time deal setup revenues & commissions</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500">
                One-Time
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-5">
              {/* Teammate payout list */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Teammate Setup Share</p>
                {Object.keys(teammateSetupSummary).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-5 text-center bg-muted/10 rounded-xl border border-border/40 border-dashed">No setup commissions paid yet.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.values(teammateSetupSummary).map((tm: any) => (
                      <div key={tm.userId} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/5 border border-border/40 hover:bg-muted/15 transition-all">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-orange-500/10 text-orange-500 font-bold text-[10px] flex items-center justify-center border border-orange-500/20">
                            {tm.name[0]}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground">{tm.name}</span>
                            <span className="text-[9px] text-muted-foreground ml-2 capitalize">({tm.role.replace(/_/g, ' ')})</span>
                          </div>
                        </div>
                        <span className="font-bold text-foreground">${tm.totalSetupPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-xs border-t border-border/40 pt-3 font-semibold mt-1">
                      <span className="text-muted-foreground">Total Setup Team Payouts (z)</span>
                      <span className="font-extrabold text-orange-500 text-sm">${totalSetupOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Agency setup financials */}
              <div className="border-t border-border/40 pt-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Total Setup Revenue (a)</span>
                  <span className="font-bold text-foreground text-sm">${totalSetupInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-orange-500/5 border border-orange-500/15">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Net Setup Profit (b)</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Retained profit after setup commissions</p>
                  </div>
                  <span className="font-extrabold text-orange-500 text-base">
                    ${(totalSetupInflow - totalSetupOutflow).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* ── TRACK 2: RECURRING MRR LEDGER ────────────────────────── */}
          <Card className="border border-border bg-card/50 backdrop-blur-xl overflow-hidden flex flex-col hover:border-accent/20 transition-all shadow-lg hover:shadow-accent/5 duration-300">
            <div className="p-5 border-b border-border/60 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-base shadow-sm">
                  🔄
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Recurring MRR Track</h3>
                  <p className="text-[10px] text-muted-foreground">Active client MRR revenues & teammate payouts</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                Monthly
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-5">
              {/* Teammate payout list */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Teammate MRR Share</p>
                {Object.keys(teammatesMRR).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-5 text-center bg-muted/10 rounded-xl border border-border/40 border-dashed">No active MRR payouts.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.values(teammatesMRR).map((tm: any) => (
                      <div key={tm.userId} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/5 border border-border/40 hover:bg-muted/15 transition-all">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[10px] flex items-center justify-center border border-emerald-500/20">
                            {tm.name[0]}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground">{tm.name}</span>
                            <span className="text-[9px] text-muted-foreground ml-2 capitalize">({tm.role.replace(/_/g, ' ')})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">${tm.totalMRRPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo</span>
                          <Button 
                            onClick={() => setSelectedTeammateMRR(tm)}
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                            title="View Payout Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-xs border-t border-border/40 pt-3 font-semibold mt-1">
                      <span className="text-muted-foreground">Total MRR Team Payouts (z)</span>
                      <span className="font-extrabold text-emerald-500 text-sm">${totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Agency MRR financials */}
              <div className="border-t border-border/40 pt-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Total Client MRR Revenue (a)</span>
                  <span className="font-bold text-foreground text-sm">${totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Net Recurring Profit (b)</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Retained monthly passive profit margin</p>
                  </div>
                  <span className="font-extrabold text-emerald-500 text-base">
                    ${(totalInflow - totalOutflow).toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo
                  </span>
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>

      {/* Drill-down Detail Modal */}
      {selectedTeammateMRR && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setSelectedTeammateMRR(null)}
              className="absolute top-4 right-4 p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold text-lg border border-accent/20">
                {selectedTeammateMRR.name[0]}
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">{selectedTeammateMRR.name}</h3>
                <p className="text-xs text-muted-foreground capitalize">{selectedTeammateMRR.role.replace(/_/g, ' ')} · Active MRR Payouts</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              {selectedTeammateMRR.deals.map((tx: any) => {
                const payDate = tx.paid_at ? new Date(tx.paid_at) : null;
                const closeDate = tx.created_at ? new Date(tx.created_at) : null;
                
                return (
                  <div key={tx.id} className="border border-border/50 rounded-xl p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{tx.clients?.company_name || 'Deleted Client'}</p>
                        <p className="text-xs text-accent capitalize font-medium mt-0.5">
                          💼 {tx.commission_role?.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                        +${Number(tx.amount).toFixed(2)}/mo
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Closed On: <strong className="text-foreground font-medium">{closeDate ? closeDate.toLocaleDateString() : 'N/A'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Plan Type: <strong className="text-foreground font-medium capitalize">{tx.clients?.plan_type || 'Custom'}</strong></span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Payout Billing Date: <strong className="text-foreground font-medium">{payDate ? payDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Total monthly commitments: <strong className="text-foreground font-bold">${selectedTeammateMRR.totalMRRPayout.toFixed(2)}/mo</strong>
              </span>
              <Button onClick={() => setSelectedTeammateMRR(null)} size="sm">
                Close Details
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions */}
      <Card className="border border-border">
        <CardHeader><CardTitle>All Commission Records</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
            : commissions.length === 0 ? <p className="text-center text-muted-foreground py-8 text-sm">No commissions yet. Add clients to generate commission records.</p>
            : (
              <div className="space-y-2">
                {commissions.map(tx => (
                  <div key={tx.id} className={`rounded-xl border p-4 ${tx.status === 'processing' ? 'border-orange-500/20 bg-orange-500/5' : tx.status === 'pending' ? 'border-blue-500/20 bg-blue-500/5' : 'border-border/50'}`}>
                    {editId === tx.id ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div><label className="text-xs text-muted-foreground">Amount</label><Input type="number" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} /></div>
                        <div><label className="text-xs text-muted-foreground">Type</label>
                          <select className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm" value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}>
                            <option value="setup">Setup</option><option value="mrr">MRR</option><option value="setter_bonus">Setter Bonus</option>
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">Teammate</label>
                          <select className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm" value={editForm.user_id} onChange={e => setEditForm({ ...editForm, user_id: e.target.value })}>
                            {teammates.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                          </select></div>
                        <div><label className="text-xs text-muted-foreground">Status</label>
                          <select className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                            <option value="processing">Pending Approval</option><option value="pending">Approved</option><option value="paid">Paid</option>
                          </select></div>
                        <div className="col-span-2 sm:col-span-4 flex gap-2">
                          <Button size="sm" onClick={saveEdit} className="gap-1"><Check className="w-3 h-3" /> Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{tx.clients?.company_name || 'Unknown'} — {tx._user ? `${tx._user.first_name} ${tx._user.last_name}` : tx.user_id}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tx.type === 'setup' ? 'Setup / One-Time' : tx.type === 'mrr' ? 'Monthly MRR' : 'Setter Bonus'}
                            {tx.is_recurring && ' · recurring'} · {tx.commission_role?.replace(/_/g, ' ')} · {new Date(tx.created_at).toLocaleDateString()}
                          </p>
                          <div className="mt-1">{statusBadge(tx.status)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold">${Number(tx.amount).toFixed(2)}</span>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditId(tx.id); setEditForm({ amount: tx.amount, type: tx.type, status: tx.status, user_id: tx.user_id, is_recurring: tx.is_recurring, commission_role: tx.commission_role }); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                            {tx.status === 'processing' && <Button size="sm" onClick={() => approve(tx.id)} className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border-0"><ShieldCheck className="w-3 h-3" /> Approve</Button>}
                            {tx.status === 'pending' && <Button size="sm" onClick={() => markPaid(tx.id)} className="h-7 text-xs gap-1 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white border-0"><DollarSign className="w-3 h-3" /> Pay</Button>}
                            <button onClick={() => del(tx.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
