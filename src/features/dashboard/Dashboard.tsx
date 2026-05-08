import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PhoneCall, Calendar, Target, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function Dashboard() {
  const { user, profile } = useAuthStore();
  const [needsReport, setNeedsReport] = useState(false);
  const [stats, setStats] = useState({
    calls: 0,
    meetings: 0,
    closings: 0,
    revenue: 0 // Will represent MRR for admin, and Total Commission for teammates
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!user || !profile) return;

    const fetchData = async () => {
      try {
        // 1. Check if user needs to submit today's report
        const today = new Date().toISOString().split('T')[0];
        const { data: todayReport } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', today)
          .single();
        
        setNeedsReport(!todayReport);

        // 2. Fetch Weekly Stats
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        const { data: reports } = await supabase
          .from('daily_reports')
          .select('*')
          .gte('date', startOfWeek.toISOString().split('T')[0]);

        let totalCalls = 0;
        let totalMeetings = 0;
        let totalClosings = 0;

        if (reports) {
          reports.forEach(r => {
            if (isAdmin || r.user_id === user.id) { // Only count their own if not admin, wait actually reports has RLS for user so they only get theirs unless admin
              totalCalls += r.calls_made || 0;
              totalMeetings += r.meetings_booked || 0;
              totalClosings += r.closings || 0;
            }
          });

          // Build Chart Data
          const aggregated = reports.reduce((acc: any, curr) => {
            const date = new Date(curr.date).toLocaleDateString('en-US', { weekday: 'short' });
            acc[date] = (acc[date] || 0) + (curr.calls_made || 0);
            return acc;
          }, {});

          const formattedChartData = Object.keys(aggregated).map(key => ({
            name: key,
            calls: aggregated[key]
          }));
          setChartData(formattedChartData.length ? formattedChartData : [{ name: 'No Data', calls: 0 }]);
        }

        // 3. Fetch Revenue / Commission
        let totalRevenue = 0;

        if (isAdmin) {
          const { data: clients } = await supabase
            .from('clients')
            .select('mrr')
            .eq('is_active', true);
          
          totalRevenue = clients?.reduce((sum, client) => sum + Number(client.mrr || 0), 0) || 0;
        } else {
          // Teammate: Show total earned commission instead of agency MRR
          const { data: commissions } = await supabase
            .from('commissions')
            .select('amount')
            .eq('user_id', user.id)
            .eq('status', 'paid');
            
          totalRevenue = commissions?.reduce((sum, comm) => sum + Number(comm.amount || 0), 0) || 0;
        }

        setStats({
          calls: totalCalls,
          meetings: totalMeetings,
          closings: totalClosings,
          revenue: totalRevenue
        });

        // 4. Fetch Live Activity
        const { data: activityLog } = await supabase
          .from('activities')
          .select('*, users(first_name, last_name)')
          .order('created_at', { ascending: false })
          .limit(5);

        if (activityLog) setActivities(activityLog);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();

    // Subscribe to new activities
    const channel = supabase.channel('dashboard_activities')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile, isAdmin]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Here's your real-time performance tracking.</p>
        </div>
      </div>

      {needsReport && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">You haven't submitted your Daily Report for today! Head over to the Daily Reports tab to log your numbers.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls (7d)</CardTitle>
            <PhoneCall className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.calls}</div>
            <p className="text-xs text-muted-foreground mt-1">From daily reports</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meetings Booked</CardTitle>
            <Calendar className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.meetings}</div>
            <p className="text-xs text-muted-foreground mt-1">Active meetings</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closings</CardTitle>
            <Target className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.closings}</div>
            <p className="text-xs text-muted-foreground mt-1">Total deals</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isAdmin ? 'Total Agency MRR' : 'Total Commission Earned'}</CardTitle>
            <DollarSign className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{isAdmin ? 'Monthly Recurring' : 'Total Payouts Received'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.04)' }}
                  />
                  <Area type="monotone" dataKey="calls" stroke="var(--color-accent)" fillOpacity={1} fill="url(#colorCalls)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
              ) : (
                activities.map((activity, i) => {
                  const initial = activity.users?.first_name?.[0] || 'U';
                  return (
                    <div key={i} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent-foreground shrink-0 uppercase">
                        {initial}
                      </div>
                      <div>
                        <p className="text-sm">
                          <span className="font-medium">{activity.users?.first_name || 'User'}</span> {activity.action}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
