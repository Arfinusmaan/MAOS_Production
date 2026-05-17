import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, Users, FileText, CheckCircle, Clock, Loader2, Link as LinkIcon, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    totalMrr: 0,
    totalClients: 0,
    awaitingApproval: 0,  // processing — needs admin review
    pendingCommissions: 0, // approved — awaiting payout
    paidCommissions: 0
  });
  const [todayReports, setTodayReports] = useState<any[]>([]);
  const [activeTeammates, setActiveTeammates] = useState<any[]>([]);
  const [leadRequests, setLeadRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Global settings
  const [dailyCallTarget, setDailyCallTarget] = useState(250);
  const [isUpdatingTarget, setIsUpdatingTarget] = useState(false);

  // Pricing plans configuration settings
  const [plans, setPlans] = useState<any>({
    minimum: { name: 'Minimum Plan', setup: 1200, mrr: 997 },
    premium: { name: 'Premium Plan', setup: 3000, mrr: 997 }
  });
  const [isUpdatingPlans, setIsUpdatingPlans] = useState(false);

  // Commission Rates Settings
  const [rates, setRates] = useState<any>({
    full_cycle_closer: { setup: 20, mrr: 20 },
    setter:            { setup: 3, mrr: 3, bonus: 25 },
    closer:            { setup: 10, mrr: 10 },
    standalone_closer: { setup: 10, mrr: 10 },
    split_pool:        { setup: 20, mrr: 20 }
  });
  const [isUpdatingRates, setIsUpdatingRates] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // 1. Fetch Stats
      const { data: clients } = await supabase.from('clients').select('mrr').eq('is_active', true);
      const totalMrr = clients?.reduce((sum, c) => sum + Number(c.mrr || 0), 0) || 0;
      const totalClients = clients?.length || 0;

      const { data: commissions } = await supabase.from('commissions').select('amount, status');
      let awaitingApproval = 0;
      let pendingCommissions = 0;
      let paidCommissions = 0;
      commissions?.forEach(c => {
        if (c.status === 'paid') paidCommissions += Number(c.amount);
        if (c.status === 'pending') pendingCommissions += Number(c.amount);
        if (c.status === 'processing') awaitingApproval += Number(c.amount);
      });

      setStats({ totalMrr, totalClients, awaitingApproval, pendingCommissions, paidCommissions });

      // 2. Fetch Today's Reports
      const today = new Date().toISOString().split('T')[0];
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*, users(first_name, last_name, role)')
        .eq('date', today);
      
      if (reports) setTodayReports(reports);

      // 3. Fetch Active Teammates to compare who hasn't submitted
      const { data: team } = await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .neq('role', 'admin')
        .eq('status', 'active');
        
      if (team) setActiveTeammates(team);

      // 4. Fetch daily_call_target
      const { data: gSet } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'daily_call_target')
        .maybeSingle();
      if (gSet && gSet.value) {
        setDailyCallTarget(Number(gSet.value) || 250);
      }

      // 5. Fetch custom commission rates
      const { data: ratesSet } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'commission_rates')
        .maybeSingle();
      if (ratesSet && ratesSet.value) {
        try {
          const parsed = JSON.parse(ratesSet.value);
          setRates({
            full_cycle_closer: {
              setup: parsed.full_cycle_closer?.setup !== undefined ? Math.round(parsed.full_cycle_closer.setup * 100) : 20,
              mrr: parsed.full_cycle_closer?.mrr !== undefined ? Math.round(parsed.full_cycle_closer.mrr * 100) : 20,
            },
            setter: {
              setup: parsed.setter?.setup !== undefined ? Math.round(parsed.setter.setup * 100) : 3,
              mrr: parsed.setter?.mrr !== undefined ? Math.round(parsed.setter.mrr * 100) : 3,
              bonus: parsed.setter?.bonus !== undefined ? parsed.setter.bonus : 25,
            },
            closer: {
              setup: parsed.closer?.setup !== undefined ? Math.round(parsed.closer.setup * 100) : 10,
              mrr: parsed.closer?.mrr !== undefined ? Math.round(parsed.closer.mrr * 100) : 10,
            },
            standalone_closer: {
              setup: parsed.standalone_closer?.setup !== undefined ? Math.round(parsed.standalone_closer.setup * 100) : 10,
              mrr: parsed.standalone_closer?.mrr !== undefined ? Math.round(parsed.standalone_closer.mrr * 100) : 10,
            },
            split_pool: {
              setup: parsed.split_pool?.setup !== undefined ? Math.round(parsed.split_pool.setup * 100) : 20,
              mrr: parsed.split_pool?.mrr !== undefined ? Math.round(parsed.split_pool.mrr * 100) : 20,
            }
          });
        } catch (e) {
          console.error('Error parsing custom rates:', e);
        }
      }

      // 6. Fetch custom pricing plans
      const { data: plansSet } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'pricing_plans')
        .maybeSingle();
      if (plansSet && plansSet.value) {
        try {
          const parsed = JSON.parse(plansSet.value);
          setPlans({
            minimum: {
              name: parsed.minimum?.name || 'Minimum Plan',
              setup: parsed.minimum?.setup !== undefined ? Number(parsed.minimum.setup) : 1200,
              mrr: parsed.minimum?.mrr !== undefined ? Number(parsed.minimum.mrr) : 997,
            },
            premium: {
              name: parsed.premium?.name || 'Premium Plan',
              setup: parsed.premium?.setup !== undefined ? Number(parsed.premium.setup) : 3000,
              mrr: parsed.premium?.mrr !== undefined ? Number(parsed.premium.mrr) : 997,
            }
          });
        } catch (e) {
          console.error('Error parsing custom plans:', e);
        }
      }

    } catch (error) {
      console.error('Admin fetch error:', error);
      toast.error('Failed to load admin data');
    } finally {
      // 7. Fetch Lead Requests
      const { data: leadReqs } = await supabase
        .from('lead_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (leadReqs) setLeadRequests(leadReqs);

      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleSaveTarget = async () => {
    try {
      setIsUpdatingTarget(true);
      const { error } = await supabase
        .from('global_settings')
        .upsert({ key: 'daily_call_target', value: String(dailyCallTarget) });
      if (error) throw error;
      toast.success('Daily call target updated successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to update call target: ' + err.message);
    } finally {
      setIsUpdatingTarget(false);
    }
  };

  const handleSaveRates = async () => {
    try {
      setIsUpdatingRates(true);
      
      const payload = {
        full_cycle_closer: {
          setup: Number(rates.full_cycle_closer.setup) / 100,
          mrr: Number(rates.full_cycle_closer.mrr) / 100,
        },
        setter: {
          setup: Number(rates.setter.setup) / 100,
          mrr: Number(rates.setter.mrr) / 100,
          bonus: Number(rates.setter.bonus),
        },
        closer: {
          setup: Number(rates.closer.setup) / 100,
          mrr: Number(rates.closer.mrr) / 100,
        },
        standalone_closer: {
          setup: Number(rates.standalone_closer.setup) / 100,
          mrr: Number(rates.standalone_closer.mrr) / 100,
        },
        split_pool: {
          setup: Number(rates.split_pool.setup) / 100,
          mrr: Number(rates.split_pool.mrr) / 100,
        }
      };

      const { error } = await supabase
        .from('global_settings')
        .upsert({ key: 'commission_rates', value: JSON.stringify(payload) });
        
      if (error) throw error;
      toast.success('✅ Commission schema rates updated successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to update commission rates: ' + err.message);
    } finally {
      setIsUpdatingRates(false);
    }
  };

  const handleSavePlans = async () => {
    try {
      setIsUpdatingPlans(true);
      const payload = {
        minimum: {
          name: plans.minimum.name,
          setup: Number(plans.minimum.setup),
          mrr: Number(plans.minimum.mrr)
        },
        premium: {
          name: plans.premium.name,
          setup: Number(plans.premium.setup),
          mrr: Number(plans.premium.mrr)
        }
      };

      const { error } = await supabase
        .from('global_settings')
        .upsert({ key: 'pricing_plans', value: JSON.stringify(payload) });

      if (error) throw error;
      toast.success('✅ Pricing plans saved successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save pricing plans: ' + err.message);
    } finally {
      setIsUpdatingPlans(false);
    }
  };

  const copySignupLink = () => {
    const url = `${window.location.origin}/signup`;
    navigator.clipboard.writeText(url);
    toast.success('Signup link copied to clipboard!');
  };

  const handleLeadRequestStatus = async (id: string, status: 'assigned' | 'dismissed') => {
    try {
      const { error } = await supabase
        .from('lead_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      toast.success(`Mission request marked as ${status}`);
      fetchData();
    } catch (err: any) {
      toast.error('Failed to update mission request: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const submittedUserIds = new Set(todayReports.map(r => r.user_id));
  const missingReports = activeTeammates.filter(t => !submittedUserIds.has(t.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Master Control</h1>
          <p className="text-muted-foreground mt-1">Overview of your agency's revenue, team, and daily submissions.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={copySignupLink} className="gap-2">
            <LinkIcon className="w-4 h-4" />
            Copy Teammate Invite Link
          </Button>
          <Link to="/admin/users">
            <Button className="gap-2">
              <Users className="w-4 h-4" />
              Manage Users
            </Button>
          </Link>
        </div>
      </div>

      {/* Global Agency Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agency MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalMrr.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">From {stats.totalClients} active clients</p>
          </CardContent>
        </Card>
        
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.pendingCommissions.toLocaleString()}</div>
            <Link to="/admin/commissions" className="text-xs text-accent hover:underline mt-1 block">Pay team now &rarr;</Link>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid Out</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.paidCommissions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">All-time commissions</p>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports Today</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayReports.length} / {activeTeammates.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Submissions received</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Reports Tracking */}
        <Card className="border border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Today's Daily Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              
              {/* Submitted Reports */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Submitted</h3>
                {todayReports.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg border border-border/50 text-center">
                    No teammates have submitted a report today.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayReports.map(report => (
                      <div key={report.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0 font-bold">
                            {report.users?.first_name?.[0] || 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {report.users?.first_name} {report.users?.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">{report.users?.role.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <div className="flex gap-4 mt-3 sm:mt-0 text-sm">
                          <div className="text-center"><span className="block font-bold">{report.calls_made}</span><span className="text-xs text-muted-foreground">Calls</span></div>
                          <div className="text-center"><span className="block font-bold">{report.meetings_booked}</span><span className="text-xs text-muted-foreground">Meetings</span></div>
                          <div className="text-center"><span className="block font-bold">{report.closings}</span><span className="text-xs text-muted-foreground">Closings</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Missing Reports */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 mt-6">Missing</h3>
                {missingReports.length === 0 ? (
                  <div className="text-sm text-emerald-500 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-center flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" /> All active teammates have submitted today!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {missingReports.map(tm => (
                      <div key={tm.id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs shrink-0 font-bold">
                            {tm.first_name?.[0] || 'U'}
                          </div>
                          <p className="text-sm font-medium text-destructive">
                            {tm.first_name} {tm.last_name}
                          </p>
                        </div>
                        <span className="text-xs text-destructive/70 px-2 py-1 bg-destructive/10 rounded-full">Pending</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Global Configuration Controls (A-Z Edit Options) */}
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center gap-2">
            <Settings className="w-5 h-5 text-accent" />
            <CardTitle>System Config (A-Z)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Daily Call Target (Teammate Goal)
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={dailyCallTarget}
                  onChange={e => setDailyCallTarget(Number(e.target.value) || 0)}
                />
                <Button onClick={handleSaveTarget} disabled={isUpdatingTarget}>
                  {isUpdatingTarget ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sets the global target number of daily calls that teammate trackers will target (displays as target circle %).
              </p>
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Commission Schema Rates (Edit)
                </h4>
                <Button size="sm" onClick={handleSaveRates} disabled={isUpdatingRates} className="h-7 text-xs px-3">
                  {isUpdatingRates ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save Rates
                </Button>
              </div>

              {/* Full Cycle Closer */}
              <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-foreground">Full Cycle Closer</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[32px]">Setup:</span>
                    <Input type="number" min={0} max={100} value={rates.full_cycle_closer.setup}
                      onChange={e => setRates({ ...rates, full_cycle_closer: { ...rates.full_cycle_closer, setup: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[28px]">MRR:</span>
                    <Input type="number" min={0} max={100} value={rates.full_cycle_closer.mrr}
                      onChange={e => setRates({ ...rates, full_cycle_closer: { ...rates.full_cycle_closer, mrr: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              {/* Setter */}
              <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-foreground">Setter</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[32px]">Setup:</span>
                    <Input type="number" min={0} max={100} value={rates.setter.setup}
                      onChange={e => setRates({ ...rates, setter: { ...rates.setter, setup: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[28px]">MRR:</span>
                    <Input type="number" min={0} max={100} value={rates.setter.mrr}
                      onChange={e => setRates({ ...rates, setter: { ...rates.setter, mrr: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1 col-span-2 mt-1">
                    <span className="text-[10px] text-muted-foreground min-w-[64px]">Closer Bonus:</span>
                    <span className="text-[10px] text-muted-foreground">$</span>
                    <Input type="number" min={0} value={rates.setter.bonus}
                      onChange={e => setRates({ ...rates, setter: { ...rates.setter, bonus: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-20" />
                  </div>
                </div>
              </div>

              {/* Closer */}
              <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-foreground">Closer (paired with Setter)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[32px]">Setup:</span>
                    <Input type="number" min={0} max={100} value={rates.closer.setup}
                      onChange={e => setRates({ ...rates, closer: { ...rates.closer, setup: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[28px]">MRR:</span>
                    <Input type="number" min={0} max={100} value={rates.closer.mrr}
                      onChange={e => setRates({ ...rates, closer: { ...rates.closer, mrr: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              {/* Standalone Closer */}
              <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-foreground">Standalone Closer</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[32px]">Setup:</span>
                    <Input type="number" min={0} max={100} value={rates.standalone_closer.setup}
                      onChange={e => setRates({ ...rates, standalone_closer: { ...rates.standalone_closer, setup: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[28px]">MRR:</span>
                    <Input type="number" min={0} max={100} value={rates.standalone_closer.mrr}
                      onChange={e => setRates({ ...rates, standalone_closer: { ...rates.standalone_closer, mrr: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              {/* Split Pool */}
              <div className="space-y-1 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-foreground">Split Deal Pool</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[32px]">Setup:</span>
                    <Input type="number" min={0} max={100} value={rates.split_pool.setup}
                      onChange={e => setRates({ ...rates, split_pool: { ...rates.split_pool, setup: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[28px]">MRR:</span>
                    <Input type="number" min={0} max={100} value={rates.split_pool.mrr}
                      onChange={e => setRates({ ...rates, split_pool: { ...rates.split_pool, mrr: Number(e.target.value) } })}
                      className="h-7 text-xs px-1.5 py-0 w-16" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Pricing Plans Config */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Pricing Plans Presets (Edit)
                </h4>
                <Button size="sm" onClick={handleSavePlans} disabled={isUpdatingPlans} className="h-7 text-xs px-3">
                  {isUpdatingPlans ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save Plans
                </Button>
              </div>

              {/* Minimum Plan Preset */}
              <div className="space-y-2 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-accent">Minimum Plan Preset</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[50px]">Label:</span>
                    <Input type="text" value={plans.minimum.name}
                      onChange={e => setPlans({ ...plans, minimum: { ...plans.minimum, name: e.target.value } })}
                      className="h-7 text-xs px-1.5 py-0 w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground min-w-[50px]">Setup:</span>
                      <span className="text-[10px] text-muted-foreground">$</span>
                      <Input type="number" min={0} value={plans.minimum.setup}
                        onChange={e => setPlans({ ...plans, minimum: { ...plans.minimum, setup: Number(e.target.value) } })}
                        className="h-7 text-xs px-1.5 py-0 w-full" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground min-w-[30px]">MRR:</span>
                      <span className="text-[10px] text-muted-foreground">$</span>
                      <Input type="number" min={0} value={plans.minimum.mrr}
                        onChange={e => setPlans({ ...plans, minimum: { ...plans.minimum, mrr: Number(e.target.value) } })}
                        className="h-7 text-xs px-1.5 py-0 w-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Premium Plan Preset */}
              <div className="space-y-2 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <p className="text-xs font-semibold text-accent">Premium Plan Preset</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-[50px]">Label:</span>
                    <Input type="text" value={plans.premium.name}
                      onChange={e => setPlans({ ...plans, premium: { ...plans.premium, name: e.target.value } })}
                      className="h-7 text-xs px-1.5 py-0 w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground min-w-[50px]">Upfront:</span>
                      <span className="text-[10px] text-muted-foreground">$</span>
                      <Input type="number" min={0} value={plans.premium.setup}
                        onChange={e => setPlans({ ...plans, premium: { ...plans.premium, setup: Number(e.target.value) } })}
                        className="h-7 text-xs px-1.5 py-0 w-full" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground min-w-[30px]">MRR:</span>
                      <span className="text-[10px] text-muted-foreground">$</span>
                      <Input type="number" min={0} value={plans.premium.mrr}
                        onChange={e => setPlans({ ...plans, premium: { ...plans.premium, mrr: Number(e.target.value) } })}
                        className="h-7 text-xs px-1.5 py-0 w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead Requests Tracking */}
        <Card className="border border-border lg:col-span-3">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Active Mission Requests
              </CardTitle>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Awaiting Deployment: {leadRequests.filter(r => r.status === 'pending').length}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {leadRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm italic border border-dashed border-border rounded-2xl">
                  No mission requests pending from the field.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {leadRequests.map(req => (
                    <div key={req.id} className={`p-6 bg-card border rounded-[32px] space-y-4 transition-all hover:border-primary/20 ${req.status === 'assigned' ? 'opacity-50' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Field Agent</p>
                          <h4 className="font-bold text-foreground text-lg tracking-tight italic">{req.agent_name}</h4>
                          <p className="text-xs text-muted-foreground">{req.agent_email}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                          req.status === 'pending' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                          req.status === 'assigned' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          'bg-white/5 text-muted-foreground border-white/10'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-4 border-t border-border">
                        <p className="text-[10px] font-mono text-muted-foreground">
                          Requested {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {req.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg" onClick={() => handleLeadRequestStatus(req.id, 'dismissed')}>Dismiss</Button>
                            <Button size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white border-none" onClick={() => handleLeadRequestStatus(req.id, 'assigned')}>Deploy Mission</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
