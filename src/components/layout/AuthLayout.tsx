import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center flex flex-col items-center">
          {/* Stunning Brand Icon Badge */}
          <div className="w-14 h-14 rounded-[20px] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20 mb-4 transition-all hover:scale-105 duration-300">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.27c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.27 1.11z" />
            </svg>
          </div>
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
