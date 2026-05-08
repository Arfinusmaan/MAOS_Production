import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, ArrowUpRight, Clock, CheckCircle, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

export default function Commissions() {
  const { user, profile } = useAuthStore();
  const [commissions, setCommissions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    earned: 0,
    pending: 0,
    mrrBaseOrDeals: 0 // For admin: Agency MRR. For teammate: Total Closed Deals
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchCommissions = async () => {
    try {
      setIsLoading(true);
      
      const isAdmin = profile?.role === 'admin';

      // Query commissions
      let commQuery = supabase
        .from('commissions')
        .select('*, clients(company_name), users(first_name, last_name)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        commQuery = commQuery.eq('user_id', user?.id);
      }
      
      const { data: txs, error } = await commQuery;
      if (error) throw error;

      let earned = 0;
      let pending = 0;
      
      txs?.forEach(tx => {
        if (tx.status === 'paid') earned += Number(tx.amount);
        if (tx.status === 'pending' || tx.status === 'processing') pending += Number(tx.amount);
      });

      let mrrBaseOrDeals = 0;

      if (isAdmin) {
        // Query clients for MRR Base
        const { data: clients } = await supabase
          .from('clients')
          .select('mrr')
          .eq('is_active', true);
        
        mrrBaseOrDeals = clients?.reduce((sum, c) => sum + Number(c.mrr || 0), 0) || 0;
      } else {
        // For Teammate, just show number of active deals they've been assigned to
        const { count } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .or(`assigned_setter_id.eq.${user?.id},assigned_closer_id.eq.${user?.id}`);
        
        mrrBaseOrDeals = count || 0;
      }

      setStats({ earned, pending, mrrBaseOrDeals });
      setCommissions(txs || []);
    } catch (error) {
      console.error('Error fetching commissions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile) fetchCommissions();
  }, [user, profile]);

  const markAsPaid = async (txId: string) => {
    try {
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', txId);

      if (error) throw error;
      fetchCommissions();
      toast.success('Payout status updated successfully!');
    } catch (error) {
      console.error('Error updating payout:', error);
      toast.error('Failed to update payout status.');
    }
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{isAdmin ? 'Team Payouts' : 'Commissions'}</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? 'Manage and pay your team.' : 'Track your earnings and pending payouts.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border border-border bg-accent/5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {isAdmin ? 'Total Paid Out (YTD)' : 'Total Earned (YTD)'}
              </p>
              <h2 className="text-3xl font-bold mt-2">${stats.earned.toLocaleString()}</h2>
            </div>
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500 font-medium">
            <ArrowUpRight className="w-4 h-4" />
            <span>Updated in real-time</span>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {isAdmin ? 'Total Owed to Team' : 'Pending Payout'}
              </p>
              <h2 className="text-3xl font-bold mt-2">${stats.pending.toLocaleString()}</h2>
            </div>
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <span>Next payout on 15th</span>
          </div>
        </Card>

        <Card className="p-6 border border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {isAdmin ? 'Total Agency MRR' : 'Total Deals Closed'}
              </p>
              <h2 className="text-3xl font-bold mt-2">{isAdmin ? `$${stats.mrrBaseOrDeals.toLocaleString()}` : stats.mrrBaseOrDeals}</h2>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500 font-medium">
            <ArrowUpRight className="w-4 h-4" />
            <span>{isAdmin ? 'Global agency revenue' : 'Your total assigned clients'}</span>
          </div>
        </Card>
      </div>

      <Card className="border border-border">
        <CardHeader>
          <CardTitle>{isAdmin ? 'All Pending & Paid Transactions' : 'Recent Transactions'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : commissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No commission transactions found yet.
            </div>
          ) : (
            <div className="space-y-4">
              {commissions.map((tx, i) => (
                <div key={tx.id || i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex shrink-0 items-center justify-center ${tx.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : tx.status === 'processing' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}`}>
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {tx.clients?.company_name || 'Unknown Client'}
                        {isAdmin && tx.users && <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md">via {tx.users.first_name} {tx.users.last_name}</span>}
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {tx.type.replace('_', ' ')} {tx.split_percentage !== 100 && `(${tx.split_percentage}%)`} • {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-right">
                      <p className="font-semibold">${Number(tx.amount).toFixed(2)}</p>
                      <p className={`text-[10px] uppercase tracking-wider font-bold mt-1 ${tx.status === 'paid' ? 'text-emerald-500' : tx.status === 'processing' ? 'text-blue-500' : 'text-orange-500'}`}>
                        {tx.status}
                      </p>
                    </div>
                    {isAdmin && tx.status === 'pending' && (
                      <Button 
                        size="sm" 
                        onClick={() => markAsPaid(tx.id)}
                        className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border-0 gap-2 h-8"
                      >
                        <Check className="w-3 h-3" /> Mark Paid
                      </Button>
                    )}
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
