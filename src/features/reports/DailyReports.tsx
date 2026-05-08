import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Target, PhoneCall, Calendar, CheckCircle, TrendingUp, Loader2, Users, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

// ─── Admin View ───────────────────────────────────────────────
function AdminDailyReportsView() {
  const [isLoading, setIsLoading] = useState(true);
  const [todayReports, setTodayReports] = useState<any[]>([]);
  const [activeTeammates, setActiveTeammates] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // Fetch active teammates (exclude admin)
      const { data: team } = await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .neq('role', 'admin')
        .eq('status', 'active');

      if (team) setActiveTeammates(team);

      // Fetch reports for selected date
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*, users(first_name, last_name, role)')
        .eq('date', selectedDate);

      if (reports) setTodayReports(reports);
    } catch (error) {
      console.error('Admin reports fetch error:', error);
      toast.error('Failed to load reports.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const submittedIds = new Set(todayReports.map(r => r.user_id));
  const missingReports = activeTeammates.filter(t => !submittedIds.has(t.id));

  // Totals
  const totalCalls = todayReports.reduce((s, r) => s + (r.calls_made || 0), 0);
  const totalMeetings = todayReports.reduce((s, r) => s + (r.meetings_booked || 0), 0);
  const totalClosings = todayReports.reduce((s, r) => s + (r.closings || 0), 0);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Daily Reports</h1>
          <p className="text-muted-foreground mt-1">
            Team activity for <span className="font-medium text-foreground">{displayDate}</span>
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={e => setSelectedDate(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
            <PhoneCall className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Total Calls</p>
            <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Meetings Booked</p>
            <p className="text-2xl font-bold">{totalMeetings}</p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-500">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Closings</p>
            <p className="text-2xl font-bold">{totalClosings}</p>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submitted */}
          <Card className="border border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                Submitted
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({todayReports.length}/{activeTeammates.length})
                </span>
              </CardTitle>
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </CardHeader>
            <CardContent className="space-y-3">
              {todayReports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No reports submitted {isToday ? 'today' : 'on this date'}.
                </p>
              ) : (
                todayReports.map(report => (
                  <div key={report.id} className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600 font-bold text-sm">
                          {report.users?.first_name?.[0] || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                            {report.users?.first_name} {report.users?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {report.users?.role?.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-background/60 rounded-lg p-2">
                        <span className="block font-bold text-base">{report.calls_made || 0}</span>
                        <span className="text-muted-foreground">Calls</span>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2">
                        <span className="block font-bold text-base">{report.meetings_booked || 0}</span>
                        <span className="text-muted-foreground">Meetings</span>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2">
                        <span className="block font-bold text-base">{report.closings || 0}</span>
                        <span className="text-muted-foreground">Closings</span>
                      </div>
                    </div>
                    {report.notes && (
                      <p className="mt-3 text-xs text-muted-foreground bg-background/40 rounded-lg p-2 italic">
                        "{report.notes}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Missing */}
          <Card className="border border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                Missing Reports
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({missingReports.length})
                </span>
              </CardTitle>
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            </CardHeader>
            <CardContent className="space-y-2">
              {missingReports.length === 0 ? (
                <div className="flex items-center justify-center gap-2 text-sm text-emerald-500 p-6 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4" />
                  All teammates have submitted!
                </div>
              ) : (
                missingReports.map(tm => (
                  <div key={tm.id} className="flex items-center justify-between p-3 rounded-xl border border-destructive/20 bg-destructive/5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-destructive/20 flex items-center justify-center text-destructive text-xs font-bold">
                        {tm.first_name?.[0] || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{tm.first_name} {tm.last_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{tm.role?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <span className="text-xs text-destructive font-medium px-2 py-1 bg-destructive/10 rounded-full">
                      Not Submitted
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Teammate View ────────────────────────────────────────────
function TeammateDailyReportView() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [report, setReport] = useState({
    id: '',
    calls_made: 0,
    voicemails: 0,
    pickups: 0,
    meetings_booked: 0,
    shows: 0,
    closings: 0,
    notes: ''
  });

  const goal = 250;
  const percentage = Math.round(((report.calls_made || 0) / goal) * 100);

  useEffect(() => {
    if (!user) return;

    const fetchTodayReport = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', today)
          .single();

        if (data) {
          setReport({
            id: data.id,
            calls_made: data.calls_made || 0,
            voicemails: data.voicemails || 0,
            pickups: data.pickups || 0,
            meetings_booked: data.meetings_booked || 0,
            shows: data.shows || 0,
            closings: data.closings || 0,
            notes: data.notes || ''
          });
        }
      } catch {
        // No report yet for today — that's fine
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodayReport();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const payload = {
        user_id: user.id,
        date: today,
        calls_made: Number(report.calls_made),
        voicemails: Number(report.voicemails),
        pickups: Number(report.pickups),
        meetings_booked: Number(report.meetings_booked),
        shows: Number(report.shows),
        closings: Number(report.closings),
        notes: report.notes
      };

      if (report.id) {
        const { error } = await supabase.from('daily_reports').update(payload).eq('id', report.id);
        if (error) throw error;
        await supabase.from('activities').insert({ user_id: user.id, action: `updated their daily report with ${payload.calls_made} calls` });
      } else {
        const { data, error } = await supabase.from('daily_reports').insert(payload).select().single();
        if (error) throw error;
        setReport({ ...report, id: data.id });
        await supabase.from('activities').insert({ user_id: user.id, action: `submitted their daily report with ${payload.calls_made} calls` });
      }

      toast.success('Daily report saved successfully!');
    } catch (error: any) {
      console.error('Error saving report:', error);
      toast.error('Failed to save report: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Daily Reports</h1>
        <p className="text-muted-foreground mt-1">Track your daily outreach and goal completion.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Goal Tracker */}
        <Card className="col-span-1 border border-border shadow-sm flex flex-col items-center justify-center p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target className="w-32 h-32 text-accent" />
          </div>

          <div className="relative w-48 h-48 mb-4">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-secondary)" strokeWidth="10" />
              <motion.circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="10"
                strokeLinecap="round"
                initial={{ strokeDasharray: "0 283" }}
                animate={{ strokeDasharray: `${Math.min((percentage / 100) * 283, 283)} 283` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold">{Math.min(percentage, 100)}%</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Completed</span>
            </div>
          </div>

          <div className="text-center space-y-1 z-10">
            <p className="text-lg font-medium">{report.calls_made} / {goal} Calls</p>
            <p className="text-sm text-muted-foreground">{Math.max(0, goal - report.calls_made)} calls remaining today</p>
          </div>
        </Card>

        {/* Input Form */}
        <Card className="col-span-1 md:col-span-2 border border-border shadow-sm">
          <CardHeader>
            <CardTitle>{report.id ? 'Update Report' : 'Log Activity'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <PhoneCall className="w-3 h-3" /> Calls Made
                  </label>
                  <Input type="number" value={report.calls_made} onChange={e => setReport({ ...report, calls_made: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Voicemails</label>
                  <Input type="number" value={report.voicemails} onChange={e => setReport({ ...report, voicemails: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pickups</label>
                  <Input type="number" value={report.pickups} onChange={e => setReport({ ...report, pickups: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Meetings Booked
                  </label>
                  <Input type="number" value={report.meetings_booked} onChange={e => setReport({ ...report, meetings_booked: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shows</label>
                  <Input type="number" value={report.shows} onChange={e => setReport({ ...report, shows: Number(e.target.value) })} min={0} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-500" /> Closings
                  </label>
                  <Input type="number" value={report.closings} onChange={e => setReport({ ...report, closings: Number(e.target.value) })} min={0} />
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daily Notes</label>
                <textarea
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:border-accent resize-none"
                  placeholder="How did today go? Any blockers?"
                  value={report.notes}
                  onChange={e => setReport({ ...report, notes: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {report.id ? 'Update Report' : 'Save Report'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Conversion Rate</p>
            <p className="text-2xl font-bold">
              {report.calls_made > 0 ? ((report.closings / report.calls_made) * 100).toFixed(1) : '0'}%
            </p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Pickup Rate</p>
            <p className="text-2xl font-bold">
              {report.calls_made > 0 ? ((report.pickups / report.calls_made) * 100).toFixed(1) : '0'}%
            </p>
          </div>
        </Card>
        <Card className="p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-500">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Meeting Rate</p>
            <p className="text-2xl font-bold">
              {report.calls_made > 0 ? ((report.meetings_booked / report.calls_made) * 100).toFixed(1) : '0'}%
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Root Export ──────────────────────────────────────────────
export default function DailyReports() {
  const { profile } = useAuthStore();

  if (!profile) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (profile.role === 'admin') {
    return <AdminDailyReportsView />;
  }

  return <TeammateDailyReportView />;
}
