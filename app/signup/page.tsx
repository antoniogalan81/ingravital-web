import AuthForm from "@/src/components/AuthForm";

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Crear cuenta</h1>
      <AuthForm mode="signup" />
      <p style={{ marginTop: 12 }}>
        Ya tienes cuenta? <a href="/login">Entrar</a>
      </p>
    </main>
  );
}
