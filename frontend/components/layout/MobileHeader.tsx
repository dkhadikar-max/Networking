import Link from 'next/link';
import { IconBack } from '@/components/ui/BynIcons';

export default function MobileHeader({ rightAction, onBack }: { rightAction?: React.ReactNode, onBack?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 h-[56px] shrink-0 bg-white border-b border-slate-100 relative z-50">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button 
            onClick={onBack}
            className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <IconBack size={22} />
          </button>
        ) : (
          <Link href="/discover" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/assets/logo.png" 
              alt="BYN" 
              className="h-[24px] w-auto object-contain block" 
            />
          </Link>
        )}
      </div>
      {rightAction && (
        <div className="flex items-center">
          {rightAction}
        </div>
      )}
    </div>
  );
}
