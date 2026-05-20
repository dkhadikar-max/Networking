"use client";

import { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="relative z-10 w-full max-w-[440px] px-5 animate-card-enter">
      <div className="bg-[#FAFAFA] rounded-3xl p-12 px-10 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04),0_0_40px_rgba(20,184,166,0.15)] relative overflow-hidden">
        {/* Shimmer accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#14B8A6] via-[#F4A261] to-[#14B8A6] bg-[length:200%_100%] animate-shimmer" />

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <div className="absolute top-[10%] left-[10%] w-1 h-1 bg-[#14B8A6] rounded-full opacity-30 animate-float" style={{ animationDelay: "0s" }} />
          <div className="absolute top-[20%] right-[15%] w-1 h-1 bg-[#F4A261] rounded-full opacity-30 animate-float" style={{ animationDelay: "1s" }} />
          <div className="absolute bottom-[30%] left-[20%] w-1 h-1 bg-[#14B8A6] rounded-full opacity-30 animate-float" style={{ animationDelay: "2s" }} />
          <div className="absolute bottom-[15%] right-[10%] w-1 h-1 bg-[#F4A261] rounded-full opacity-30 animate-float" style={{ animationDelay: "3s" }} />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_4px_12px_rgba(13,115,119,0.3)]">
              <rect width="100" height="100" rx="24" fill="#0D7377" />
              <circle cx="35" cy="35" r="12" fill="white" fillOpacity="0.9" />
              <circle cx="35" cy="35" r="7" fill="#14B8A6" />
              <circle cx="65" cy="50" r="14" fill="white" fillOpacity="0.9" />
              <circle cx="65" cy="50" r="8" fill="#14B8A6" />
              <circle cx="35" cy="70" r="12" fill="white" fillOpacity="0.9" />
              <circle cx="35" cy="70" r="7" fill="#F4A261" />
              <line x1="43" y1="40" x2="53" y2="46" stroke="white" strokeWidth="3" strokeLinecap="round" />
              <line x1="43" y1="65" x2="53" y2="56" stroke="white" strokeWidth="3" strokeLinecap="round" />
              <line x1="35" y1="47" x2="35" y2="58" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight mb-1.5">{title}</h1>
          <p className="text-sm text-gray-500 font-normal">{subtitle}</p>
        </div>

        {children}

        <div className="text-center mt-6 text-sm text-gray-500">{footer}</div>
      </div>
    </div>
  );
}
