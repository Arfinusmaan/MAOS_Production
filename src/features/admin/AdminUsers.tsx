import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter, ShieldCheck, Download, MoreHorizontal, UserX, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      
      // Optimistically update UI
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      toast.success('User updated successfully!');
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user.');
    }
  };

  const filteredUsers = users.filter(u => 
    u.first_name?.toLowerCase().includes(search.toLowerCase()) || 
    u.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground mt-1">Approve new users and assign strict roles.</p>
        </div>
        <Button variant="outline" className="shrink-0 gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <Card className="border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search users by name or email..." 
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

        <div className="overflow-x-auto min-h-[300px]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-xl">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium rounded-tr-xl">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{user.first_name} {user.last_name}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={user.role}
                        onChange={(e) => updateUser(user.id, { role: e.target.value })}
                        className="bg-transparent border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
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
                    <td className="px-4 py-3 text-muted-foreground">
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
                          className={`h-7 text-xs ${user.status === 'active' ? 'text-destructive hover:text-destructive' : 'text-emerald-500 hover:text-emerald-600'}`}
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
