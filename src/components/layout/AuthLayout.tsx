import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center flex flex-col items-center">
          {/* Stunning Custom Brand Logo */}
          <img 
            src="/More_Appts_WO_BG.png" 
            alt="MAOS Logo" 
            className="h-12 object-contain mb-4 select-none" 
          />
          <h1 className="text-xl font-bold tracking-tight text-foreground uppercase select-none">
            MAOS <span className="text-primary italic">Elite</span>
          </h1>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
