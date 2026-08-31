import type { Message, User } from './types';

// ── Contextual ongoing-conversation reply suggestions ───────────────────────
//
// Companion to getIcebreakers() in server.js, which personalizes the OPENING
// message from static profile fields. This covers the gap once a real
// conversation exists: ChatWindow's "quick prompt tray" used to fall back to
// the same 4 hardcoded, profile-blind templates the instant messages.length
// > 0, regardless of who you're talking to or what was just said. This looks
// at what was actually said (bounded to the last few messages) and tries to
// extract a genuine topic to react to — the tray should read like a reply to
// THIS conversation, not another icebreaker carousel.
//
// Pure function of its arguments — no Date.now(), no Math.random() in the
// decision logic, so the same (messages, me, other) always produces the same
// suggestion set (matches the design value getIcebreakers already states for
// itself). No network calls, no LLM, no external dependency: free by
// construction, and cheap enough to recompute on every poll tick — bounded
// message lookback (slice(-8)), never a full-thread scan.
//
// truncField below is an independent copy of server.js's truncField, not an
// import — there's no shared lib directory between the Express backend and
// the Next.js frontend; frontend/lib/intent.ts already duplicates
// formatIntent from server.js the same way, which is the established
// convention here, not a new one.

type Chip = { label: string; text: string };

// Not a linguistic stopword list — these pass the length>3 filter used for
// topic extraction but are too vague to ever be a useful "topic" on their
// own (e.g. a message ending "...for a while now" shouldn't produce a chip
// about "while").
const BORING_WORDS = new Set([
  'thing', 'things', 'stuff', 'really', 'people', 'about', 'because',
  'would', 'could', 'should', 'there', 'their', 'which', 'where', 'when',
  'week', 'weeks', 'time', 'lately', 'right', 'sorry', 'thanks', 'thank',
  'hello', 'hope', 'good', 'great', 'nice', 'cool', 'yeah', 'okay', 'much',
  // Short function/deictic words that are length>3 (so survive the length
  // filter) but are never a usable "topic" on their own — found via the
  // pure-function sanity pass, e.g. "that thing about time and stuff
  // really" was extracting "that" as the topic before this list grew.
  'that', 'this', 'with', 'have', 'your', 'from', 'just', 'been', 'were',
  'what', 'here', 'some', 'more', 'than', 'then', 'them', 'they', 'will',
  'very', 'also', 'into', 'over', 'when', 'been',
  // BYN-platform words — generic app vocabulary ("we matched", "looking
  // for") that show up in almost every message by coincidence, not a real
  // conversational topic.
  'match', 'matches', 'matched', 'looking',
]);

const URL_RE = /https?:\/\/[^\s]+/i;
const LINK_KEYWORD_RE = /\b(repo|repository|github|deck|doc|docs|demo|site|prototype|link)\b/i;

// Word-boundary cut + ellipsis — same shape as server.js's truncField
// (server.js:3620). Every interpolated snippet must be bounded this way or
// one pathological unbroken message blows out chip layout.
function truncField(s: string, max: number): string {
  const t = (s || '').trim();
  if (t.length <= max) return t;
  let sliced = t.slice(0, max);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > max * 0.6) sliced = sliced.slice(0, lastSpace);
  return sliced.replace(/[\s,.;:!?—–-]+$/, '') + '…';
}

function normalizeStr(s?: string | null): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !BORING_WORDS.has(w));
}

// Whole-value substring match, not token overlap — skill/interest values are
// frequently multi-word ("AI agents", "Growth Marketing"), so this checks
// whether the literal tag appears in the message rather than tokenizing the
// tag itself and losing the phrase boundary.
function findVocabularyMatch(message: string, values: (string | undefined)[]): string | null {
  const lower = message.toLowerCase();
  for (const v of values) {
    const nv = normalizeStr(v);
    if (nv && nv.length > 2 && lower.includes(nv)) return (v as string).trim();
  }
  return null;
}

// Prose-shaped fields (working_on/currently_exploring) are full sentences —
// requiring the WHOLE value as a verbatim substring (findVocabularyMatch's
// approach, correct for short tag fields) would almost never fire; nobody
// types back an entire profile sentence. Tokenize both sides instead and
// return the first shared content word — what actually shows up in casual
// conversation ("onboarding" from "a B2B SaaS onboarding tool").
function findTokenOverlap(message: string, prose?: string): string | null {
  if (!prose) return null;
  const messageTokens = new Set(tokenize(message));
  for (const t of tokenize(prose)) {
    if (messageTokens.has(t)) return t;
  }
  return null;
}

// Deterministic "pick one of N phrasings" keyed off message content, so
// repeated topic-question chips don't all read as robotically identical —
// but the choice is still fully reproducible (no Math.random).
function pickShape<T>(seed: string, shapes: T[]): T {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return shapes[sum % shapes.length];
}

const TOPIC_QUESTION_SHAPES: ((topic: string) => string)[] = [
  topic => `What's been the hardest part about ${topic}?`,
  topic => `How did you land on ${topic}?`,
  topic => `What's next for ${topic}?`,
];

// Fallback extraction when no profile-vocabulary term appears in the
// message: take the last qualifying content word. Short causal statements
// tend to place the informationally heaviest term clause-finally ("...the
// biggest problem was activation") — a crude but cheap, deterministic
// heuristic that needs no NLP library.
function extractTopic(message: string): string | null {
  const tokens = tokenize(message);
  return tokens.length ? tokens[tokens.length - 1] : null;
}

