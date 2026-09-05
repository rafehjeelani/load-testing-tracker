import { useState, type FormEvent } from "react";
import {
  deleteUserAdmin,
  generateInviteLink,
  generateResetLink,
  inviteStaff,
  listAllUsers,
  requestPasswordReset,
  StaffApiError,
  updateUserEmailAdmin,
  updateUserFullName,
  updateUserRole,
} from "../../lib/staffApi";
import type { Moderator, StaffRole } from "../../types";

// Accounts that can never be deleted from this page, regardless of who's
// signed in -- mirrors the server-side guard in the manage-users edge
// function, which is the actual enforcement point.
const PROTECTED_EMAILS = ["rafehjeelani@gmail.com"];
function isProtected(user: Moderator) {
  return PROTECTED_EMAILS.includes(user.email.toLowerCase());
}

/** Best-effort clipboard copy -- returns false (instead of throwing) when the
 *  browser blocks it, so callers can fall back to showing the raw link. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
import {
  Badge,
  Button,
  ErrorState,
  FieldLabel,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  RefreshButton,
} from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

export default function Users() {
  const [users, setUsers] = useState<Moderator[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<StaffRole>("moderator");
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [addSent, setAddSent] = useState(false);
  const [addLink, setAddLink] = useState<string | null>(null);
  const [addLinkLoading, setAddLinkLoading] = useState(false);
  const [addLinkCopied, setAddLinkCopied] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("moderator");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetSentId, setResetSentId] = useState<string | null>(null);
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null);

  async function load() {
    setUsers(await listAllUsers());
  }

  const { status, error, slow, retry } = useAsyncLoad(load, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function closeAdd() {
    setAddOpen(false);
    setAddName("");
    setAddEmail("");
    setAddRole("moderator");
    setAddError(null);
    setAddSent(false);
    setAddLink(null);
    setAddLinkCopied(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      await inviteStaff(addEmail.trim(), addName.trim(), addRole);
      setAddSent(true);
      await load();
    } catch (err) {
      setAddError(err instanceof StaffApiError ? err.message : "Couldn't send the invite. Try again.");
    } finally {
      setAddLoading(false);
    }
  }

  /** Alternative to Send Invite that skips Supabase's built-in email send
   *  entirely -- generates the same link, for the admin to copy and share
   *  directly, so repeated use doesn't run into the email rate limit. */
  async function handleGenerateLink() {
    if (!addName.trim() || !addEmail.trim()) {
      setAddError("Full Name and Email are required.");
      return;
    }
    setAddLinkLoading(true);
    setAddError(null);
    try {
      const link = await generateInviteLink(addEmail.trim(), addName.trim(), addRole);
      setAddLink(link);
      await copyToClipboard(link);
      await load();
    } catch (err) {
      setAddError(err instanceof StaffApiError ? err.message : "Couldn't generate a link. Try again.");
    } finally {
      setAddLinkLoading(false);
    }
  }

  function startEdit(user: Moderator) {
    setEditingId(user.id);
    setEditName(user.full_name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditError(null);
  }

  async function saveEdit(user: Moderator) {
    const name = editName.trim();
    const email = editEmail.trim();
    if (!name || !email) return;
    setEditSaving(true);
    setEditError(null);
    try {
      if (name !== user.full_name) await updateUserFullName(user.id, name);
      if (email !== user.email) await updateUserEmailAdmin(user.id, email);
      if (editRole !== user.role) await updateUserRole(user.id, editRole);
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof StaffApiError ? err.message : "Couldn't save those changes. Try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(user: Moderator) {
    if (isProtected(user)) {
      setRowError({ id: user.id, message: "This account is protected and can't be deleted." });
      return;
    }
    const ok = window.confirm(
      `Permanently delete ${user.full_name} (${user.email})? They will no longer be able to sign in.`,
    );
    if (!ok) return;
    setRowError(null);
    try {
      await deleteUserAdmin(user.id);
      await load();
    } catch (err) {
      setRowError({ id: user.id, message: err instanceof StaffApiError ? err.message : "Couldn't delete that user." });
    }
  }

  async function handleResendReset(user: Moderator) {
    setResettingId(user.id);
    setRowError(null);
    try {
      await requestPasswordReset(user.email);
      setResetSentId(user.id);
      setTimeout(() => setResetSentId((id) => (id === user.id ? null : id)), 2500);
    } catch (err) {
      setRowError({ id: user.id, message: err instanceof StaffApiError ? err.message : "Couldn't send the reset email." });
    } finally {
      setResettingId(null);
    }
  }

  /** Alternative to the email-sending reset above -- generates the reset link
   *  without sending an email, so repeated resets for the same person don't
   *  run into Supabase's built-in email rate limit. Copies it to the
   *  clipboard for the admin to share directly. */
  async function handleCopyResetLink(user: Moderator) {
    setResettingId(user.id);
    setRowError(null);
    try {
      const link = await generateResetLink(user.email);
      const copied = await copyToClipboard(link);
      if (copied) {
        setLinkCopiedId(user.id);
        setTimeout(() => setLinkCopiedId((id) => (id === user.id ? null : id)), 2500);
      } else {
        setRowError({ id: user.id, message: `Couldn't copy automatically -- here's the link: ${link}` });
      }
    } catch (err) {
      setRowError({ id: user.id, message: err instanceof StaffApiError ? err.message : "Couldn't generate a link." });
    } finally {
      setResettingId(null);
    }
  }

  if (status === "loading") return <LoadingState slow={slow} />;
  if (status === "error") return <ErrorState message={error!} onRetry={retry} />;

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav
        brandTo="/admin"
        tabs={[{ label: "Tests", to: "/admin", end: true }, { label: "Users", to: "/admin/users" }]}
      />
      <PageHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold m-0">Users</h1>
            <div className="text-[12.5px] text-text-3 mt-1">
              Every admin and moderator account across all tests
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onClick={handleRefresh} loading={refreshing} />
            <Button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 whitespace-nowrap">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add User
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Email
                </th>
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Role
                </th>
                <th className="px-4 py-2.5 border-b border-border w-[140px]" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-3">
                    No users yet — add one to get started.
                  </td>
                </tr>
              )}
              {users.map((user) => {
                const editing = editingId === user.id;
                return (
                  <tr key={user.id} className="border-b border-border-soft last:border-0 align-top">
                    {editing ? (
                      <>
                        <td className="px-4 py-2.5">
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 border border-border rounded-[6px] bg-surface text-[13px]"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full px-2 py-1 border border-border rounded-[6px] bg-surface text-[13px]"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as StaffRole)}
                            className="px-2 py-1 border border-border rounded-[6px] bg-surface text-[13px]"
                          >
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(user)}
                              disabled={editSaving}
                              className="text-success cursor-pointer disabled:opacity-50"
                              title="Save"
                            >
                              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-text-3 cursor-pointer text-[16px] leading-none"
                            >
                              ×
                            </button>
                          </div>
                          {editError && <div className="text-[11.5px] text-danger mt-1 max-w-[200px]">{editError}</div>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-semibold">{user.full_name}</td>
                        <td className="px-4 py-2.5">{user.email}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={user.role === "admin" ? "accent" : "neutral"}>
                            {user.role === "admin" ? "Admin" : "Moderator"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => startEdit(user)}
                              className="text-text-3 hover:text-accent cursor-pointer"
                              title="Edit"
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResendReset(user)}
                              disabled={resettingId === user.id}
                              className="text-text-3 hover:text-accent cursor-pointer disabled:opacity-50"
                              title="Resend password reset email"
                            >
                              {resetSentId === user.id ? (
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={2.5}>
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              ) : (
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M3 7l9 6 9-6" />
                                  <rect x="3" y="5" width="18" height="14" rx="2" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyResetLink(user)}
                              disabled={resettingId === user.id}
                              className="text-text-3 hover:text-accent cursor-pointer disabled:opacity-50"
                              title="Copy password reset link (no email sent -- avoids the email limit)"
                            >
                              {linkCopiedId === user.id ? (
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={2.5}>
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              ) : (
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.5" />
                                  <path d="M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L13.5 18.5" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              disabled={isProtected(user)}
                              className={`cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                isProtected(user) ? "text-text-3" : "text-text-3 hover:text-danger"
                              }`}
                              title={isProtected(user) ? "This account is protected and can't be deleted" : "Delete user"}
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M3 6h18" />
                                <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                          {rowError?.id === user.id && (
                            <div className="text-[11.5px] text-danger mt-1 max-w-[220px]">{rowError.message}</div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={addOpen} onClose={closeAdd} title="Add User">
        {addSent ? (
          <div>
            <p className="text-[13px] text-text-2 mb-4 leading-relaxed">
              <span className="font-semibold text-text">{addEmail}</span> will get an email with a link to
              set their password and sign in as {addRole === "admin" ? "an admin" : "a moderator"}.
            </p>
            <Button variant="secondary" onClick={closeAdd}>
              Done
            </Button>
          </div>
        ) : addLink ? (
          <div>
            <p className="text-[13px] text-text-2 mb-3 leading-relaxed">
              {addName} was added as {addRole === "admin" ? "an admin" : "a moderator"}. Share this link with
              them directly — it lets them set their password and sign in (no email was sent):
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={addLink}
                onFocus={(e) => e.target.select()}
                className="w-full px-2.5 py-2 border border-border rounded-[7px] bg-surface-2 text-[12.5px] font-mono-tabular"
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={async () => {
                  const copied = await copyToClipboard(addLink);
                  if (copied) {
                    setAddLinkCopied(true);
                    setTimeout(() => setAddLinkCopied(false), 2500);
                  }
                }}
              >
                {addLinkCopied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <Button variant="secondary" onClick={closeAdd}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div>
              <FieldLabel>Role</FieldLabel>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                  <input
                    type="radio"
                    name="add-user-role"
                    checked={addRole === "moderator"}
                    onChange={() => setAddRole("moderator")}
                  />
                  Moderator
                </label>
                <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                  <input
                    type="radio"
                    name="add-user-role"
                    checked={addRole === "admin"}
                    onChange={() => setAddRole("admin")}
                  />
                  Admin
                </label>
              </div>
            </div>
            <div>
              <FieldLabel required>Full Name</FieldLabel>
              <Input
                required
                placeholder="e.g. Priya Nair"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel required>Email</FieldLabel>
              <Input
                type="email"
                required
                placeholder="user@talview.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
              />
            </div>
            {addError && <div className="text-[12.5px] text-danger">{addError}</div>}
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="submit" disabled={addLoading || addLinkLoading}>
                {addLoading ? "Sending…" : "Send Invite Email"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={addLoading || addLinkLoading}
                onClick={handleGenerateLink}
                title="Skips Supabase's email limit -- copies the invite link to share directly"
              >
                {addLinkLoading ? "Generating…" : "Copy Invite Link"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeAdd}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
