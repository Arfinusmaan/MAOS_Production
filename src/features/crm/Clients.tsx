import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/ui/EmptyState';
import { Search, Plus, Users, Loader2, X, PowerOff, Repeat, Zap, Info, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import {
  calculateCommissions,
  previewCommissions,
  getPlanDefaults,
  getPlanLabel,
  getDealTypeLabel,
  type DealType,
  type PlanType,
} from '@/lib/commissionEngine';

const STAGE_COLORS: Record<string, string> = {
  'Closed': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'Inactive': 'bg-destructive/10 text-destructive',
  'Cold Lead': 'bg-muted text-muted-foreground',
  'Interested': 'bg-accent/10 text-accent',
  'Meeting Booked': 'bg-accent/10 text-accent',
  'Follow-Up': 'bg-orange-500/10 text-orange-500',
};

const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: 'full_cycle', label: 'Full Cycle Closer (20% setup + 20% MRR)' },
  { value: 'setter_closer', label: 'Setter + Closer Pair (3%+$25 / 10%)' },
  { value: 'standalone_closer', label: 'Standalone Closer (10% setup + 10% MRR)' },
  { value: 'split', label: 'Split Deal (Custom % of 20% pool)' },
  { value: 'admin_closed', label: 'CEO/Admin Closed — 100% Agency Revenue' },
];

const emptyForm = {
  company_name: '',
  email: '',
  stage: 'Cold Lead',
  plan_type: 'minimum' as PlanType,
  setup_fee: '1200',
  mrr: '997',
  deal_type: 'full_cycle' as DealType,
  person_a_id: '',   // setter / full_cycle / split_a
  person_b_id: '',   // closer / split_b
  split_pct_a: '50',
  split_pct_b: '50',
};

