import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Medal, Star, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export default function Leaderboard() {
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('all_time');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setIsLoading(true);
        
        // 1. Fetch Users
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name, role')
          .neq('role', 'admin')
          .eq('status', 'active');

        if (!users) return;

        // 2. Fetch Reports
        let reportsQuery = supabase.from('daily_reports').select('user_id, calls_made, closings, date');
        if (timeframe === 'this_month') {
          const firstDay = new Date();
          firstDay.setDate(1);
          reportsQuery = reportsQuery.gte('date', firstDay.toISOString().split('T')[0]);
        }
        const { data: reports } = await reportsQuery;

        // 3. Fetch Commissions for Revenue
        let commQuery = supabase.from('commissions').select('user_id, amount, created_at');
        if (timeframe === 'this_month') {
          const firstDay = new Date();
          firstDay.setDate(1);
          commQuery = commQuery.gte('created_at', firstDay.toISOString());
        }
        const { data: commissions } = await commQuery;

        // Aggregate Data
        const aggregated = users.map(user => {
          let calls = 0;
          let closings = 0;
          let revenue = 0;
          let daysReported = 0;

          reports?.forEach(r => {
            if (r.user_id === user.id) {
              calls += r.calls_made || 0;
              closings += r.closings || 0;
              daysReported += 1;
            }
          });

          commissions?.forEach(c => {
            if (c.user_id === user.id) {
              revenue += Number(c.amount) || 0;
            }
          });

          // Calculate a dummy "consistency score" based on days reported vs expected (roughly 20 per month)
          const expectedDays = timeframe === 'this_month' ? new Date().getDate() : 30; // rough
          let score = Math.min(100, Math.round((daysReported / Math.max(1, expectedDays)) * 100));
          if (timeframe === 'all_time') score = Math.min(100, 70 + daysReported); // default baseline

          return {
            id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            role: user.role.replace('_', ' '),
            score: score,
            revenue: revenue,
            calls: calls,
            closings: closings
          };
        });

        // Sort by revenue, then calls
        aggregated.sort((a, b) => b.revenue - a.revenue || b.calls - a.calls);
        
        // Assign ranks
        const ranked = aggregated.map((u, index) => ({ ...u, rank: index + 1 }));
        setLeaderboardData(ranked);

      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, [timeframe]);

  const topOverall = leaderboardData[0];
  const topSetter = [...leaderboardData].sort((a, b) => b.calls - a.calls)[0];
  const topRevenue = [...leaderboardData].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground mt-1">Live performance rankings based on verified data.</p>
        </div>
        <div className="flex gap-2">
          <select 
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all_time">All Time</option>
            <option value="this_month">This Month</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : leaderboardData.length === 0 ? (
        <div className="text-center p-12 border border-border rounded-xl bg-muted/30">
          <p className="text-muted-foreground">No data available for the leaderboard yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="col-span-1 border border-amber-500/20 bg-amber-500/5 shadow-[0_0_30px_rgba(245,158,11,0.1)] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-20">
                <Trophy className="w-24 h-24 text-amber-500" />
              </div>
              <CardContent className="p-6 relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500 text-white flex items-center justify-center text-2xl font-bold mb-4 border-4 border-background shadow-xl">
                  1
                </div>
                <h3 className="font-semibold text-xl">{topOverall?.name || 'N/A'}</h3>
                <p className="text-sm text-muted-foreground capitalize">Top Overall Performer</p>
                <div className="mt-4 px-4 py-2 bg-background/80 backdrop-blur rounded-xl border border-border font-medium text-amber-600">
                  {topOverall?.score || 0} Consistency Score
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-1 border border-slate-300/20 bg-slate-300/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-20">
                <Medal className="w-24 h-24 text-slate-400" />
              </div>
              <CardContent className="p-6 relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-2xl font-bold mb-4 border-4 border-background shadow-xl">
                  2
                </div>
                <h3 className="font-semibold text-xl">{topSetter?.name || 'N/A'}</h3>
                <p className="text-sm text-muted-foreground">Top Caller</p>
                <div className="mt-4 px-4 py-2 bg-background/80 backdrop-blur rounded-xl border border-border font-medium text-slate-600">
                  {topSetter?.calls?.toLocaleString() || 0} Calls
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-1 border border-orange-500/20 bg-orange-500/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-20">
                <Medal className="w-24 h-24 text-orange-500" />
              </div>
              <CardContent className="p-6 relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-orange-400 text-white flex items-center justify-center text-2xl font-bold mb-4 border-4 border-background shadow-xl">
                  3
                </div>
                <h3 className="font-semibold text-xl">{topRevenue?.name || 'N/A'}</h3>
                <p className="text-sm text-muted-foreground">Top Revenue Earner</p>
                <div className="mt-4 px-4 py-2 bg-background/80 backdrop-blur rounded-xl border border-border font-medium text-orange-600">
                  ${topRevenue?.revenue?.toLocaleString() || 0} Earned
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium rounded-tl-xl">Rank</th>
                    <th className="px-6 py-4 font-medium">Team Member</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium text-center">Consistency Score</th>
                    <th className="px-6 py-4 font-medium text-right">Commission Earned</th>
                    <th className="px-6 py-4 font-medium text-right rounded-tr-xl">Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData.map((user, index) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      key={user.id} 
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4 font-semibold">
                        <div className="flex items-center gap-2">
                          {index < 3 ? <Star className={`w-4 h-4 ${index === 0 ? 'text-amber-500' : index === 1 ? 'text-slate-400' : 'text-orange-500'}`} /> : <span className="w-4" />}
                          #{user.rank}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium">{user.name}</td>
                      <td className="px-6 py-4 text-muted-foreground capitalize">{user.role}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-full max-w-[100px] h-2 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${user.score >= 90 ? 'bg-emerald-500' : user.score >= 80 ? 'bg-accent' : 'bg-orange-500'}`} style={{ width: `${user.score}%` }} />
                          </div>
                          <span className="font-medium text-xs w-8">{user.score}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-emerald-500">${user.revenue.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right text-muted-foreground">{user.calls.toLocaleString()}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
