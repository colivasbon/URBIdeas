import { redirect } from "next/navigation";

// SOCideas es la portada de la plataforma: la ruta histórica /socideas remite a /.
export default function SocideasRedirect() {
  redirect("/");
}
