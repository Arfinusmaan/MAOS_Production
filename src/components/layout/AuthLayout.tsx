import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-primary-foreground">MAOS</h1>
          <p className="text-muted-foreground mt-2">More Appointments Operating System</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
