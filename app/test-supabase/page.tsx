"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type LeadRow = {
  id: string;
  email: string;
  created_at: string;
};

export default function Page() {
  const [state, setState] = useState<any>({ loading: true });
  const [email, setEmail] = useState("test+" + Date.now() + "@ingravital.dev");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data, error } = await supabase
      .from("leads")
      .select("id,email,created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    setState({ ok: !error, error: error?.message, data: (data ?? []) as LeadRow[] });
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setState((s: any) => ({ ...s, loading: false }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function insertLead() {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .insert({ email })
        .select("id,email,created_at")
        .single();

      if (error) {
        setState((s: any) => ({ ...s, lastInsert: { ok: false, error: error.message } }));
        return;
      }

      setState((s: any) => ({ ...s, lastInsert: { ok: true, data } }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", padding: 24 }}>
      <h1>test-supabase</h1>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, minWidth: 340 }}
        />
        <button onClick={insertLead} disabled={busy} style={{ padding: "8px 12px" }}>
          {busy ? "Inserting..." : "Insert lead"}
        </button>
        <button onClick={refresh} disabled={busy} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
      </div>

      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
