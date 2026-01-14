import SiteShell from "@/components/SiteShell";

export default function Legal() {
  return (
    <SiteShell active="legal">
      <section className="max-w-3xl">
        <h1 className="text-4xl font-bold md:text-5xl">Legal y privacidad</h1>

        <h2 className="mt-10 text-2xl font-semibold">Aviso legal</h2>
        <p className="mt-3 text-slate-600">
          Sustituye este texto por tu aviso legal: titular, NIF/CIF, domicilio, email, condiciones de uso y
          jurisdiccion.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Politica de privacidad</h2>
        <p className="mt-3 text-slate-600">
          Sustituye este texto por tu politica de privacidad (RGPD): responsable, finalidad, legitimacion,
          cesiones, conservacion, derechos y contacto.
        </p>
      </section>
    </SiteShell>
  );
}
