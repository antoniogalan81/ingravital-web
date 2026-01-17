import AuthForm from "@/src/components/AuthForm";

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Entrar</h1>
      <AuthForm mode="login" />
      <p style={{ marginTop: 12 }}>
        No tienes cuenta? <a href="/signup">Crear cuenta</a>
      </p>
    </main>
  );
}
