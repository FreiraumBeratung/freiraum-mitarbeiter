import { useEffect, useState } from "react";

export function TransitionOverlay({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[999] pointer-events-none flex items-center justify-center">
      <div className="backdrop-blur-lg bg-black/40 px-6 py-3 rounded-2xl text-orange-400 text-xl opacity-100 animate-fadeOut">
        {message}
      </div>
    </div>
  );
}

