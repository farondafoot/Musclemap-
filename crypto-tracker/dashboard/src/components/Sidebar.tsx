"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "◈" },
  { href: "/wallets", label: "Wallets", icon: "👛" },
  { href: "/trades", label: "Trades", icon: "📊" },
  { href: "/alerts", label: "Alerts", icon: "🔔" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-52 shrink-0 bg-s1 border-r border-b1 flex flex-col py-6">
      <div className="px-5 mb-8">
        <h1 className="text-sm font-bold text-t1 tracking-widest uppercase">
          Crypto<span className="text-hi">Tracker</span>
        </h1>
        <p className="text-xs text-t3 mt-0.5">Wallet Intelligence</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-hi/10 text-hi font-medium"
                  : "text-t2 hover:text-t1 hover:bg-b1"
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pt-4 border-t border-b1">
        <p className="text-xs text-t3">Alert-only mode</p>
        <p className="text-xs text-success mt-0.5">● Monitor active</p>
      </div>
    </aside>
  );
}
