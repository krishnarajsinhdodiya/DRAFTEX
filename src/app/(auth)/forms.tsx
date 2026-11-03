"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { PASSWORD_MIN } from "@/lib/auth/password-rules";
import {
  changePasswordAction,
  redeemInviteAction,
  setupAction,
  signInAction,
} from "@/server/actions";
import { emptyForm } from "@/server/form-state";

const passwordHint = `At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`;

export function SignInForm() {
  const [state, action] = useActionState(signInAction, emptyForm);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        defaultValue={state.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Have an invite code?{" "}
        <Link
          href="/join"
          className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
        >
          Create your account
        </Link>
      </p>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupAction, emptyForm);
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        required
        autoFocus
        defaultValue={state.values?.name}
        error={f.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        error={f.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={f.password}
        hint={passwordHint}
      />
      <Field
        label="Type the password again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={f.confirm}
      />
      <SubmitButton pendingText="Creating…">Create administrator</SubmitButton>
    </form>
  );
}

export function JoinForm() {
  const [state, action] = useActionState(redeemInviteAction, emptyForm);
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      <Field
        label="Invite code"
        name="code"
        required
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX"
        className="font-mono uppercase"
        defaultValue={state.values?.code}
        hint="Your administrator gave you this code."
      />
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={f.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        error={f.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={f.password}
        hint={passwordHint}
      />
      <Field
        label="Type the password again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={f.confirm}
      />
      <SubmitButton pendingText="Creating…">Create account</SubmitButton>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, emptyForm);
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <FormAlert kind="error">{state.error}</FormAlert> : null}
      <Field
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        error={f.current}
      />
      <Field
        label="New password"
        name="next"
        type="password"
        autoComplete="new-password"
        required
        error={f.next}
        hint={passwordHint}
      />
      <Field
        label="Type the new password again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={f.confirm}
      />
      <SubmitButton pendingText="Saving…">Change password</SubmitButton>
    </form>
  );
}
