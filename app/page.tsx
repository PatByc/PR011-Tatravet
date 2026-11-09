import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { publicUrl } from "@/lib/http";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getUser();
  if (!user) redirect("/login");
  return <Dashboard username={user.username} publicUrl={publicUrl()} />;
}