// Builds at most one contextual chip from a single message. Priority order
// (per product review): a real topic/vocabulary signal always wins over a
// generic message-shape reaction — a question or a link should still name
// what it's actually about when that's extractable, not fall back to
// boilerplate just because it happens to end in "?" or contain a URL.
function buildContextualChip(message: string, me: User, other: User): Chip | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  // 1. Vocabulary match against MY OWN skills/interests — the strongest
  // possible hook ("you just mentioned something I do too"), mirrors the
  // mutual-framing tone of the backend's own mutual-fit icebreaker chip.
  const myVocab = [...(me.skills || []), ...(me.interests || [])];
  const mineMatch = findVocabularyMatch(trimmed, myVocab);
  if (mineMatch) {
    const term = truncField(mineMatch, 40);
    return { label: '💡 Shared ground', text: `I've been exploring ${term} too — what are you building around it?` };
  }

  // 2. Link-shaped message — name what's being shared rather than a bare
  // "reacting to your link" boilerplate.
  if (URL_RE.test(trimmed)) {
    const kw = trimmed.match(LINK_KEYWORD_RE);
    const what = kw ? kw[1].toLowerCase() : 'this';
    return { label: '🔗 Their link', text: `Want to walk me through the ${what}?` };
  }

  // 3. Topic: the message itself is the primary source (freshest, most
  // specific — e.g. "...the biggest problem was activation" should surface
  // "activation", not a broader category word). THEIR working_on/
  // currently_exploring is only consulted as a rescue when the message
  // alone yields nothing usable — checking it first was tried and reverted:
  // a message that's simply *about* their own project will often contain a
  // word from their own working_on field (e.g. "onboarding"), which is a
  // real but far less interesting match than the specific thing they just
  // said, so letting it go first was actively picking the worse topic.
  const isQuestion = trimmed.endsWith('?');
  const messageTopic = extractTopic(trimmed);
  const theirsOverlap = !messageTopic
    ? findTokenOverlap(trimmed, other.working_on) || findTokenOverlap(trimmed, other.currently_exploring)
    : null;
  const topic = messageTopic || (theirsOverlap ? truncField(theirsOverlap, 40) : null);

  // 4. Question-shaped message — still topic-first; only genuinely
  // topic-free as an absolute last resort within this branch. Distinct
  // label from the plain-statement branch below even though both can
  // interpolate a topic — "answering their question" is a different
  // conversational move than "picking a fresh thread to pull on".
  if (isQuestion) {
    return topic
      ? { label: '🙋 Answer it', text: `Happy to dig into ${topic} — where should I start?` }
      : { label: '🙋 Answer it', text: 'Good question — let me think about the best way to answer that.' };
  }

  // 5. Plain statement with an extractable topic — the dominant real-world
  // case (most messages are neither questions nor links). Label reflects
  // the actual source: their own stated plans (the rescue path) reads more
  // confidently than a generically-extracted word.
  if (topic) {
    const shape = pickShape(trimmed, TOPIC_QUESTION_SHAPES);
    const label = theirsOverlap ? '🎯 Their focus' : '🧵 Keep going';
    return { label, text: shape(topic) };
  }

  // 6. Short message with nothing extractable at all (e.g. "hey", "nice!") —
  // deliberately doesn't presuppose they've already described something,
  // since a bare greeting is the most common thing to land here.
  if (trimmed.length < 20) {
    return { label: '👋 Say hi back', text: "Good to hear from you — what have you been up to?" };
  }

  return null;
}

// personalizedFallback: connection.icebreakers (the existing opening-message
// system, reused here as a mid-tier fallback). genericFallback: the fully
// generic static templates (ChatWindow's ICEBREAKER_TEMPLATES), passed in
// rather than imported so this module has zero dependency on ChatWindow and
// can be exercised/tested standalone.
export function getReplySuggestions(
  messages: Message[],
  me: User,
  other: User,
  personalizedFallback: Chip[],
  genericFallback: Chip[],
): Chip[] {
  const chips: Chip[] = [];
  const sentTexts = new Set(messages.map(m => normalizeStr(m.text)));
  const alreadyHas = (text: string) => sentTexts.has(normalizeStr(text)) || chips.some(c => c.text === text);

  // Bounded backward scan — never a full-thread scan regardless of history
  // length — for the most recent message actually from the other party. If
  // I've sent the last several messages with no reply yet, there's nothing
  // fresh to react to; fall straight through to the fallback tiers.
  const recent = messages.slice(-8);
  let lastTheirs: Message | undefined;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].from === other.id) { lastTheirs = recent[i]; break; }
  }

  if (lastTheirs) {
    const chip = buildContextualChip(lastTheirs.text, me, other);
    if (chip && !alreadyHas(chip.text)) chips.push(chip);
  }

  for (const c of personalizedFallback) {
    if (chips.length >= 4) break;
    if (!alreadyHas(c.text)) chips.push(c);
  }

  for (const c of genericFallback) {
    if (chips.length >= 4) break;
    if (!alreadyHas(c.text)) chips.push(c);
  }

  return chips.slice(0, 4);
}
