"use client";

import { useState, useEffect } from "react";

const APP_URL = "https://buildyournetwork.online";
const SIGNUP_URL = `${APP_URL}/app`;

const INTENTS = [
  { icon: "🤝", label: "Find Co-founders" },
  { icon: "💰", label: "Meet Investors" },
  { icon: "🚀", label: "Join Startup Teams" },
  { icon: "🎨", label: "Collaborate with Creators" },
  { icon: "🧠", label: "Find Mentors" },
  { icon: "🌍", label: "Build Global Network" },
];

const STEPS = [
  { n: "01", title: "Declare your intent", body: "Tell BYN what you want — a co-founder, an investor, a collaborator. No noise, no browsing." },
  { n: "02", title: "Match with purpose", body: "BYN surfaces people whose goals align with yours. Every match is intentional." },
  { n: "03", title: "Build real relationships", body: "Connect, talk, and turn conversations into opportunities. Your network compounds." },
];

const SOCIAL_PROOF = [
  { value: "12,000+", label: "Members" },
  { value: "38", label: "Cities" },
  { value: "95,000+", label: "Connections Made" },
  { value: "4.8★", label: "App Rating" },
];

export default function HomePage() {
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [stats, setStats] = useState({ users: 12000, connections: 95000 });

  useEffect(() => {
    fetch(`${APP_URL}/api/stats/public`)
      .then(r => r.json())
      .then(d => {
        if (d.users) setStats(d);
        setStatsLoaded(true);
      })
      .catch(() => setStatsLoaded(true));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">Build Your Network</span>
          <a
            href={SIGNUP_URL}
            className="bg-black text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-zinc-800 transition-colors"
          >
            Join Free
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-4 pt-20 pb-16 bg-white">
        <div className="inline-flex items-center gap-2 bg-zinc-100 text-zinc-600 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          {statsLoaded ? `${stats.users.toLocaleString()}+` : "12,000+"} ambitious people active
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight text-black max-w-3xl">
          Your next opportunity is probably{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
            one relationship away
          </span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-zinc-500 max-w-xl leading-relaxed">
          BYN is the intentional professional network for founders, operators, creators, and investors who know that real relationships — not LinkedIn requests — create real outcomes.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <a
            href={SIGNUP_URL}
            className="bg-black text-white font-semibold px-8 py-4 rounded-full text-base hover:bg-zinc-800 transition-colors"
          >
            Join the Network — Free
          </a>
          <a
            href="#how-it-works"
            className="border border-zinc-200 text-zinc-700 font-semibold px-8 py-4 rounded-full text-base hover:bg-zinc-50 transition-colors"
          >
            See How It Works
          </a>
        </div>
        <p className="mt-4 text-xs text-zinc-400">No credit card. 2-min setup. Join thousands of people already building.</p>
      </section>

      {/* Social proof bar */}
      <section className="bg-zinc-950 py-8">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {SOCIAL_PROOF.map(s => (
            <div key={s.label}>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-sm text-zinc-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Intent grid */}
      <section className="py-16 px-4 bg-zinc-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Built for every kind of ambitious person</h2>
          <p className="mt-3 text-zinc-500 text-base">Declare what you want. BYN finds who you need.</p>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {INTENTS.map(i => (
              <a
                key={i.label}
                href={SIGNUP_URL}
                className="flex items-center gap-3 bg-white border border-zinc-200 rounded-xl px-5 py-4 hover:border-zinc-400 hover:shadow-sm transition-all text-left"
              >
                <span className="text-2xl">{i.icon}</span>
                <span className="font-semibold text-sm text-zinc-800">{i.label}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How BYN works</h2>
            <p className="mt-3 text-zinc-500">Intentional. Fast. No noise.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map(s => (
              <div key={s.n} className="flex flex-col gap-3">
                <div className="text-4xl font-black text-zinc-100">{s.n}</div>
                <h3 className="font-bold text-lg text-zinc-900">{s.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / positioning */}
      <section className="py-16 px-4 bg-zinc-950 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-2xl sm:text-3xl font-semibold leading-snug">
            "LinkedIn shows you who exists. BYN shows you who is actually looking for what you are building."
          </p>
          <p className="mt-6 text-zinc-400 text-sm">— Founder, Series A, Bengaluru</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={SIGNUP_URL}
              className="bg-white text-black font-semibold px-8 py-4 rounded-full text-base hover:bg-zinc-100 transition-colors"
            >
              Start Building Your Network
            </a>
          </div>
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="py-12 px-4 bg-green-50 border-y border-green-100">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-lg font-semibold text-green-900">Know someone who should be on BYN?</p>
          <p className="mt-1 text-sm text-green-700">Share it with your network. Great networks are built together.</p>
          <a
            href="https://wa.me/?text=Just%20joined%20Build%20Your%20Network%20%E2%80%94%20the%20professional%20network%20built%20on%20real%20relationships.%20Refer%2010%20friends%20and%20get%201%20month%20Premium%20free.%20Join%20here%3A%20https%3A%2F%2Fbuildyournetwork.online%2Fapp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 bg-green-600 text-white font-semibold px-6 py-3 rounded-full hover:bg-green-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.562 4.14 1.541 5.876L0 24l6.305-1.518A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.895 0-3.668-.523-5.184-1.432l-.371-.22-3.742.901.937-3.637-.242-.384A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            Share on WhatsApp
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-white border-t border-zinc-100">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-400">
          <span className="font-semibold text-zinc-800">Build Your Network</span>
          <div className="flex gap-6">
            <a href={`${APP_URL}/privacy.html`} className="hover:text-zinc-700">Privacy</a>
            <a href={`${APP_URL}/byn_terms.html`} className="hover:text-zinc-700">Terms</a>
            <a href={SIGNUP_URL} className="hover:text-zinc-700">Join</a>
          </div>
          <span>© 2026 Build Your Network</span>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden bg-black text-white px-4 py-3 flex items-center justify-between z-50 border-t border-zinc-800">
        <div>
          <p className="font-semibold text-sm">Join BYN — Free</p>
          <p className="text-xs text-zinc-400">Your next opportunity awaits</p>
        </div>
        <a
          href={SIGNUP_URL}
          className="bg-white text-black font-bold text-sm px-5 py-2.5 rounded-full shrink-0"
        >
          Get Started
        </a>
      </div>
    </div>
  );
}
