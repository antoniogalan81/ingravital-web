"use client";

import { SyncProvider } from "@/src/sync";
import { AuthProvider } from "@/src/contexts/AuthContext";
import { RoleProvider } from "@/src/contexts/RoleContext";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleProvider>
        <SyncProvider>{children}</SyncProvider>
      </RoleProvider>
    </AuthProvider>
  );
}
