import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut, 
  Menu,
  Bell,
  Search,
  Target,
  DollarSign,
  Trophy,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

const BASE_SIDEBAR_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Clients', href: '/clients' },
  { icon: Target, label: 'Daily Reports', href: '/reports' },
  { icon: DollarSign, label: 'Commissions', href: '/commissions' },
  { icon: Trophy, label: 'Leaderboard', href: '/leaderboard' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

const ADMIN_SIDEBAR_ITEMS = [
  { icon: ShieldCheck, label: 'Control Center', href: '/admin' },
  { icon: ShieldAlert, label: 'Team Payouts', href: '/admin/commissions' },
  { icon: Users, label: 'Manage Users', href: '/admin/users' },
];

export default function DashboardLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuthStore();
  const [initials, setInitials] = useState('..');

  const isAdmin = profile?.role === 'admin';

  // Generate initials
  useEffect(() => {
    if (profile) {
      const first = profile.first_name?.[0] || '';
      const last = profile.last_name?.[0] || '';
      setInitials(`${first}${last}`.toUpperCase());
    }
  }, [profile]);

  // Generate dynamic notifications
  useEffect(() => {
    const fetchAlerts = async () => {
      if (!user) return;
      const alerts = [];
      const today = new Date().toISOString().split('T')[0];

      if (isAdmin) {
        // Admin alerts: Missing reports
        const { data: team } = await supabase.from('users').select('id, first_name').neq('role', 'admin').eq('status', 'active');
        const { data: reports } = await supabase.from('daily_reports').select('user_id').eq('date', today);
        
        const submittedIds = new Set(reports?.map(r => r.user_id) || []);
        const missingCount = team?.filter(t => !submittedIds.has(t.id)).length || 0;
        
        if (missingCount > 0) {
          alerts.push({ id: 1, title: 'Missing Reports', message: `${missingCount} teammates haven't submitted their daily report today.`, time: 'Just now' });
        }

        // Admin alerts: Pending payouts
        const { data: pendingComms } = await supabase.from('commissions').select('id').eq('status', 'pending');
        if (pendingComms && pendingComms.length > 0) {
          alerts.push({ id: 2, title: 'Pending Payouts', message: `You have ${pendingComms.length} pending commission payouts to process.`, time: 'Action required' });
        }

      } else {
        // Teammate alerts: Missing their own report
        const { data: myReport } = await supabase.from('daily_reports').select('id').eq('user_id', user.id).eq('date', today).single();
        if (!myReport) {
          alerts.push({ id: 1, title: 'Action Required', message: 'You have not submitted your daily report for today yet.', time: 'Today' });
        }

        // Teammate alerts: Pending earnings
        const { data: myPending } = await supabase.from('commissions').select('id').eq('user_id', user.id).eq('status', 'pending');
        if (myPending && myPending.length > 0) {
          alerts.push({ id: 2, title: 'Pending Earnings', message: `You have ${myPending.length} commission payouts waiting for admin approval.`, time: 'Pending' });
        }
      }

      setNotifications(alerts);
    };

    fetchAlerts();
  }, [user, isAdmin]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Add Admin section if user is admin
  const sidebarItems = isAdmin 
    ? [
        ...BASE_SIDEBAR_ITEMS,
        { icon: ShieldCheck, label: 'Control Center', href: '/admin' },
        { icon: ShieldAlert, label: 'Team Payouts', href: '/admin/commissions' },
        { icon: Users, label: 'Manage Users', href: '/admin/users' },
      ]
    : BASE_SIDEBAR_ITEMS;

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-background p-4 h-screen sticky top-0">
        <div className="flex items-center gap-2 px-2 mb-8 mt-4">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="font-bold text-primary-foreground text-sm">M</span>
          </div>
          <span className="font-semibold text-lg tracking-tight">MAOS</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
          {sidebarItems.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-accent/20 text-accent-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 w-1 h-8 bg-accent rounded-r-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="pt-4 border-t border-border mt-auto">
          <button 
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm text-muted-foreground border border-border/50 cursor-pointer hover:border-border transition-colors">
              <Search className="w-4 h-4" />
              <span>Search...</span>
              <kbd className="ml-8 hidden lg:inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-4 relative">
            <button 
              className="p-2 relative text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
              )}
            </button>

            {/* Notifications Dropdown */}
            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-12 right-12 w-80 bg-background border border-border shadow-2xl rounded-xl overflow-hidden z-50"
                >
                  <div className="p-4 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-sm">Notifications</h3>
                    <span className="text-xs text-muted-foreground">{notifications.length} Unread</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        You're all caught up!
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <div key={notif.id} className="p-4 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <p className="font-medium text-sm">{notif.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
                          <p className="text-[10px] text-accent mt-2 font-medium">{notif.time}</p>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/50 flex items-center justify-center text-sm font-medium text-accent-foreground uppercase">
              {initials}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-surface p-4 md:p-8 relative">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background flex items-center justify-around p-2 pb-safe z-50 overflow-x-auto">
         {sidebarItems.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-lg text-[10px] font-medium transition-colors shrink-0 min-w-[64px]",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="truncate w-full text-center">{item.label}</span>
              </Link>
            )
          })}
      </nav>
    </div>
  );
}
