"use client";
import { useEffect, useState } from "react";
import DashboardShell from "../components/DashboardShell";
import { apiFetch } from "../lib/api";
type Account = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  team_id: string | null;
  active: boolean;
  must_change_password: boolean;
};
type Team = { id: string; name: string };
export default function Accounts() {
  const [users, setUsers] = useState<Account[]>([]),
    [teams, setTeams] = useState<Team[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState("worker"),
    [selected, setSelected] = useState<Account | null>(null);
  async function load() {
    try {
      const [u, t] = await Promise.all([
        apiFetch("/api/auth/users"),
        apiFetch("/api/worker/teams"),
      ]);
      const ud = await u.json(),
        td = await t.json();
      if (!u.ok) throw new Error(ud.error);
      setUsers(ud.users);
      setTeams(td);
    } catch (e) {
      setMessage(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function mutate(url: string, method: string, data: object) {
    setBusy(true);
    setMessage("");
    try {
      const r = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage("Saved.");
      await load();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (
      await mutate("/api/auth/users", "POST", {
        email: f.get("email"),
        display_name: f.get("name"),
        role,
        password: f.get("password"),
        team_id: role === "worker" ? f.get("team") : null,
      })
    )
      form.reset();
  }
  return (
    <DashboardShell title="Accounts">
      <h1>Workspace access</h1>
      <p>
        Give each person an account and assign workers to a team.
      </p>
      <p role="status">{message}</p>
      <section className="card" style={{ padding: "1.5rem", margin: "1rem 0" }}>
        <h2>Create account</h2>
        <form
          className="account-form"
          onSubmit={create}
          style={{ maxWidth: 500 }}
        >
          <label>
            Name
            <input className="input" name="name" required maxLength={80} />
          </label>
          <label>
            Email
            <input className="input" name="email" type="email" required />
          </label>
          <label>
            Role
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="worker">Worker</option>
              <option value="maintenance">Maintenance supervisor</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          {role === "worker" && (
            <label>
              Team
              <select className="input" aria-label="Team" name="team" required>
                <option value="">Select a team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Temporary passphrase
            <input
              className="input"
              type="password"
              name="password"
              minLength={15}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <p>Use 15–128 characters. They must change it at first sign-in.</p>
          <button className="btn btn--primary" disabled={busy}>
            Create account
          </button>
        </form>
      </section>
      <section
        className="card"
        style={{ padding: "1.5rem", overflowX: "auto" }}
      >
        <h2>Accounts</h2>
        <table style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role / team</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.display_name}
                  <br />
                  {u.email}
                </td>
                <td>
                  {u.role === "admin" ? "Administrator" : u.role === "maintenance" ? "Supervisor" : "Worker"} {teams.find((team) => team.id === u.team_id)?.name || u.team_id}
                </td>
                <td>
                  {u.active ? "Active" : "Suspended"}
                  {u.must_change_password ? " · Password change required" : ""}
                </td>
                <td>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      mutate("/api/auth/users/" + u.id, "PATCH", {
                        active: !u.active,
                      })
                    }
                  >
                    {u.active ? "Suspend" : "Reactivate"}
                  </button>
                  <button className="btn" onClick={() => setSelected(u)}>
                    Edit / reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && (
        <section
          className="card"
          style={{ padding: "1.5rem", marginTop: "1rem" }}
        >
          <h2 style={{ overflowWrap: "anywhere" }}>Manage {selected.display_name}</h2>
          <form
            className="account-form"
            key={selected.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = f.get("role");
              await mutate("/api/auth/users/" + selected.id, "PATCH", {
                display_name: f.get("name"),
                role: r,
                team_id: r === "worker" ? f.get("team") : null,
              });
            }}
          >
            <label>
              Name
              <input
                className="input"
                name="name"
                defaultValue={selected.display_name}
                required
              />
            </label>
            <label>
              Role
              <select
                className="input"
                name="role"
                defaultValue={selected.role}
              >
                <option value="worker">Worker</option>
                <option value="maintenance">Maintenance supervisor</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label>
              Worker team
              <select
                className="input"
                name="team"
                defaultValue={selected.team_id || ""}
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" disabled={busy}>
              Save access
            </button>
          </form>
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              if (
                await mutate(
                  "/api/auth/users/" + selected.id + "/password",
                  "POST",
                  { new_password: f.get("password") },
                )
              )
                form.reset();
            }}
          >
            <label>
              New temporary passphrase
              <input
                className="input"
                type="password"
                name="password"
                minLength={15}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <p>This signs the person out on every device.</p>
            <button className="btn" disabled={busy}>
              Reset password
            </button>
          </form>
          <button className="btn" onClick={() => setSelected(null)}>
            Close
          </button>
        </section>
      )}
      <section
        className="card"
        style={{ padding: "1.5rem", marginTop: "1rem" }}
      >
        <details>
        <summary>Create field team</summary>
        <form
          className="account-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await mutate("/api/auth/teams", "POST", {
                id: f.get("id"),
                name: f.get("name"),
                type: f.get("type"),
                member_count: Number(f.get("members")),
              })
            )
              form.reset();
          }}
        >
          <label>
            Team ID
            <input
              className="input"
              name="id"
              required
              pattern="[A-Za-z0-9_-]+"
            />
          </label>
          <label>
            Team name
            <input className="input" name="name" required />
          </label>
          <label>
            Specialty
            <select className="input" name="type">
              {["Garbage", "Water", "Road", "Drain", "General"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Members
            <input
              className="input"
              name="members"
              type="number"
              min={1}
              max={100}
              defaultValue={1}
              required
            />
          </label>
          <button className="btn" disabled={busy}>
            Create team
          </button>
        </form>
        </details>
      </section>
    </DashboardShell>
  );
}
