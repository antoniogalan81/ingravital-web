import { redirect } from "next/navigation";

// /inversor — RUTA HEREDADA.
//
// El área del inversor vive ahora en `/i`. Esta ruta se conserva como redirección
// permanente porque hay enlaces ya enviados a inversores apuntando aquí: romperlos
// dejaría a esas personas sin acceso.
//
// Los accesos antiguos de `investment_shares` se convierten en oportunidades e
// invitaciones en el backfill de `20260910_investor_platform.sql`, así que quien
// llegue por este camino encuentra su contenido en el área nueva.

export default function InversorLegacyRedirect() {
  redirect("/i");
}
