"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { session, home } from "../lib/api";
import ConnectionScreen from "./ConnectionScreen";
export type User = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  team_id: string | null;
  municipality_name: string;
  must_change_password: boolean;
  mfa_enabled: boolean;
  mfa_required: boolean;
  mfa_policy_required: boolean;
  mfa_available: boolean;
  demo: boolean;
};
const Context = createContext<User | null>(null);
export const useUser = () => useContext(Context);
function destination(user: User | null, path: string) {
  if (path === "/" || path === "/login") return null;
  if (!user) return "/login";
  if ((user.must_change_password || user.mfa_required) && path !== "/account") return "/account";
  if (path !== "/account" && ((user.role === "worker" && !path.startsWith("/worker-portal")) ||
      (user.role === "maintenance" && path !== "/maintenance"))) return home(user.role);
  return null;
}
export default function AuthBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [resolved, setResolved] = useState(false),
    [error, setError] = useState("");
  const publicPage = path === "/" || path === "/login";
  useEffect(() => {
    let alive = true;
    session()
      .then((data) => {
        if (!alive) return;
        setError("");
        const u = data.user as User | null;
        setUser(u);
        setResolved(true);
        const redirect = destination(u, path);
        if (redirect) router.replace(redirect);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, publicPage, router]);
  if (error) return <ConnectionScreen error={error} retry={() => window.location.reload()} />;
  // Continue to verify the session on navigation, without replacing a known,
  // authorized workspace with a full-screen connection message each time.
  if ((!resolved && path !== "/") || (resolved && destination(user, path))) return <ConnectionScreen />;
  return <Context.Provider value={user}>{children}</Context.Provider>;
}
