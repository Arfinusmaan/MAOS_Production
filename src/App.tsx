import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { Toaster } from 'sonner';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';
import AuthLayout from './components/layout/AuthLayout';

// Auth Pages
import Login from './features/auth/Login';
import Signup from './features/auth/Signup';
import PendingApproval from './features/auth/PendingApproval';

import Dashboard from './features/dashboard/Dashboard';
import Clients from './features/crm/Clients';

import ClientDetail from './features/crm/ClientDetail';
import DailyReports from './features/reports/DailyReports';
import Commissions from './features/commissions/Commissions';
import Leaderboard from './features/leaderboard/Leaderboard';
import Settings from './features/settings/Settings';
import AdminUsers from './features/admin/AdminUsers';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminCommissions from './features/admin/AdminCommissions';
import DialerHub from './features/dialer/DialerHub';

// Route Guards
const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  const { user, profile, isLoading } = useAuthStore();
  
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.status === 'pending') return <Navigate to="/pending-approval" replace />;
  if (requiredRole && profile?.role !== requiredRole && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};

const LandingRedirect = () => {
  const { profile } = useAuthStore();
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
};

import CommandPalette from './components/ui/CommandPalette';

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Toaster position="bottom-right" richColors theme="system" />
      <CommandPalette />
      <Routes>
        {/* Public Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
        </Route>

        {/* Protected Routes */}
        <Route element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/reports" element={<DailyReports />} />
          <Route path="/commissions" element={<Commissions />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/dialer" element={<DialerHub />} />
          <Route path="/settings" element={<Settings />} />
          
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/commissions" element={
            <ProtectedRoute requiredRole="admin">
              <AdminCommissions />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRole="admin">
              <AdminUsers />
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
