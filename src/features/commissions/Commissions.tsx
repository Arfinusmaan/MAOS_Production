import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DollarSign, Clock, CheckCircle, Loader2, Check,
  Repeat, Zap, ShieldCheck, Pencil, X, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

type TxStatus = 'processing' | 'pending' | 'paid';

export default function Commissions() {
  const { user, profile } = useAuthStore();
  const [commissions, setCommissions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    awaitingApproval: 0,   // processing
    pendingPayout: 0,       // pending (approved, not yet paid)
    setupPaid: 0,
    setupPending: 0,        // pending only (approved)
    mrrPaid: 0,
    mrrPending: 0,          // pending only (approved)
    totalPaid: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

  const isAdmin = profile?.role === 'admin';

  const fetchCommissions = async () => {
    try {
      setIsLoading(true);

      let q = supabase
        .from('commissions')
        .select('*, clients(company_name, mrr, setup_fee)')
        .order('created_at', { ascending: false });

      if (!isAdmin) q = q.eq('user_id', user?.id);

      const { data: txs, error } = await q;
      if (error) throw error;

      // For admin: fetch all users separately (avoids join + RLS issue)
      let usersMap: Record<string, any> = {};
      if (isAdmin) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, first_name, last_name, role');
        (usersData || []).forEach(u => { usersMap[u.id] = u; });
      }

      // Attach user data to each tx
      const enriched = (txs || []).map(tx => ({
        ...tx,
        users: usersMap[tx.user_id] || null,
      }));

      // ── Calculate stats ──
      let awaitingApproval = 0;
      let pendingPayout = 0;
      let setupPaid = 0, setupPending = 0;
      let mrrPaid = 0, mrrPending = 0;
      let totalPaid = 0;

      enriched.forEach(tx => {
        const amt = Number(tx.amount);
        const isSetup = tx.type === 'setup' || tx.type === 'setter_bonus';
        const isMrr = tx.type === 'mrr';

        if (tx.status === 'processing') {
          awaitingApproval += amt;
        } else if (tx.status === 'pending') {
          pendingPayout += amt;
          if (isSetup) setupPending += amt;
          if (isMrr) mrrPending += amt;
        } else if (tx.status === 'paid') {
          totalPaid += amt;
          if (isSetup) setupPaid += amt;
          if (isMrr) mrrPaid += amt;
        }
      });

      setStats({ awaitingApproval, pendingPayout, setupPaid, setupPending, mrrPaid, mrrPending, totalPaid });
      setCommissions(enriched);
    } catch (err: any) {
      console.error('Commission fetch error:', err);
      toast.error('Failed to load commissions: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile) fetchCommissions();
  }, [user, profile]);

  // ── Approve (optionally with edited amount) ──
  const approveCommission = async (tx: any) => {
    try {
      const amount = editingId === tx.id ? Number(editAmount) : tx.amount;
      if (isNaN(amount) || amount <= 0) {
        toast.error('Enter a valid amount.');
        return;
      }
      const { error } = await supabase.from('commissions')
        .update({ status: 'pending', amount: Math.round(amount * 100) / 100 })
        .eq('id', tx.id);
      if (error) throw error;
      setEditingId(null);
      fetchCommissions();
      toast.success('Commission approved! Will be included in next payout.');
    } catch (err) {
      toast.error('Failed to approve commission.');
    }
  };

  // ── Reject commission ──
  const rejectCommission = async (txId: string) => {
    try {
      const { error } = await supabase.from('commissions').delete().eq('id', txId);
      if (error) throw error;
      fetchCommissions();
      toast.success('Commission rejected and removed.');
    } catch (err) {
      toast.error('Failed to reject commission.');
    }
  };

  // ── Mark Paid ──
  const markAsPaid = async (txId: string) => {
    try {
      const { error } = await supabase.from('commissions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', txId);
      if (error) throw error;
      fetchCommissions();
      toast.success('Marked as paid! 🎉');
    } catch {
      toast.error('Failed to mark as paid.');
    }
  };

  const typeLabel = (type: string) =>
    type === 'setup' ? 'Setup Fee' : type === 'mrr' ? 'Recurring MRR' : 'Setter Bonus';

  const statusBadge = (status: TxStatus) => {
    const map: Record<TxStatus, { label: string; cls: string }> = {
      processing: { label: 'Awaiting Approval', cls: 'bg-orange-500/10 text-orange-500' },
      pending: { label: 'Approved – Unpaid', cls: 'bg-blue-500/10 text-blue-500' },
      paid: { label: 'Paid', cls: 'bg-emerald-500/10 text-emerald-500' },
    };
    const s = map[status];
    return <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{isAdmin ? 'Team Payouts' : 'My Commissions'}</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? 'Review, approve, and pay your team commissions.' : 'Track your earnings across all stages.'}
        </p>
      </div>

      {/* ── Stage 1: Pending Approval ── */}
      <Card className={`p-5 border ${stats.awaitingApproval > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-border'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              {isAdmin ? 'Awaiting Your Approval' : 'Pending Admin Approval'}
            </p>
            <h2 className="text-3xl font-bold mt-1">${stats.awaitingApproval.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stats.awaitingApproval > 0 ? 'bg-orange-500/20 text-orange-500' : 'bg-muted text-muted-foreground'}`}>
            <Clock className="w-6 h-6" />
          </div>
        </div>
        {isAdmin && stats.awaitingApproval > 0 && (
          <p className="mt-2 text-xs text-orange-500">Scroll down to review and approve — teammates can see these are submitted.</p>
        )}
        {!isAdmin && stats.awaitingApproval > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Your admin will review and approve these shortly.</p>
        )}
      </Card>

      {/* ── Stages 2 & 3 side by side ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isAdmin ? 'Approved – Pending Payout' : 'Approved – Awaiting Payout'}</p>
              <h2 className="text-2xl font-bold mt-1">${stats.pendingPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          {isAdmin && stats.pendingPayout > 0 && (
            <p className="mt-2 text-xs text-blue-500">Scroll to transaction list to pay teammates individually.</p>
          )}
        </Card>

        <Card className="p-5 border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isAdmin ? 'Total Paid to Team' : 'Total Earned (Paid)'}</p>
              <h2 className="text-2xl font-bold mt-1">${stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Setup vs MRR breakdown (approved + paid only) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <span className="text-sm font-semibold">Setup Fee / One-Time</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-bold text-emerald-500">${stats.setupPaid.toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Approved / Pending</p><p className="text-lg font-bold text-blue-500">${stats.setupPending.toFixed(2)}</p></div>
          </div>
        </Card>
        <Card className="p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Repeat className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <span className="text-sm font-semibold">Recurring MRR Commission</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-bold text-emerald-500">${stats.mrrPaid.toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Approved / Pending</p><p className="text-lg font-bold text-blue-500">${stats.mrrPending.toFixed(2)}</p></div>
          </div>
        </Card>
      </div>

      {/* ── Transaction List ── */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle>{isAdmin ? 'All Transactions' : 'My Transactions'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
          ) : commissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <DollarSign className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No commission records yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {commissions.map(tx => (
                <div key={tx.id} className={`rounded-xl border p-4 transition-colors ${
                  tx.status === 'processing' ? 'border-orange-500/20 bg-orange-500/5' :
                  tx.status === 'pending' ? 'border-blue-500/20 bg-blue-500/5' :
                  'border-border/50 bg-background/50'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left: info */}
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex shrink-0 items-center justify-center mt-0.5 ${
                        tx.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' :
                        tx.status === 'pending' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-orange-500/10 text-orange-500'
                      }`}>
                        {tx.type === 'mrr' ? <Repeat className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{tx.clients?.company_name || 'Unknown Client'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {typeLabel(tx.type)}
                          {tx.is_recurring && <span className="ml-1 text-blue-400">(recurring)</span>}
                          {tx.split_percentage !== 100 && ` · ${tx.split_percentage}% rate`}
                          {' · '}{new Date(tx.created_at).toLocaleDateString()}
                        </p>
                        {isAdmin && tx.users && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            → {tx.users.first_name} {tx.users.last_name} <span className="opacity-60 capitalize">({tx.users.role?.replace(/_/g, ' ')})</span>
                          </p>
                        )}
                        <div className="mt-1">{statusBadge(tx.status)}</div>
                      </div>
                    </div>

                    {/* Right: amount + actions */}
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end shrink-0">
                      {/* Amount (editable if admin + processing) */}
                      {isAdmin && editingId === tx.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">$</span>
                          <Input
                            type="number" step="0.01" min={0}
                            value={editAmount}
                            onChange={e => setEditAmount(e.target.value)}
                            className="w-28 h-8 text-right font-bold"
                            autoFocus
                          />
                          <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-lg font-bold">${Number(tx.amount).toFixed(2)}</span>
                          {isAdmin && tx.status === 'processing' && (
                            <button
                              onClick={() => { setEditingId(tx.id); setEditAmount(tx.amount.toString()); }}
                              className="text-muted-foreground hover:text-accent ml-1"
                              title="Edit amount"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Admin actions */}
                      {isAdmin && tx.status === 'processing' && (
                        <div className="flex gap-2">
                          <Button size="sm"
                            onClick={() => approveCommission(tx)}
                            className="h-8 text-xs gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border-0">
                            <ShieldCheck className="w-3 h-3" />
                            {editingId === tx.id ? 'Save & Approve' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => rejectCommission(tx.id)}
                            className="h-8 text-xs text-destructive hover:bg-destructive/10">
                            Reject
                          </Button>
                        </div>
                      )}
                      {isAdmin && tx.status === 'pending' && (
                        <Button size="sm"
                          onClick={() => markAsPaid(tx.id)}
                          className="h-8 text-xs gap-1 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white border-0">
                          <Check className="w-3 h-3" /> Mark Paid
                        </Button>
                      )}
                      {tx.status === 'paid' && tx.paid_at && (
                        <span className="text-xs text-muted-foreground">
                          Paid {new Date(tx.paid_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
