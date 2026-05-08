import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutDashboard, Users, Settings, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <AnimatePresence>
      {open && (
        <Command.Dialog 
          open={open} 
          onOpenChange={setOpen}
          className="fixed inset-0 z-50 flex justify-center items-start pt-[15vh] bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="w-full max-w-xl mx-4"
          >
            <div className="bg-popover text-popover-foreground rounded-2xl shadow-2xl border border-border overflow-hidden">
              <div className="flex items-center border-b border-border px-4 py-3">
                <Search className="w-5 h-5 text-muted-foreground mr-3" />
                <Command.Input 
                  placeholder="Type a command or search..." 
                  className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-muted-foreground"
                />
              </div>
              
              <Command.List className="max-h-[300px] overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>

                <Command.Group heading="Pages" className="text-xs font-medium text-muted-foreground px-2 py-1.5 [&_[cmdk-group-items]]:mt-2">
                  <Command.Item 
                    onSelect={() => runCommand(() => navigate('/dashboard'))}
                    className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-foreground cursor-pointer data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent"
                  >
                    <LayoutDashboard className="mr-3 w-4 h-4" />
                    Dashboard
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => navigate('/clients'))}
                    className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-foreground cursor-pointer data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent"
                  >
                    <Users className="mr-3 w-4 h-4" />
                    Clients
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => navigate('/settings'))}
                    className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-foreground cursor-pointer data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent"
                  >
                    <Settings className="mr-3 w-4 h-4" />
                    Settings
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Actions" className="text-xs font-medium text-muted-foreground px-2 py-1.5 mt-2 [&_[cmdk-group-items]]:mt-2">
                  <Command.Item 
                    onSelect={() => runCommand(() => console.log('Add Client'))}
                    className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-foreground cursor-pointer data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent"
                  >
                    <UserPlus className="mr-3 w-4 h-4" />
                    Add new client
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </div>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}
