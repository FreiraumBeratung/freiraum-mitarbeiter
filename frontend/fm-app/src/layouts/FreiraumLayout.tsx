import React from "react";

type Props = {
  robot: React.ReactNode;
  composer: React.ReactNode;
};

export default function FreiraumLayout({ robot, composer }: Props) {
  return (
    <div className="h-full w-full bg-black text-white flex flex-col">
      
      {/* MAIN CONTENT */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT SIDE – ROBOT */}
        <div className="w-[40%] flex items-center justify-center border-r border-white/10">
          {robot}
        </div>

        {/* RIGHT SIDE */}
        <div className="w-[60%] flex flex-col">

          {/* TOP – INBOX PLACEHOLDER */}
          <div className="h-[40%] border-b border-white/10 flex items-center justify-center text-white/40 text-sm">
            Inbox (Exchange coming soon)
          </div>

          {/* BOTTOM – COMPOSER */}
          <div className="flex-1 flex items-center justify-center">
            {composer}
          </div>

        </div>
      </div>

      {/* BOTTOM – PUSH TO TALK SLOT */}
      <div className="h-[90px] border-t border-white/10 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
          🎤
        </div>
      </div>

    </div>
  );
}
