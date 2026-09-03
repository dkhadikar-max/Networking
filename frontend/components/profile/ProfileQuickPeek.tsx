'use client';

import { User } from '@/lib/types';
import {
  IconVerified,
  IconLocation,
  IconBuilding,
  IconLookingFor,
  IconChat,
  IconArrowRight,
} from '@/components/ui/BynIcons';

type Props = {
  user: User;
  onViewFull: () => void;
};

export default function ProfileQuickPeek({ user, onViewFull }: Props) {
  // No fabricated fallbacks — an incomplete real profile must never render
  // as a fake person. Missing fields hide their row instead (see 2026-08-29
  // Profile↔Discovery IA audit).
  const name = user.name || 'Someone';
  const headline = user.headline;
  const location = user.location;
  const working_on = user.working_on;
  const currently_exploring = user.currently_exploring;
  const bio = user.bio;
  const interests = user.interests ?? [];
  // Peek only ever shows a candidate's profile, never the viewer's own —
  // so this is always the neutral "nothing here yet" read, not a self nudge.
  const hasNoContent = !working_on && !currently_exploring && !bio && interests.length === 0;

  return (
    <div className="flex flex-col h-full bg-white text-left overflow-hidden">
      {/* -- 1. SCROLLABLE CONTEXT BODY -- */}
      <div className="flex-1 overflow-y-auto px-6 pt-1 pb-4 space-y-4 no-scrollbar">
        {/* Identity Header */}
        <div className="flex flex-col gap-1 shrink-0 pb-1 border-b border-slate-100">
          <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-1.5 leading-tight">
            <span>{name}</span>
            {user.verified && (
              <IconVerified size={18} className="text-[#157A6E] shrink-0" />
            )}
          </h2>
          {headline && <p className="text-sm font-medium text-slate-600 mt-0.5">{headline}</p>}
          {location && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 font-medium">
              <IconLocation size={14} className="text-slate-400 shrink-0" />
              <span>{location}</span>
            </p>
          )}
        </div>

        {/* Nothing narrative to show — quiet, neutral line, not a card. Only
            renders when every content field is genuinely absent; a profile
            with even one of these still gets its normal rows below. */}
        {hasNoContent && (
          <p className="text-sm text-slate-400 text-center py-6">
            Nothing more to show here yet.
          </p>
        )}

        {/* Building Row */}
        {working_on && (
          <div className="flex items-start gap-3.5 pt-1">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#E65100] flex items-center justify-center shrink-0 shadow-2xs">
              <IconBuilding size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[11px] uppercase tracking-wider text-[#157A6E]">BUILDING</h3>
              <p className="text-sm text-slate-700 leading-snug mt-0.5">{working_on}</p>
            </div>
          </div>
        )}

        {/* Looking For Row */}
        {currently_exploring && (
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#E65100] flex items-center justify-center shrink-0 shadow-2xs">
              <IconLookingFor size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[11px] uppercase tracking-wider text-[#157A6E]">LOOKING FOR</h3>
              <p className="text-sm text-slate-700 leading-snug mt-0.5">{currently_exploring}</p>
            </div>
          </div>
        )}

        {/* Why Connect Row */}
        {bio && (
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#E65100] flex items-center justify-center shrink-0 shadow-2xs">
              <IconChat size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[11px] uppercase tracking-wider text-[#157A6E]">WHY CONNECT</h3>
              <p className="text-sm text-slate-700 leading-snug mt-0.5">{bio}</p>
            </div>
          </div>
        )}

        {/* Top Interests Section */}
        {interests.length > 0 && (
          <div className="pt-2 pb-6">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-slate-500 mb-2">TOP INTERESTS</h3>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span
                  key={interest}
                  className="px-3 py-1.5 rounded-xl bg-[#FFF8F5] border border-[#FFE8DE] text-slate-800 text-xs font-semibold"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* -- 2. STICKY / FIXED PRIMARY ACTION -- */}
      <div className="px-6 py-4 border-t border-slate-100 bg-white/95 backdrop-blur-md shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <button 
          onClick={onViewFull}
          className="w-full bg-[#157A6E] hover:bg-[#0D6E63] active:scale-[0.97] text-white font-semibold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <span>View Full Profile</span>
          <IconArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
