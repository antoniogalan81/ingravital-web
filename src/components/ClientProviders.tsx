"use client";

import { SyncProvider } from "@/src/sync";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <SyncProvider>{children}</SyncProvider>;
}

