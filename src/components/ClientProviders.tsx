"use client";

import { SyncProvider } from "@/src/sync";
import { AuthProvider } from "@/src/contexts/AuthContext";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SyncProvider>{children}</SyncProvider>
    </AuthProvider>
  );
}

