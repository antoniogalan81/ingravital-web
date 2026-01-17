"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export default function Page() {
  const [state, setState] = useState<any>({ loading: true });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setState({ loading: false, user: { id: user.id, email: user.email } });
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function createTask() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      alert("No session token");
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Task " + Date.now() }),
    });

    const json = await res.json();
    alert(JSON.stringify(json, null, 2));
  }


  if (state.loading) return null;

  return (
    <main style={{ padding: 24 }}>
      <h1>Cuenta</h1>
      <pre>{JSON.stringify(state.user, null, 2)}</pre>

      <button onClick={logout} style={{ padding: 10, marginTop: 12 }}>
        Salir
      </button>

      <button onClick={createTask} style={{ padding: 10, marginTop: 12 }}>
        Crear task
      </button>
    </main>
  );
}
