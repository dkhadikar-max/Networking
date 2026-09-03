// Desktop-only (≥1024px, via CSS — see .discover-context-panel in app.css)
// companion to the Discover card. Surfaces data already present in the same
// `DiscoverProfile` the card renders — no new fields, no new API calls, no
// content that isn't already on the card somewhere.
//
// This answers "why should I connect?", not "here's the same profile
// again" — "Why this person" leads and is visually the centerpiece;
// everything else is quieter reference detail, not a second card. The
// discovery card stays the primary interaction throughout.
import type { DiscoverProfile } from '@/lib/types';
import { IconConnect, IconArrowRight } from '@/components/ui/BynIcons';

type Props = { profile: DiscoverProfile; onInspect?: () => void };

export default function ContextPanel({ profile, onInspect }: Props) {
  const user = profile.user ?? profile;
  const matchReasons: string[] = profile.matchReasons ?? (profile.insight ? [profile.insight] : []);
  const working_on = (user as { working_on?: string }).working_on ?? '';
  const currently_exploring = (user as { currently_exploring?: string }).currently_exploring ?? '';
  const skills: string[] = (user as { skills?: string[] }).skills ?? [];
  const interests: string[] = (user as { interests?: string[] }).interests ?? [];

  const hasAnything = matchReasons.length > 0 || working_on || currently_exploring || skills.length > 0 || interests.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="discover-context-panel">
      {matchReasons.length > 0 && (
        <div className="ctx-panel-headline">
          <div className="ctx-panel-headline-label">Why this person</div>
          {matchReasons.map((r, i) => (
            <div key={i} className="ctx-panel-reason">
              <IconConnect size={14} strokeWidth={2.5} />
              {r}
            </div>
          ))}
        </div>
      )}

      {currently_exploring && (
        <div className="ctx-panel-row">
          <div className="ctx-panel-section-label">Looking for</div>
          <p className="ctx-panel-text">{currently_exploring}</p>
        </div>
      )}

      {working_on && (
        <div className="ctx-panel-row">
          <div className="ctx-panel-section-label">Building</div>
          <p className="ctx-panel-text">{working_on}</p>
        </div>
      )}

      {skills.length > 0 && (
        <div className="ctx-panel-row">
          <div className="ctx-panel-section-label">Skills</div>
          <div className="chips-row" style={{ marginBottom: 0 }}>
            {skills.map(s => <span key={s} className="chip chip-gold">{s}</span>)}
          </div>
        </div>
      )}

      {interests.length > 0 && (
        <div className="ctx-panel-row">
          <div className="ctx-panel-section-label">Interests</div>
          <div className="chips-row" style={{ marginBottom: 0 }}>
            {interests.map(t => <span key={t} className="chip">{t}</span>)}
          </div>
        </div>
      )}

      {/* Deeper evaluation lives one step further than this panel already
          goes — trust score, reviews, mutual connections aren't in the
          Discover API response at all, only /api/profiles/:id has them. */}
      {onInspect && (
        <button type="button" className="ctx-panel-inspect-link" onClick={onInspect}>
          View full profile
          <IconArrowRight size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
