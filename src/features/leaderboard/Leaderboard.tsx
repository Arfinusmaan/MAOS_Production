import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Medal, Star, Loader2, Phone, TrendingUp } from 'lucide-react';
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

          // Consistency score
          const expectedDays = timeframe === 'this_month' ? new Date().getDate() : 30;
          let score = Math.min(100, Math.round((daysReported / Math.max(1, expectedDays)) * 100));
          if (timeframe === 'all_time') score = Math.min(100, 70 + daysReported);

          return {
            id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            role: user.role.replace(/_/g, ' '),
            score: score,
            revenue: revenue,
            calls: calls,
            closings: closings
          };
        });

        // Sort by revenue primarily, then calls secondary
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

  const gold = leaderboardData[0] || null;
  const silver = leaderboardData[1] || null;
  const bronze = leaderboardData[2] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight animate-in fade-in slide-in-from-top-2 duration-300">Leaderboard</h1>
          <p className="text-muted-foreground mt-1">Live team member performance rankings based on verified sales earnings.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <select 
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent font-medium cursor-pointer"
          >
            <option value="all_time">🏆 All Time</option>
            <option value="this_month">📅 This Month</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : leaderboardData.length === 0 ? (
        <div className="text-center p-12 border border-border rounded-xl bg-muted/30">
          <p className="text-muted-foreground">No sales data available for the leaderboard yet.</p>
        </div>
      ) : (
        <>
          {/* ─── 3D Podium Layout ─── */}
          <div className="flex flex-col md:flex-row items-center md:items-end justify-center gap-6 mt-8 mb-12">
            
            {/* 2nd Place: Silver (Left on Desktop, Stacked Below on Mobile) */}
            {silver && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="w-full md:w-72 order-2 md:order-1"
              >
                <Card className="border border-slate-400/20 bg-slate-400/5 shadow-sm relative overflow-hidden flex flex-col items-center p-6 text-center">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Medal className="w-20 h-20 text-slate-400" />
                  </div>
                  <div className="w-12 h-12 rounded-full bg-slate-300 text-slate-800 flex items-center justify-center text-lg font-bold mb-3 border-2 border-background shadow-lg">
                    2
                  </div>
                  <h3 className="font-semibold text-lg text-foreground truncate max-w-full">{silver.name}</h3>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5 capitalize">{silver.role}</span>
                  
                  <div className="mt-4 space-y-1.5 w-full">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🥈 Silver Medalist</p>
                    <p className="text-2xl font-bold text-foreground">${silver.revenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Commissions Earned</p>
                  </div>

                  <div className="flex justify-center gap-3 w-full mt-4 pt-4 border-t border-border/50 text-xs">
                    <span className="bg-secondary/50 px-2 py-1 rounded text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" /> {silver.calls} Calls
                    </span>
                    <span className="bg-secondary/50 px-2 py-1 rounded text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-slate-400" /> {silver.score}% Score
                    </span>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* 1st Place: Gold (Center - Highlighted & Larger) */}
            {gold && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full md:w-80 order-1 md:order-2 z-10"
              >
                <Card className="border-2 border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/5 shadow-[0_0_40px_rgba(245,158,11,0.12)] relative overflow-hidden flex flex-col items-center p-8 text-center md:pb-10">
                  <div className="absolute top-0 right-0 p-4 opacity-15">
                    <Trophy className="w-24 h-24 text-amber-500" />
                  </div>
                  <div className="w-16 h-16 rounded-full bg-amber-500 text-white flex items-center justify-center text-2xl font-black mb-4 border-4 border-background shadow-xl animate-pulse">
                    1
                  </div>
                  <h3 className="font-bold text-xl text-foreground truncate max-w-full">{gold.name}</h3>
                  <span className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-widest font-extrabold mt-1 capitalize">{gold.role}</span>
                  
                  <div className="mt-5 space-y-1.5 w-full">
                    <p className="text-xs font-extrabold text-amber-500 flex items-center justify-center gap-1 uppercase tracking-widest">
                      <Trophy className="w-4 h-4 fill-amber-500" /> Champion
                    </p>
                    <p className="text-3xl font-black text-foreground">${gold.revenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Commissions Earned</p>
                  </div>

                  <div className="flex justify-center gap-3 w-full mt-5 pt-4 border-t border-amber-500/10 text-xs">
                    <span className="bg-amber-500/10 px-2.5 py-1 rounded text-amber-700 dark:text-amber-300 flex items-center gap-1 font-semibold">
                      <Phone className="w-3.5 h-3.5 text-amber-500" /> {gold.calls} Calls
                    </span>
                    <span className="bg-amber-500/10 px-2.5 py-1 rounded text-amber-700 dark:text-amber-300 flex items-center gap-1 font-semibold">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-500" /> {gold.score}% Score
                    </span>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* 3rd Place: Bronze (Right) */}
            {bronze && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="w-full md:w-72 order-3"
              >
                <Card className="border border-orange-500/20 bg-orange-500/5 shadow-sm relative overflow-hidden flex flex-col items-center p-6 text-center">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Medal className="w-20 h-20 text-orange-500" />
                  </div>
                  <div className="w-12 h-12 rounded-full bg-orange-400 text-white flex items-center justify-center text-lg font-bold mb-3 border-2 border-background shadow-lg">
                    3
                  </div>
                  <h3 className="font-semibold text-lg text-foreground truncate max-w-full">{bronze.name}</h3>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5 capitalize">{bronze.role}</span>
                  
                  <div className="mt-4 space-y-1.5 w-full">
                    <p className="text-xs font-bold text-orange-400 uppercase tracking-widest">🥉 Bronze Medalist</p>
                    <p className="text-2xl font-bold text-foreground">${bronze.revenue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Commissions Earned</p>
                  </div>

                  <div className="flex justify-center gap-3 w-full mt-4 pt-4 border-t border-border/50 text-xs">
                    <span className="bg-secondary/50 px-2 py-1 rounded text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3 text-orange-400" /> {bronze.calls} Calls
                    </span>
                    <span className="bg-secondary/50 px-2 py-1 rounded text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-orange-400" /> {bronze.score}% Score
                    </span>
                  </div>
                </Card>
              </motion.div>
            )}

          </div>

          {/* Full Leaderboard Table */}
          <Card className="border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold rounded-tl-xl">Rank</th>
                    <th className="px-6 py-4 font-semibold">Team Member</th>
                    <th className="px-6 py-4 font-semibold">Role</th>
                    <th className="px-6 py-4 font-semibold text-center">Consistency Score</th>
                    <th className="px-6 py-4 font-semibold text-right">Commission Earned</th>
                    <th className="px-6 py-4 font-semibold text-right rounded-tr-xl">Calls Made</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData.map((user, index) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      key={user.id} 
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4 font-semibold">
                        <div className="flex items-center gap-2">
                          {index < 3 ? (
                            <Star className={`w-4 h-4 fill-current ${
                              index === 0 ? 'text-amber-500' : index === 1 ? 'text-slate-400' : 'text-orange-500'
                            }`} />
                          ) : (
                            <span className="w-4" />
                          )}
                          <span className={index < 3 ? "font-bold text-foreground" : "text-muted-foreground"}>
                            #{user.rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-foreground">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0 border shadow-sm ${
                            index === 0 ? 'bg-amber-500/15 text-amber-500 border-amber-500/20' :
                            index === 1 ? 'bg-slate-400/15 text-slate-500 border-slate-400/20' :
                            index === 2 ? 'bg-orange-400/15 text-orange-500 border-orange-400/20' :
                            'bg-muted text-muted-foreground border-border'
                          }`}>
                            {user.name[0]}
                          </div>
                          <span className="truncate">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground capitalize font-medium">{user.role}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${
                              user.score >= 90 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 
                              user.score >= 80 ? 'bg-accent shadow-[0_0_8px_rgba(99,102,241,0.3)]' : 
                              'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.3)]'
                            }`} style={{ width: `${user.score}%` }} />
                          </div>
                          <span className="font-bold text-xs w-8 text-foreground">{user.score}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-500">${user.revenue.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right text-muted-foreground font-semibold">{user.calls.toLocaleString()}</td>
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
