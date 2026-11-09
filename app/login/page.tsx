import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Login from "@/components/login";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await getUser()) redirect("/");
  return <Login />;
}
