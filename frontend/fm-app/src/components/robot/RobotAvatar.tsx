import React from "react";

export default function RobotAvatar() {
  return (
    <div className="avatar-bot avatar-breathe avatar-blink" data-testid="avatar-bot" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: 340, height: 540, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: 999, background: "radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(120,190,255,0.12) 50%, rgba(0,0,0,0) 78%)", filter: "blur(74px)" }} />
        <svg width="300" height="500" viewBox="0 0 300 500" role="img" aria-label="Humanoider Roboter">
          <defs>
            <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#dde4ec" />
            </linearGradient>
            <linearGradient id="joint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b9c3d0" />
              <stop offset="100%" stopColor="#8e9aa8" />
            </linearGradient>
          </defs>

          {/* head */}
          <rect x="104" y="12" width="92" height="84" rx="20" fill="url(#shell)" stroke="rgba(0,0,0,0.15)" />
          <rect x="96" y="39" width="8" height="26" rx="4" fill="url(#joint)" />
          <rect x="196" y="39" width="8" height="26" rx="4" fill="url(#joint)" />
          <circle cx="134" cy="50" r="5.5" fill="#0f1720" />
          <circle cx="166" cy="50" r="5.5" fill="#0f1720" />
          <rect x="135" y="72" width="30" height="5.5" rx="2.75" fill="rgba(30,40,52,0.35)" />

          {/* neck */}
          <rect x="133" y="102" width="34" height="16" rx="7" fill="url(#joint)" stroke="rgba(0,0,0,0.12)" />

          {/* torso */}
          <path d="M93 129 C104 116, 124 112, 150 112 C176 112, 196 116, 207 129 C215 138, 218 156, 218 182 C218 224, 214 258, 205 268 C196 278, 104 278, 95 268 C86 258, 82 224, 82 182 C82 156, 85 138, 93 129 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
          <circle cx="150" cy="154" r="12" fill="rgba(80,190,255,0.45)" />
          <rect x="120" y="184" width="60" height="66" rx="16" fill="#e7edf4" stroke="rgba(0,0,0,0.1)" />

          {/* left arm with shoulder/elbow/wrist articulation */}
          <path d="M78 145 C68 156, 67 176, 72 196 C75 209, 75 220, 71 233 C66 251, 68 274, 78 288 C82 293, 89 294, 94 289 C98 285, 99 278, 95 272 C87 258, 85 247, 89 232 C93 215, 92 200, 87 186 C84 177, 84 166, 90 156 C94 149, 93 141, 87 138 C84 136, 80 139, 78 145 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
          <circle cx="84" cy="212" r="5.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
          <ellipse cx="91" cy="292" rx="6.5" ry="5.5" fill="#dbe3ec" stroke="rgba(0,0,0,0.12)" />

          {/* right arm with shoulder/elbow/wrist articulation */}
          <path d="M222 145 C232 156, 233 176, 228 196 C225 209, 225 220, 229 233 C234 251, 232 274, 222 288 C218 293, 211 294, 206 289 C202 285, 201 278, 205 272 C213 258, 215 247, 211 232 C207 215, 208 200, 213 186 C216 177, 216 166, 210 156 C206 149, 207 141, 213 138 C216 136, 220 139, 222 145 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
          <circle cx="216" cy="212" r="5.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
          <ellipse cx="209" cy="292" rx="6.5" ry="5.5" fill="#dbe3ec" stroke="rgba(0,0,0,0.12)" />

          {/* hip */}
          <rect x="106" y="276" width="88" height="30" rx="14" fill="#e7edf4" stroke="rgba(0,0,0,0.1)" />

          {/* legs with knee and calf shape */}
          <path d="M115 309 C109 318, 108 338, 112 356 C116 373, 118 391, 114 408 C112 417, 117 425, 126 426 C135 427, 142 421, 142 412 C141 395, 139 379, 136 361 C133 344, 134 327, 138 314 C141 305, 137 299, 128 299 C123 299, 118 302, 115 309 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
          <circle cx="126" cy="362" r="6.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
          <path d="M185 309 C191 318, 192 338, 188 356 C184 373, 182 391, 186 408 C188 417, 183 425, 174 426 C165 427, 158 421, 158 412 C159 395, 161 379, 164 361 C167 344, 166 327, 162 314 C159 305, 163 299, 172 299 C177 299, 182 302, 185 309 Z" fill="url(#shell)" stroke="rgba(0,0,0,0.12)" />
          <circle cx="174" cy="362" r="6.5" fill="#ccd6e2" stroke="rgba(0,0,0,0.12)" />
          <ellipse cx="128" cy="423" rx="24" ry="7" fill="#d6e0ea" stroke="rgba(0,0,0,0.12)" />
          <ellipse cx="172" cy="423" rx="24" ry="7" fill="#d6e0ea" stroke="rgba(0,0,0,0.12)" />
        </svg>
      </div>
    </div>
  );
}
