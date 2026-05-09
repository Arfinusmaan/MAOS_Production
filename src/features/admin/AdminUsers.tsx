import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter, ShieldCheck, Download, UserX, Loader2, Copy, Check, Link, UserPlus, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const signupLink = `${window.location.origin}/signup`;

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load team members.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateUser = async (id: string, updates: { role?: string; status?: string }) => {
    try {
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      toast.success('User updated successfully!');
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user.');
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(signupLink);
      setLinkCopied(true);
      toast.success('Invite link copied to clipboard!');
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      toast.error('Failed to copy link.');
    }
  };

  const exportCSV = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Role', 'Status', 'Joined'];
    const rows = filteredUsers.map(u => [
      u.first_name, u.last_name, u.email, u.role, u.status,
      new Date(u.created_at).toLocaleDateString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'maos-team.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Team list exported!');
  };

  const filteredUsers = users.filter(u =>
    u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = users.filter(u => u.status === 'pending').length;
  const activeCount = users.filter(u => u.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            {activeCount} active · {pendingCount} pending approval
          </p>
        </div>
        <Button variant="outline" className="shrink-0 gap-2" onClick={exportCSV}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Invite Panel */}
      <Card className="border border-accent/20 bg-accent/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5 text-accent" />
            Invite New Teammate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Share this signup link with your team. New members will register and wait for your approval before they can access the dashboard.
          </p>

          {/* Invite Link Box */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background text-sm text-muted-foreground font-mono overflow-hidden">
              <Link className="w-4 h-4 shrink-0 text-accent" />
              <span className="truncate">{signupLink}</span>
            </div>
            <Button
              onClick={copyInviteLink}
              className={`shrink-0 gap-2 transition-all ${linkCopied ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
            >
              {linkCopied ? (
                <><Check className="w-4 h-4" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy Link</>
              )}
            </Button>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs">
            <Mail className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              After they sign up, their account will appear below with <strong>"Pending"</strong> status.
              You must click <strong>"Approve"</strong> to grant them access and assign their role.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pending Approvals — highlighted section if any */}
      {pendingCount > 0 && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-sm shrink-0">
            {pendingCount}
          </div>
          <div>
            <p className="font-semibold text-sm text-orange-600 dark:text-orange-400">
              {pendingCount} teammate{pendingCount > 1 ? 's' : ''} waiting for approval
            </p>
            <p className="text-xs text-muted-foreground">Scroll down to approve or reject their access.</p>
          </div>
        </div>
      )}

      {/* Users Table */}
      <Card className="border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2 shrink-0">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
        </div>

        <div className="overflow-x-auto min-h-[200px]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <UserPlus className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No team members yet.</p>
              <p className="text-xs mt-1">Share the invite link above to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-xl">Member</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium rounded-tr-xl">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${user.status === 'pending' ? 'bg-orange-500/3' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          user.status === 'active' ? 'bg-accent/20 text-accent' :
                          user.status === 'pending' ? 'bg-orange-500/20 text-orange-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {user.first_name?.[0]?.toUpperCase() || '?'}{user.last_name?.[0]?.toUpperCase() || ''}
                        </div>
                        <div>
                          <div className="font-medium">{user.first_name} {user.last_name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) => updateUser(user.id, { role: e.target.value })}
                        className="bg-transparent border border-border rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-accent"
                      >
                        <option value="admin">Admin</option>
                        <option value="full_cycle_closer">Full Cycle Closer</option>
                        <option value="setter">Setter</option>
                        <option value="closer">Closer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                        user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                        user.status === 'pending' ? 'bg-orange-500/10 text-orange-500' :
                        'bg-red-500/10 text-red-500'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {user.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateUser(user.id, { status: 'active' })}
                            className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border-0"
                          >
                            <ShieldCheck className="w-3 h-3" /> Approve
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => updateUser(user.id, { status: 'disabled' })}
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          >
                            <UserX className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' })}
                          className={`h-7 text-xs ${user.status === 'active' ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10'}`}
                        >
                          {user.status === 'active' ? 'Disable Access' : 'Enable Access'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
