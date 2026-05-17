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
            className="h-20 object-contain mb-4 select-none transition-all hover:scale-105 duration-300" 
          />
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase select-none">
            MAOS <span className="text-primary italic">Elite</span>
          </h1>
          <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] mt-2">More Appointments Operating System</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
