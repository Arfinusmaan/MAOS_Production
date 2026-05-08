import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Users, FileText, CheckCircle, Clock, Loader2, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    totalMrr: 0,
    totalClients: 0,
    pendingCommissions: 0,
    paidCommissions: 0
  });
  const [todayReports, setTodayReports] = useState<any[]>([]);
  const [activeTeammates, setActiveTeammates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // 1. Fetch Stats
      const { data: clients } = await supabase.from('clients').select('mrr').eq('is_active', true);
      const totalMrr = clients?.reduce((sum, c) => sum + Number(c.mrr || 0), 0) || 0;
      const totalClients = clients?.length || 0;

      const { data: commissions } = await supabase.from('commissions').select('amount, status');
      let pendingCommissions = 0;
      let paidCommissions = 0;
      commissions?.forEach(c => {
        if (c.status === 'paid') paidCommissions += Number(c.amount);
        if (c.status === 'pending') pendingCommissions += Number(c.amount);
      });

      setStats({ totalMrr, totalClients, pendingCommissions, paidCommissions });

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

    } catch (error) {
      console.error('Admin fetch error:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const copySignupLink = () => {
    const url = `${window.location.origin}/signup`;
    navigator.clipboard.writeText(url);
    toast.success('Signup link copied to clipboard!');
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
            <Link to="/commissions" className="text-xs text-accent hover:underline mt-1 block">Pay team now &rarr;</Link>
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

      {/* Daily Reports Tracking */}
      <Card className="border border-border">
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
    </div>
  );
}
