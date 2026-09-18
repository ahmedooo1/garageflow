import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { Logo } from "@/components/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session) redirect("/app/atelier");
  return (
    <div className="flex min-h-dvh flex-col bg-steel-900">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <Logo light />
          </div>
          <div className="card p-6 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
