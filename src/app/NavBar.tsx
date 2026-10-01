'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

const LINKS: { href: string; label: string; masterOnly?: boolean }[] = [
  { href: '/', label: '재고 파악 대시보드' },
  { href: '/receiving', label: '입고 관리' },
  { href: '/hbv', label: 'HBV 관리' },
  { href: '/admin', label: '관리자 화면', masterOnly: true },
];

export default function NavBar({ isMaster }: { isMaster: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-6 py-2">
        {LINKS.filter((l) => !l.masterOnly || isMaster).map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <div className="ml-auto">
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
