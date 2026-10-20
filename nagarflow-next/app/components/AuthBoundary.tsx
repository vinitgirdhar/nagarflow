"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { session, home } from "../lib/api";
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
export default function AuthBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [approvedPath, setApprovedPath] = useState<string | null>(null),
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
        if (!u && !publicPage) {
          router.replace("/login");
          return;
        }
        if (u && (u.must_change_password || u.mfa_required) && !publicPage && path !== "/account") {
          router.replace("/account");
          return;
        }
        if (
          u &&
          !publicPage &&
          path !== "/account" &&
          ((u.role === "worker" && !path.startsWith("/worker-portal")) ||
            (u.role === "maintenance" && path !== "/maintenance"))
        ) {
          router.replace(home(u.role));
          return;
        }
        setApprovedPath(path);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, publicPage, router]);
  if (error)
    return (
      <main style={{ padding: "4rem" }}>
        <p role="alert">{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  if (approvedPath !== path)
    return (
      <main style={{ padding: "4rem" }} role="status">
        Connecting securely…
      </main>
    );
  return <Context.Provider value={user}>{children}</Context.Provider>;
}
