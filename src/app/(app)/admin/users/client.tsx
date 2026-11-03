"use client";
import { useActionState, useState } from "react";
import { Field, FormAlert, Select, SubmitButton, buttonStyles } from "@/components/form";
import {
  createInviteAction,
  createUserAction,
  resetPasswordAction,
  revokeInviteAction,
  userAdminAction,
} from "@/server/actions";
import { emptyForm } from "@/server/form-state";

const roleOptions = [
  { value: "FACULTY", label: "Faculty" },
  { value: "ADMIN", label: "Administrator" },
];

export interface PersonView {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FACULTY";
  isActive: boolean;
  mustChangePassword: boolean;
  allowAdvancedLatex: boolean;
  lockedUntil: string | null;
  isYou: boolean;
}

function status(p: PersonView): string {
  if (!p.isActive) return "Deactivated";
  if (p.lockedUntil) return `Locked until ${p.lockedUntil}`;
  if (p.mustChangePassword) return "Has not chosen a password yet";
  return "Active";
}

export function UserRow({ person: p }: { person: PersonView }) {
  const [state, action] = useActionState(userAdminAction, emptyForm);
  const [settingPassword, setSettingPassword] = useState(false);
  return (
    <>
      <tr className={p.isActive ? undefined : "text-ink-3"}>
        <td className="px-4 py-3">
          <div className="font-medium">
            {p.name}
            {p.isYou ? <span className="font-normal text-ink-3"> (you)</span> : null}
          </div>
          <div className="text-ink-2">{p.email}</div>
        </td>
        <td className="px-4 py-3">{p.role === "ADMIN" ? "Administrator" : "Faculty"}</td>
        <td className="px-4 py-3">
          {status(p)}
          {p.allowAdvancedLatex ? (
            <div className="text-caption text-ink-2">May use Advanced LaTeX</div>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <form action={action} className="flex flex-wrap justify-end gap-1">
            <input type="hidden" name="userId" value={p.id} />
            {p.lockedUntil ? (
              <SubmitButton variant="quiet" name="op" value="unlock">
                Unlock
              </SubmitButton>
            ) : null}
            <button
              type="button"
              className={buttonStyles.quiet}
              onClick={() => setSettingPassword((v) => !v)}
              aria-expanded={settingPassword}
            >
              Set password
            </button>
            {p.role === "ADMIN" ? (
              <SubmitButton variant="quiet" name="op" value="make-faculty">
                Make faculty
              </SubmitButton>
            ) : (
              <SubmitButton variant="quiet" name="op" value="make-admin">
                Make administrator
              </SubmitButton>
            )}
            {p.allowAdvancedLatex ? (
              <SubmitButton variant="quiet" name="op" value="advanced-off">
                Turn off Advanced LaTeX
              </SubmitButton>
            ) : (
              <SubmitButton variant="quiet" name="op" value="advanced-on">
                Allow Advanced LaTeX
              </SubmitButton>
            )}
            {p.isActive ? (
              <SubmitButton variant="danger" name="op" value="deactivate">
                Deactivate
              </SubmitButton>
            ) : (
              <SubmitButton variant="quiet" name="op" value="activate">
                Reactivate
              </SubmitButton>
            )}
          </form>
        </td>
      </tr>
      {state.error ? (
        <tr>
          <td colSpan={4} className="px-4 pb-3">
            <FormAlert kind="error">{state.error}</FormAlert>
          </td>
        </tr>
      ) : null}
      {settingPassword ? (
        <tr>
          <td colSpan={4} className="bg-sunk px-4 py-4">
            <SetPasswordForm userId={p.id} name={p.name} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState(resetPasswordAction, emptyForm);
  return (
    <form action={action} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      {state.notice ? <FormAlert kind="notice">{state.notice}</FormAlert> : null}
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      <Field
        label={`New temporary password for ${name}`}
        name="password"
        type="text"
        autoComplete="off"
        required
        error={state.fields?.password}
        hint="Signs them out everywhere and unlocks the account."
      />
      <div>
        <SubmitButton variant="secondary" pendingText="Saving…">
          Set password
        </SubmitButton>
      </div>
    </form>
  );
}

export function CreateUserForm() {
  const [state, action] = useActionState(createUserAction, emptyForm);
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate key={state.notice}>
      {state.notice ? <FormAlert kind="notice">{state.notice}</FormAlert> : null}
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      <Field
        label="Name"
        name="name"
        required
        defaultValue={state.values?.name}
        error={f.name}
        autoComplete="off"
      />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        defaultValue={state.values?.email}
        error={f.email}
        autoComplete="off"
      />
      <Select
        label="Role"
        name="role"
        defaultValue={state.values?.role ?? "FACULTY"}
        options={roleOptions}
      />
      <Field
        label="Temporary password"
        name="password"
        type="text"
        required
        error={f.password}
        autoComplete="off"
        hint="At least 10 characters."
      />
      <div>
        <SubmitButton pendingText="Adding…">Add person</SubmitButton>
      </div>
    </form>
  );
}

export function InviteForm() {
  const [state, action] = useActionState(createInviteAction, emptyForm);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      {state.code ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3"
        >
          <span className="text-small text-ink-2">
            New invite code. Copy it now: it will not be shown again.
          </span>
          <output
            aria-label="New invite code"
            className="select-all font-mono text-xl font-semibold tracking-wider"
          >
            {state.code}
          </output>
        </div>
      ) : null}
      <Field label="Who is it for? (optional)" name="note" maxLength={120} autoComplete="off" />
      <Select label="Role" name="role" defaultValue="FACULTY" options={roleOptions} />
      <div>
        <SubmitButton variant="secondary" pendingText="Creating…">
          Create invite code
        </SubmitButton>
      </div>
    </form>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, action] = useActionState(revokeInviteAction, emptyForm);
  return (
    <form action={action} className="ml-auto">
      <input type="hidden" name="inviteId" value={inviteId} />
      <SubmitButton variant="danger">Revoke</SubmitButton>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}
