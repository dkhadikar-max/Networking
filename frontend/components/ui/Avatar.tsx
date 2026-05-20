import Image from 'next/image';
import clsx from 'clsx';

function initials(name: string) {
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
  return (
    <div className={clsx('relative shrink-0', className)} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full overflow-hidden bg-[var(--light)] flex items-center justify-center"
        style={{ fontSize: size * 0.35 }}
      >
        {src ? (
          <Image
            src={src}
            alt={name}
            width={size}
            height={size}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <span className="font-bold text-[var(--primary)]">{initials(name)}</span>
        )}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[var(--green)] border-2 border-white" />
      )}
    </div>
  );
}
