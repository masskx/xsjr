"use client";
// Form building blocks for the account pages. Forms post to server actions, so they also work
// without JavaScript (progressive enhancement); with JS, errors appear inline without a reload.
import { createContext, useActionState, useContext, useId, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export interface FormState {
  ok?: boolean;
  error?: string;
  field?: string;
  message?: string;
  /** non-secret values echoed back after a failed submit (React resets forms after an action) */
  values?: Record<string, string>;
}

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const StateContext = createContext<FormState>({});

export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <StateContext.Provider value={state}>
      <form action={formAction} className={className ?? "space-y-4"} noValidate>
        {state.error && !state.field && <Alert tone="error">{state.error}</Alert>}
        {state.ok && state.message && <Alert tone="ok">{state.message}</Alert>}
        {children}
      </form>
    </StateContext.Provider>
  );
}

export function Alert({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-zinc-200 bg-zinc-50 text-zinc-700",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2.5 text-[13.5px] leading-6 ${styles}`}>
      {children}
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  autoComplete,
  hint,
  defaultValue,
  required = true,
  inputMode,
  maxLength,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
  inputMode?: "numeric" | "email" | "text";
  maxLength?: number;
}) {
  const state = useContext(StateContext);
  const id = useId();
  const invalid = state.field === name;
  // passwords are never echoed back; other fields keep what the user typed
  const value = type === "password" ? undefined : (state.values?.[name] ?? defaultValue);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={value}
        required={required}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2 text-[14px] text-zinc-900 outline-none transition-shadow placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/20 ${
          invalid ? "border-rose-400" : "border-zinc-300 focus-visible:border-zinc-500"
        }`}
      />
      {invalid ? (
        <p id={`${id}-err`} className="mt-1.5 text-[12.5px] text-rose-700">
          {state.error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({ name, label, hint, rows = 5, maxLength, placeholder }: { name: string; label: string; hint?: string; rows?: number; maxLength?: number; placeholder?: string }) {
  const state = useContext(StateContext);
  const id = useId();
  const invalid = state.field === name;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-zinc-800">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={state.values?.[name]}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2 font-mono text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/20 ${
          invalid ? "border-rose-400" : "border-zinc-300 focus-visible:border-zinc-500"
        }`}
      />
      {invalid ? (
        <p id={`${id}-err`} className="mt-1.5 text-[12.5px] text-rose-700">
          {state.error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ name, children }: { name: string; children: ReactNode }) {
  const state = useContext(StateContext);
  const id = useId();
  const invalid = state.field === name;
  return (
    <div>
      <div className="flex items-start gap-2">
        <input
          id={id}
          name={name}
          type="checkbox"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/20"
        />
        <label htmlFor={id} className="text-[13px] leading-6 text-zinc-700">
          {children}
        </label>
      </div>
      {invalid && (
        <p id={`${id}-err`} className="mt-1 text-[12.5px] text-rose-700">
          {state.error}
        </p>
      )}
    </div>
  );
}

export function Submit({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  const styles =
    tone === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-zinc-900 text-white hover:bg-zinc-800";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto ${styles}`}
    >
      {pending ? "请稍候…" : children}
    </button>
  );
}
