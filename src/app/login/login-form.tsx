"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ target }: { target: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="von" value={target} />
      <div className="grid gap-2">
        <Label htmlFor="passwort">Passwort</Label>
        <Input
          id="passwort"
          name="passwort"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-fehler" : undefined}
          className="h-11 font-mono"
        />
      </div>
      <p id="login-fehler" role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {state.error}
      </p>
      <Button type="submit" size="lg" disabled={pending} className="group h-11 font-semibold">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {pending ? "Prüfe …" : "Radar öffnen"}
        {!pending ? <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </Button>
    </form>
  );
}