export default function Clients() {
  const { user, profile } = useAuthStore();
  const [clients, setClients] = useState<any[]>([]);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [customRates, setCustomRates] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const isAdmin = profile?.role === 'admin';

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setIsLoading(true);
      let q = supabase
        .from('clients')
        .select('*, closer:users!clients_assigned_closer_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        q = q.or(`assigned_setter_id.eq.${user?.id},assigned_closer_id.eq.${user?.id}`);
      }

      const { data: clientsData, error } = await q;
      if (error) throw error;
      if (clientsData) setClients(clientsData);

      // All active non-admin teammates for dropdowns
      const { data: teamData } = await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .neq('role', 'admin')
        .eq('status', 'active');
      if (teamData) setTeammates(teamData);

      // Fetch custom commission rates
      const { data: ratesSet } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'commission_rates')
        .maybeSingle();
      if (ratesSet && ratesSet.value) {
        try {
          setCustomRates(JSON.parse(ratesSet.value));
        } catch (e) {
          console.error('Error parsing custom rates:', e);
        }
      }

    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load clients: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile) fetchData();
  }, [user, profile]);

  // ─── Plan preset ───────────────────────────────────────────────────────────
  const handlePlanChange = (plan: PlanType) => {
    const defaults = getPlanDefaults(plan);
    setForm(f => ({
      ...f,
      plan_type: plan,
      setup_fee: defaults.setup > 0 ? String(defaults.setup) : f.setup_fee,
      mrr: defaults.mrr > 0 ? String(defaults.mrr) : f.mrr,
    }));
  };

  // ─── Split total check ─────────────────────────────────────────────────────
  const splitTotal = Number(form.split_pct_a) + Number(form.split_pct_b);

  // ─── Live preview ──────────────────────────────────────────────────────────
  const previews = useMemo(() => {
    const setupFee = Number(form.setup_fee) || 0;
    const mrr = Number(form.mrr) || 0;
    if (setupFee === 0 && mrr === 0) return [];
    if (form.deal_type === 'admin_closed') return previewCommissions({ dealType: 'admin_closed', planType: form.plan_type, setupFee, mrr, customRates });

    const pa = teammates.find(t => t.id === form.person_a_id);
    const pb = teammates.find(t => t.id === form.person_b_id);
    const paName = pa ? `${pa.first_name} ${pa.last_name}` : 'Person A';
    const pbName = pb ? `${pb.first_name} ${pb.last_name}` : undefined;

    return previewCommissions({
      dealType: form.deal_type,
      planType: form.plan_type,
      setupFee,
      mrr,
      personAName: paName,
      personBName: pbName,
      splitPctA: Number(form.split_pct_a),
      splitPctB: Number(form.split_pct_b),
      customRates,
    });
  }, [form, teammates, customRates]);

  // ─── Edit client click ───
  const handleEditClick = async (client: any) => {
    try {
      // Fetch commissions for this client to determine their roles
      const { data: comms, error } = await supabase
        .from('commissions')
        .select('*')
        .eq('client_id', client.id);

      if (error) throw error;

      let deal_type: DealType = 'admin_closed';
      let person_a_id = '';
      let person_b_id = '';
      let split_pct_a = '50';
      let split_pct_b = '50';

      if (comms && comms.length > 0) {
        const fullCycle = comms.find(c => c.commission_role === 'full_cycle_closer');
        const setter = comms.find(c => c.commission_role === 'setter');
        const closer = comms.find(c => c.commission_role === 'closer');
        const standalone = comms.find(c => c.commission_role === 'standalone_closer');
        const splitA = comms.find(c => c.commission_role === 'split_a');
        const splitB = comms.find(c => c.commission_role === 'split_b');

        if (fullCycle) {
          deal_type = 'full_cycle';
          person_a_id = fullCycle.user_id;
        } else if (setter) {
          deal_type = 'setter_closer';
          person_a_id = setter.user_id;
          person_b_id = closer?.user_id || '';
        } else if (standalone) {
          deal_type = 'standalone_closer';
          person_a_id = standalone.user_id;
        } else if (splitA && splitB) {
          deal_type = 'split';
          person_a_id = splitA.user_id;
          person_b_id = splitB.user_id;
          split_pct_a = String(splitA.split_pct_a || 50);
          split_pct_b = String(splitB.split_pct_b || 50);
        }
      }

      setEditingClientId(client.id);
      setIsAdding(true);
      setForm({
        company_name: client.company_name || '',
        email: client.email || '',
        stage: client.stage || 'Cold Lead',
        plan_type: client.plan_type || 'custom',
        setup_fee: String(client.setup_fee || 0),
        mrr: String(client.mrr || 0),
        deal_type,
        person_a_id,
        person_b_id,
        split_pct_a,
        split_pct_b,
      });
    } catch (err: any) {
      toast.error('Failed to load client details for editing: ' + err.message);
    }
  };

  // ─── Submit (Handles both Add and Edit) ────────────────────────────────────
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    // Validate split
    if (form.deal_type === 'split' && splitTotal !== 100) {
      toast.error(`Split percentages must add up to 100% (currently ${splitTotal}%)`);
      return;
    }
    if (['full_cycle', 'setter_closer', 'split', 'standalone_closer'].includes(form.deal_type) && !form.person_a_id) {
      toast.error('Please assign Person A for this deal type.');
      return;
    }

    setIsSaving(true);
    try {
      const setupFee = Number(form.setup_fee) || 0;
      const mrr = Number(form.mrr) || 0;

      let client: any = null;

      if (editingClientId) {
        // 1. Update Client
        const { data, error: clientErr } = await supabase
          .from('clients')
          .update({
            company_name: form.company_name,
            email: form.email || null,
            stage: form.stage,
            plan_type: form.plan_type,
            mrr,
            setup_fee: setupFee,
            is_active: form.stage !== 'Inactive',
            assigned_closer_id: form.person_a_id || user.id,
            assigned_setter_id: form.deal_type === 'setter_closer' ? form.person_a_id : null,
          })
          .eq('id', editingClientId)
          .select()
          .single();

        if (clientErr) throw clientErr;
        client = data;
      } else {
        // 1. Insert Client
        const { data, error: clientErr } = await supabase
          .from('clients')
          .insert({
            company_name: form.company_name,
            email: form.email || null,
            stage: form.stage,
            plan_type: form.plan_type,
            mrr,
            setup_fee: setupFee,
            is_active: form.stage !== 'Inactive',
            assigned_closer_id: form.person_a_id || user.id,
            assigned_setter_id: form.deal_type === 'setter_closer' ? form.person_a_id : null,
          })
          .select()
          .single();

        if (clientErr) throw clientErr;
        client = data;
      }

      // 2. Calculate commissions
      let commissions: any[] = [];
      if (form.deal_type !== 'admin_closed') {
        commissions = calculateCommissions({
          clientId: client.id,
          planType: form.plan_type,
          setupFee,
          mrr,
          dealType: form.deal_type,
          personAId: form.person_a_id || undefined,
          personBId: form.person_b_id || undefined,
          splitPctA: Number(form.split_pct_a),
          splitPctB: Number(form.split_pct_b),
          customRates,
        });
      }

      // 3. Sync Commissions (Keep approved/paid, regenerate processing)
      if (editingClientId) {
        // Delete all 'processing' commissions for this client to replace them
        await supabase
          .from('commissions')
          .delete()
          .eq('client_id', editingClientId)
          .eq('status', 'processing');
      }

      if (commissions.length > 0) {
        const toInsert = commissions.map(c => {
          const row: any = {
            client_id: client.id,
            user_id: c.user_id,
            amount: c.amount,
            type: c.type,
            status: 'processing',
            is_recurring: c.is_recurring,
            split_percentage: c.split_percentage,
          };
          if (c.commission_role) row.commission_role = c.commission_role;
          if (c.setter_id) row.setter_id = c.setter_id;
          if (c.closer_id) row.closer_id = c.closer_id;
          return row;
        });

        const { error: commErr } = await supabase.from('commissions').insert(toInsert);
        if (commErr) {
          console.error('Commission insert error:', commErr);
          toast.error('Client saved, but some commission entries failed to insert: ' + commErr.message);
        }
      }

      // 4. Activity log
      await supabase.from('activities').insert({
        user_id: user.id,
        action: editingClientId
          ? `updated client details for: ${client.company_name}`
          : `added client: ${client.company_name} (${getPlanLabel(form.plan_type)})`,
      }).throwOnError();

      // 5. Reset & Cleanup
      setForm(emptyForm);
      setIsAdding(false);
      setEditingClientId(null);
      fetchData();
      toast.success(
        editingClientId
          ? '✅ Client and commissions updated successfully!'
          : '✅ Client saved & commission entries submitted for approval.'
      );

    } catch (err: any) {
      console.error(err);
      toast.error('Error saving client: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Delete client entirely ───
  const handleDeleteClient = async (id: string, name: string) => {
    if (!confirm(`Are you absolutely sure you want to delete client "${name}"? This will permanently delete all associated commissions and reports.`)) return;

    try {
      setIsLoading(true);
      // Delete commissions first
      await supabase.from('commissions').delete().eq('client_id', id);
      // Delete client
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: user?.id,
        action: `deleted client: ${name}`,
      });

      toast.success('Client deleted successfully.');
      fetchData();
    } catch (err: any) {
      toast.error('Failed to delete client: ' + err.message);
      setIsLoading(false);
    }
  };

  const toggleClientStatus = async (id: string, isActive: boolean) => {
    try {
      const newStage = isActive ? 'Inactive' : 'Closed';
      await supabase.from('clients').update({ stage: newStage, is_active: !isActive }).eq('id', id).throwOnError();
      setClients(cs => cs.map(c => c.id === id ? { ...c, stage: newStage, is_active: !isActive } : c));
      toast.success(isActive ? 'Client marked as Inactive.' : 'Client reactivated.');
    } catch (err: any) {
      toast.error('Failed to update client: ' + err.message);
    }
  };

  const filteredClients = clients.filter(c =>
    c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const needsPersonA = ['full_cycle', 'setter_closer', 'split', 'standalone_closer'].includes(form.deal_type);
  const needsPersonB = ['setter_closer', 'split'].includes(form.deal_type);
  const personALabel = form.deal_type === 'setter_closer' ? 'Setter' : form.deal_type === 'split' ? 'Person A' : 'Closer';
  const personBLabel = form.deal_type === 'setter_closer' ? 'Closer' : 'Person B';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your pipeline and auto-calculate commissions.</p>
        </div>
        <Button onClick={() => {
          setEditingClientId(null);
          setForm(emptyForm);
          setIsAdding(v => !v);
        }} className="shrink-0 gap-2">
          <Plus className="w-4 h-4" /> Add Client
        </Button>
      </div>

      {/* ── Add/Edit Client Form ─────────────────────────────────────── */}
      {isAdding && (
        <Card className="p-6 border border-accent/20 bg-accent/5 relative animate-in fade-in slide-in-from-top-4">
          <button onClick={() => { setIsAdding(false); setEditingClientId(null); }} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-semibold text-lg mb-4">{editingClientId ? 'Edit Client' : 'Add New Client'}</h3>

          <form onSubmit={handleSaveClient} className="space-y-5">
            {/* ── Basic Info ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name *</label>
                <Input required value={form.company_name}
                  onChange={e => setForm({ ...form, company_name: e.target.value })}
                  placeholder="Acme Corp" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <Input type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="contact@acme.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Pipeline Stage</label>
                <select className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                  value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
                  {['Cold Lead', 'Interested', 'Meeting Booked', 'Follow-Up', 'Closed', 'Inactive'].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-accent">Pricing Plan *</label>
                <select className="w-full h-10 px-3 rounded-xl border border-accent/40 bg-background text-sm focus:outline-none focus:border-accent"
                  value={form.plan_type} onChange={e => handlePlanChange(e.target.value as PlanType)}>
                  <option value="minimum">Minimum Plan ($1,200 setup + $997/mo)</option>
                  <option value="premium">Premium Plan ($3,000 upfront + $997/mo from month 4)</option>
                  <option value="custom">Custom Deal (Manual entry)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Setup / Upfront Fee ($)</label>
                <Input type="number" min={0} value={form.setup_fee}
                  onChange={e => setForm({ ...form, setup_fee: e.target.value })}
                  readOnly={form.plan_type !== 'custom'}
                  className={form.plan_type !== 'custom' ? 'bg-muted' : ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Monthly Recurring Revenue ($)</label>
                <Input type="number" min={0} value={form.mrr}
                  onChange={e => setForm({ ...form, mrr: e.target.value })}
                  readOnly={form.plan_type !== 'custom'}
                  className={form.plan_type !== 'custom' ? 'bg-muted' : ''} />
              </div>
            </div>

            {/* ── Deal Type & Team Assignment ── */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-accent">Deal Type & Commission Structure *</label>
                <select
                  className="w-full h-10 px-3 rounded-xl border border-accent/40 bg-background text-sm focus:outline-none focus:border-accent"
                  value={form.deal_type}
                  onChange={e => setForm({ ...form, deal_type: e.target.value as DealType, person_a_id: '', person_b_id: '' })}>
                  {DEAL_TYPES.map(dt => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </div>

              {form.deal_type === 'admin_closed' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-4 py-3 rounded-xl">
                  <Info className="w-4 h-4 text-accent shrink-0" />
                  CEO/Admin closed this deal. No commissions generated — 100% goes to agency revenue.
                </div>
              )}

              {needsPersonA && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{personALabel} *</label>
                    <select
                      className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                      value={form.person_a_id}
                      onChange={e => setForm({ ...form, person_a_id: e.target.value })}
                      required>
                      <option value="">Select teammate...</option>
                      {teammates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.first_name} {t.last_name} ({t.role.replace(/_/g, ' ')})
                        </option>
                      ))}
                    </select>
                  </div>

                  {needsPersonB && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {personBLabel}
                        {form.deal_type === 'setter_closer' && <span className="text-xs text-muted-foreground ml-1">(leave blank if CEO closed)</span>}
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent"
                        value={form.person_b_id}
                        onChange={e => setForm({ ...form, person_b_id: e.target.value })}>
                        <option value="">{form.deal_type === 'setter_closer' ? 'CEO/Admin closed' : 'Select person B...'}</option>
                        {teammates.filter(t => t.id !== form.person_a_id).map(t => (
                          <option key={t.id} value={t.id}>
                            {t.first_name} {t.last_name} ({t.role.replace(/_/g, ' ')})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Split percentages */}
              {form.deal_type === 'split' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Person A Split %</label>
                    <Input type="number" min={1} max={99} value={form.split_pct_a}
                      onChange={e => setForm({ ...form, split_pct_a: e.target.value, split_pct_b: String(100 - Number(e.target.value)) })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Person B Split %</label>
                    <Input type="number" min={1} max={99} value={form.split_pct_b}
                      onChange={e => setForm({ ...form, split_pct_b: e.target.value, split_pct_a: String(100 - Number(e.target.value)) })} />
                  </div>
                  {splitTotal !== 100 && (
                    <p className="col-span-2 text-xs text-destructive">⚠ Split percentages must total 100% (currently {splitTotal}%)</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Commission Preview ── */}
            {previews.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  💰 Commission Preview
                  <span className="text-xs font-normal text-muted-foreground">(all pending admin approval after save)</span>
                </p>
                <div className="space-y-1.5">
                  {previews.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                        {p.is_recurring ? <Repeat className="w-3 h-3 text-blue-400 shrink-0" /> : <Zap className="w-3 h-3 text-amber-400 shrink-0" />}
                        <span className="truncate">{p.label}</span>
                        {p.is_deferred && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded shrink-0">starts month 4</span>}
                      </div>
                      <span className={`font-bold ml-3 shrink-0 ${p.amount > 0 ? 'text-emerald-500' : 'text-muted-foreground text-xs italic'}`}>
                        {p.amount > 0 ? `$${p.amount.toFixed(2)}${p.is_recurring ? '/mo' : ''}` : 'Agency revenue'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSaving} className="gap-2 min-w-[200px]">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingClientId ? 'Update Client Details' : 'Save Client & Submit for Approval'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Clients Table ─────────────────────────────────────────── */}
      <Card className="p-4 border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search clients..." className="pl-9"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
        ) : filteredClients.length === 0 ? (
          <EmptyState icon={Users} title="No clients yet"
            description="Add your first client to start tracking pipeline and commissions."
            actionLabel="Add Client" onAction={() => setIsAdding(true)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-xl">Client</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">Setup / MRR</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium">Deal Type</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium">Assigned</th>}
                  <th className="px-4 py-3 font-medium">Added</th>
                  {isAdmin && <th className="px-4 py-3 font-medium rounded-tr-xl">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(client => (
                  <tr key={client.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${!client.is_active ? 'opacity-50 grayscale' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{client.company_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {client.plan_type === 'minimum' ? 'Minimum Plan' : client.plan_type === 'premium' ? 'Premium Plan' : 'Custom Deal'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STAGE_COLORS[client.stage] || 'bg-muted text-muted-foreground'}`}>
                        {client.stage}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {client.setup_fee > 0 && <div className="font-medium">${Number(client.setup_fee).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">setup</span></div>}
                        {client.mrr > 0 && <div className="text-sm text-muted-foreground">${Number(client.mrr).toLocaleString()}/mo</div>}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                        {client.plan_type === 'minimum' ? 'Minimum' : client.plan_type === 'premium' ? 'Premium' : 'Custom'}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        {client.closer ? `${client.closer.first_name} ${client.closer.last_name}` : 'Agency'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleEditClick(client)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Edit Client">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <Button size="sm" variant="ghost"
                            onClick={() => toggleClientStatus(client.id, client.is_active)}
                            className={`h-8 px-2 gap-1 text-xs ${client.is_active ? 'text-destructive hover:bg-destructive/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}>
                            <PowerOff className="w-3 h-3" />
                            {client.is_active ? 'Cancel' : 'Reactivate'}
                          </Button>
                          <button onClick={() => handleDeleteClient(client.id, client.company_name)}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Delete Client">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
