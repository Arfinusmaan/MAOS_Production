import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/ui/EmptyState';
import { Search, Plus, Users, Filter, Loader2, X, PowerOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

export default function Clients() {
  const { user, profile } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [newClient, setNewClient] = useState({
    company_name: '',
    email: '',
    stage: 'Cold Lead',
    plan_type: 'custom',
    mrr: '',
    setup_fee: '',
    assigned_teammate_id: '',
    setup_commission: '',
    mrr_commission_percent: '',
    bonus_commission: ''
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const isAdmin = profile?.role === 'admin';

      let query = supabase
        .from('clients')
        .select('*, users!clients_assigned_closer_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.or(`assigned_setter_id.eq.${user?.id},assigned_closer_id.eq.${user?.id}`);
      }

      const { data: clientsData, error: clientsError } = await query;
      if (clientsError) throw clientsError;
      if (clientsData) setClients(clientsData);

      if (isAdmin) {
        const { data: teamData } = await supabase
          .from('users')
          .select('id, first_name, last_name, role')
          .neq('role', 'admin')
          .eq('status', 'active');
        if (teamData) setTeammates(teamData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile) fetchData();
  }, [user, profile]);

  const handlePlanChange = (plan: string) => {
    if (plan === 'minimum') {
      setNewClient({ ...newClient, plan_type: plan, setup_fee: '1200', mrr: '997' });
    } else if (plan === 'premium') {
      setNewClient({ ...newClient, plan_type: plan, setup_fee: '3000', mrr: '997' }); // $3000 upfront
    } else {
      setNewClient({ ...newClient, plan_type: plan, setup_fee: '', mrr: '' });
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const assignedId = newClient.assigned_teammate_id || user?.id;

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .insert({
          company_name: newClient.company_name,
          email: newClient.email,
          stage: newClient.stage,
          plan_type: newClient.plan_type,
          mrr: Number(newClient.mrr) || 0,
          setup_fee: Number(newClient.setup_fee) || 0,
          is_active: newClient.stage !== 'Inactive',
          assigned_closer_id: assignedId
        })
        .select()
        .single();

      if (clientError) throw clientError;

      // Only generate commissions if assigned to a teammate (not admin himself)
      if (newClient.assigned_teammate_id && newClient.assigned_teammate_id !== '') {
        const commissionsToInsert = [];

        // 1. Setup / One-Time Commission
        const setupComm = Number(newClient.setup_commission);
        if (setupComm > 0) {
          commissionsToInsert.push({
            client_id: clientData.id,
            user_id: newClient.assigned_teammate_id,
            amount: setupComm,
            type: 'setup',
            status: 'pending',
            is_recurring: false,
            split_percentage: 100 // Flat amount passed
          });
        }

        // 2. Bonus Commission
        const bonusComm = Number(newClient.bonus_commission);
        if (bonusComm > 0) {
          commissionsToInsert.push({
            client_id: clientData.id,
            user_id: newClient.assigned_teammate_id,
            amount: bonusComm,
            type: 'setter_bonus',
            status: 'pending',
            is_recurring: false,
            split_percentage: 100
          });
        }

        // 3. MRR Recurring Commission
        const mrrPercent = Number(newClient.mrr_commission_percent);
        const mrrAmount = Number(newClient.mrr) || 0;
        if (mrrPercent > 0 && mrrAmount > 0) {
          commissionsToInsert.push({
            client_id: clientData.id,
            user_id: newClient.assigned_teammate_id,
            amount: mrrAmount * (mrrPercent / 100),
            type: 'mrr',
            status: 'pending',
            is_recurring: true,
            split_percentage: mrrPercent
          });
        }

        if (commissionsToInsert.length > 0) {
          await supabase.from('commissions').insert(commissionsToInsert);
        }
      }
      
      setIsAdding(false);
      setNewClient({ company_name: '', email: '', stage: 'Cold Lead', plan_type: 'custom', mrr: '', setup_fee: '', assigned_teammate_id: '', setup_commission: '', mrr_commission_percent: '', bonus_commission: '' });
      fetchData();
      
      await supabase.from('activities').insert({
        user_id: user?.id,
        action: `added a new client: ${clientData.company_name}`
      });
      
      toast.success('Client added successfully!');

    } catch (error: any) {
      console.error('Error adding client:', error);
      toast.error('Failed to add client.');
    }
  };

  const toggleClientStatus = async (id: string, currentStage: string, isActive: boolean) => {
    try {
      const newStage = isActive ? 'Inactive' : 'Cold Lead';
      const newActiveState = !isActive;

      const { error } = await supabase
        .from('clients')
        .update({ stage: newStage, is_active: newActiveState })
        .eq('id', id);

      if (error) throw error;

      setClients(clients.map(c => 
        c.id === id ? { ...c, stage: newStage, is_active: newActiveState } : c
      ));
      
      toast.success(`Client status updated to ${newStage}`);

    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update client status.');
    }
  };

  const filteredClients = clients.filter(c => 
    c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your leads, pipeline, and active clients.</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="shrink-0 gap-2">
          <Plus className="w-4 h-4" />
          Add Client
        </Button>
      </div>

      {isAdding && (
        <Card className="p-6 border-accent/20 bg-accent/5 relative animate-in fade-in slide-in-from-top-4">
          <button 
            onClick={() => setIsAdding(false)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-semibold text-lg mb-4">Add New Client</h3>
          <form onSubmit={handleAddClient} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name</label>
                <Input 
                  required 
                  value={newClient.company_name}
                  onChange={e => setNewClient({...newClient, company_name: e.target.value})}
                  placeholder="Acme Corp" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Stage</label>
                <select 
                  className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={newClient.stage}
                  onChange={e => setNewClient({...newClient, stage: e.target.value})}
                >
                  <option>Cold Lead</option>
                  <option>Interested</option>
                  <option>Meeting Booked</option>
                  <option>Follow-Up</option>
                  <option>Closed</option>
                  <option>Inactive</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-accent">Pricing Plan</label>
                <select 
                  className="w-full h-10 px-3 py-2 rounded-md border border-accent/50 bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={newClient.plan_type}
                  onChange={e => handlePlanChange(e.target.value)}
                >
                  <option value="custom">Custom Deal (Manual Entry)</option>
                  <option value="minimum">Minimum Plan ($1200 Setup + $997/mo)</option>
                  <option value="premium">Premium Plan ($3000 Upfront + $997/mo)</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <Input 
                  type="email" 
                  value={newClient.email}
                  onChange={e => setNewClient({...newClient, email: e.target.value})}
                  placeholder="contact@acme.com" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Upfront / Setup Fee ($)</label>
                <Input 
                  type="number" 
                  value={newClient.setup_fee}
                  onChange={e => setNewClient({...newClient, setup_fee: e.target.value})}
                  placeholder="0" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Monthly Recurring Revenue ($)</label>
                <Input 
                  type="number" 
                  value={newClient.mrr}
                  onChange={e => setNewClient({...newClient, mrr: e.target.value})}
                  placeholder="0" 
                />
              </div>
              
              {isAdmin && (
                <>
                  <div className="space-y-2 border-t border-border pt-4 md:col-span-2">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Manual Commission Settings</h4>
                    <p className="text-xs text-muted-foreground">Assign exact amounts. Leave blank if none.</p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-emerald-500">Assign To Teammate</label>
                    <select 
                      className="w-full h-10 px-3 py-2 rounded-md border border-emerald-500/50 bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      value={newClient.assigned_teammate_id}
                      onChange={e => setNewClient({...newClient, assigned_teammate_id: e.target.value})}
                    >
                      <option value="">None (I closed this myself - 100% Agency Revenue)</option>
                      {teammates.map(t => (
                        <option key={t.id} value={t.id}>{t.first_name} {t.last_name} ({t.role})</option>
                      ))}
                    </select>
                  </div>
                  
                  {newClient.assigned_teammate_id && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">One-Time Setup Commission ($)</label>
                        <Input 
                          type="number" 
                          value={newClient.setup_commission}
                          onChange={e => setNewClient({...newClient, setup_commission: e.target.value})}
                          placeholder="e.g. 240 for 20% of 1200" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Monthly Recurring Commission (%)</label>
                        <Input 
                          type="number" 
                          value={newClient.mrr_commission_percent}
                          onChange={e => setNewClient({...newClient, mrr_commission_percent: e.target.value})}
                          placeholder="e.g. 20" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Flat Bonus ($) (e.g. Setter Bonus)</label>
                        <Input 
                          type="number" 
                          value={newClient.bonus_commission}
                          onChange={e => setNewClient({...newClient, bonus_commission: e.target.value})}
                          placeholder="e.g. 25" 
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" className="w-full sm:w-auto">Save Client & Calculate Payouts</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-4 border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search clients..." 
              className="pl-9 bg-background/50 border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : filteredClients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients found"
            description="Get started by adding your first client or lead to the pipeline."
            actionLabel="Add Client"
            onAction={() => setIsAdding(true)}
          />
        ) : (
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-xl">Client Name</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">MRR / Setup</th>}
                  {isAdmin && <th className="px-4 py-3 font-medium">Assigned To</th>}
                  <th className="px-4 py-3 font-medium">Added</th>
                  {isAdmin && <th className="px-4 py-3 font-medium rounded-tr-xl">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(client => (
                  <tr key={client.id} className={`border-b border-border last:border-0 hover:bg-muted/30 ${!client.is_active ? 'opacity-50 grayscale' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{client.company_name}</div>
                      <div className="text-xs text-muted-foreground">{client.plan_type === 'minimum' ? 'Minimum Plan' : client.plan_type === 'premium' ? 'Premium Plan' : 'Custom Deal'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        client.stage === 'Closed' ? 'bg-emerald-500/10 text-emerald-500' :
                        client.stage === 'Inactive' ? 'bg-destructive/10 text-destructive' :
                        client.stage === 'Cold Lead' ? 'bg-muted text-muted-foreground' :
                        'bg-accent/10 text-accent'
                      }`}>
                        {client.stage}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 font-medium">
                        ${client.mrr ? Number(client.mrr).toLocaleString() : '0'} /mo
                        {client.setup_fee > 0 && <span className="block text-[10px] text-muted-foreground font-normal">${client.setup_fee} Setup</span>}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {client.users ? `${client.users.first_name} ${client.users.last_name}` : 'Myself'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => toggleClientStatus(client.id, client.stage, client.is_active)}
                          className={`h-8 px-2 gap-2 text-xs ${client.is_active ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500'}`}
                        >
                          <PowerOff className="w-3 h-3" />
                          {client.is_active ? 'Cancel Client' : 'Reactivate'}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
