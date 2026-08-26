'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import clsx from 'clsx';

function initials(name: string) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

type Props = {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  online?: boolean;
};

export default function Avatar({ src, name, size = 40, className, online }: Props) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [src]);
  const showImage = src && !imgError;

  return (
    <div className={clsx('relative shrink-0 select-none', className)} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-[#D8FAF2] to-[#FFF4E7] flex items-center justify-center border border-slate-200/80 shadow-2xs"
        style={{ fontSize: Math.max(10, Math.floor(size * 0.36)) }}
      >
        {showImage ? (
          <Image
            src={src}
            alt={name || 'Avatar'}
            width={size}
            height={size}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <span className="font-extrabold text-[#157A6E] tracking-tight leading-none">
            {initials(name)}
          </span>
        )}
      </div>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-[#22C55E] border-2 border-white shadow-xs"
          style={{ width: Math.max(8, Math.floor(size * 0.26)), height: Math.max(8, Math.floor(size * 0.26)) }}
          title="Online now"
        />
      )}
    </div>
  );
}
