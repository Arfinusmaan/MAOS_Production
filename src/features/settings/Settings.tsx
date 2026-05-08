import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function Settings() {
  const { user, profile, fetchProfile } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: ''
  });
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || ''
      });
    }

    // Load preferences
    setIsDarkMode(document.documentElement.classList.contains('dark'));
    const notifs = localStorage.getItem('emailNotifications');
    if (notifs !== null) {
      setEmailNotifications(notifs === 'true');
    }
  }, [profile]);

  const toggleDarkMode = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const toggleEmailNotifications = () => {
    const newVal = !emailNotifications;
    setEmailNotifications(newVal);
    localStorage.setItem('emailNotifications', newVal.toString());
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name
        })
        .eq('id', user.id);

      if (error) throw error;
      
      await fetchProfile();
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error('Failed to update profile: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile, preferences, and account settings.</p>
      </div>

      <Card className="border border-border">
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name</label>
              <Input 
                value={formData.first_name} 
                onChange={e => setFormData({...formData, first_name: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name</label>
              <Input 
                value={formData.last_name} 
                onChange={e => setFormData({...formData, last_name: e.target.value})} 
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <Input type="email" value={user?.email || ''} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">To change your email, contact an administrator.</p>
          </div>
          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Toggle the dark mode theme for the dashboard.</p>
            </div>
            <div 
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${isDarkMode ? 'bg-accent' : 'bg-muted border border-border'}`}
              onClick={toggleDarkMode}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${isDarkMode ? 'left-7' : 'left-1 bg-muted-foreground'}`}></div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="font-medium">In-App Notifications</p>
              <p className="text-sm text-muted-foreground">Receive updates about commissions and client assignments.</p>
            </div>
            <div 
              className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${emailNotifications ? 'bg-accent' : 'bg-muted border border-border'}`}
              onClick={toggleEmailNotifications}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${emailNotifications ? 'left-7' : 'left-1 bg-muted-foreground'}`}></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
