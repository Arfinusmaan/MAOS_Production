import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PhoneCall, Calendar, Target, DollarSign, AlertCircle, CalendarIcon } from 'lucide-react';
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
  
  // Date range state
  const [dateFilter, setDateFilter] = useState<'7days' | '30days' | 'specific' | 'alltime'>('7days');
  const [specificDate, setSpecificDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const isAdmin = profile?.role === 'admin';

  const fetchData = async () => {
    if (!user || !profile) return;
    try {
      // 1. Check if user needs to submit today's report (teammates only)
      if (!isAdmin) {
        const today = new Date().toISOString().split('T')[0];
        const { data: todayReport } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();
        setNeedsReport(!todayReport);
      } else {
        setNeedsReport(false);
      }

      // 2. Fetch daily reports based on date filter
      let reportsQuery = supabase.from('daily_reports').select('*');

      if (dateFilter === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        reportsQuery = reportsQuery.gte('date', d.toISOString().split('T')[0]);
      } else if (dateFilter === '30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        reportsQuery = reportsQuery.gte('date', d.toISOString().split('T')[0]);
      } else if (dateFilter === 'specific') {
        reportsQuery = reportsQuery.eq('date', specificDate);
      }

      const { data: reports } = await reportsQuery;

      let totalCalls = 0;
      let totalMeetings = 0;
      let totalClosings = 0;

      if (reports) {
        reports.forEach(r => {
          if (isAdmin || r.user_id === user.id) {
            totalCalls += r.calls_made || 0;
            totalMeetings += r.meetings_booked || 0;
            totalClosings += r.closings || 0;
          }
        });

        // Sort reports chronologically
        const sortedReports = [...reports].sort((a, b) => a.date.localeCompare(b.date));

        // Build Chart Data
        const aggregated = sortedReports.reduce((acc: any, curr) => {
          const dateObj = new Date(curr.date + 'T00:00:00');
          const date = dateFilter === '7days' 
            ? dateObj.toLocaleDateString('en-US', { weekday: 'short' })
            : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          acc[date] = (acc[date] || 0) + (curr.calls_made || 0);
          return acc;
        }, {});

        const formattedChartData = Object.keys(aggregated).map(key => ({
          name: key,
          calls: aggregated[key]
        }));
        setChartData(formattedChartData.length ? formattedChartData : [{ name: 'No Data', calls: 0 }]);
      } else {
        setChartData([{ name: 'No Data', calls: 0 }]);
      }

      // 3. Fetch Revenue / Commission based on date filter
      let totalRevenue = 0;

      if (isAdmin) {
        let clientsQuery = supabase
          .from('clients')
          .select('mrr, setup_fee, created_at')
          .eq('is_active', true);
          
        if (dateFilter === '7days') {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          clientsQuery = clientsQuery.gte('created_at', d.toISOString());
        } else if (dateFilter === '30days') {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          clientsQuery = clientsQuery.gte('created_at', d.toISOString());
        } else if (dateFilter === 'specific') {
          clientsQuery = clientsQuery.gte('created_at', `${specificDate}T00:00:00.000Z`).lte('created_at', `${specificDate}T23:59:59.999Z`);
        }
        
        const { data: clients } = await clientsQuery;
        totalRevenue = clients?.reduce((sum, client) => sum + Number(client.mrr || 0), 0) || 0;
      } else {
        // Teammate: Show total earned commission in date range instead of agency MRR
        let commsQuery = supabase
          .from('commissions')
          .select('amount, created_at')
          .eq('user_id', user.id)
          .eq('status', 'paid');
          
        if (dateFilter === '7days') {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          commsQuery = commsQuery.gte('created_at', d.toISOString());
        } else if (dateFilter === '30days') {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          commsQuery = commsQuery.gte('created_at', d.toISOString());
        } else if (dateFilter === 'specific') {
          commsQuery = commsQuery.gte('created_at', `${specificDate}T00:00:00.000Z`).lte('created_at', `${specificDate}T23:59:59.999Z`);
        }
        
        const { data: commissions } = await commsQuery;
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

  useEffect(() => {
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
  }, [user, profile, isAdmin, dateFilter, specificDate]);

  const getMetricLabelSuffix = () => {
    if (dateFilter === '7days') return ' (7d)';
    if (dateFilter === '30days') return ' (30d)';
    if (dateFilter === 'specific') return ' (custom date)';
    return ' (all-time)';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Here's your real-time performance tracking.</p>
        </div>
        
        {/* Modern Range Filter Interface */}
        <div className="flex flex-wrap items-center gap-2">
          <select 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-input bg-background text-sm font-medium focus:outline-none focus:border-accent cursor-pointer transition-colors hover:bg-muted/50"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="specific">Specific Date</option>
            <option value="alltime">Total Overall</option>
          </select>
          
          {dateFilter === 'specific' && (
            <div className="relative flex items-center">
              <CalendarIcon className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={specificDate}
                onChange={e => setSpecificDate(e.target.value)}
                className="h-10 pl-9 pr-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:border-accent transition-colors hover:bg-muted/50 cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {needsReport && !isAdmin && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-center gap-3 text-orange-600 dark:text-orange-400 animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Daily Report Missing</p>
            <p className="text-xs mt-0.5 opacity-80">You haven't submitted your report for today. Head to Daily Reports to log your numbers.</p>
          </div>
        </div>
      )}

      {/* Main Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls{getMetricLabelSuffix()}</CardTitle>
            <PhoneCall className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.calls}</div>
            <p className="text-xs text-muted-foreground mt-1">From daily reports</p>
          </CardContent>
        </Card>
        
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meetings Booked{getMetricLabelSuffix()}</CardTitle>
            <Calendar className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.meetings}</div>
            <p className="text-xs text-muted-foreground mt-1">Logged in tracker</p>
          </CardContent>
        </Card>
        
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closings{getMetricLabelSuffix()}</CardTitle>
            <Target className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.closings}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed deals</p>
          </CardContent>
        </Card>
        
        <Card className="border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isAdmin ? `Total Agency MRR${getMetricLabelSuffix()}` : `Total Commission Earned${getMetricLabelSuffix()}`}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdmin ? 'Monthly Recurring' : 'Paid commissions received'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border border-border">
          <CardHeader>
            <CardTitle>Performance Trends (Calls Made)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full min-w-0">
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

        <Card className="border border-border">
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
