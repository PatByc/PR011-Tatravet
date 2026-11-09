"use client";
import { useState } from "react";
import { LockKeyhole, Phone, ArrowRight, ShieldCheck } from "lucide-react";
import Brand from "./brand";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.href = "/";
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Nie udało się połączyć. Spróbuj ponownie.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Brand />
        <div className="story-body">
          <div className="story-icon">
            <Phone size={32} />
          </div>
          <h1>
            Każda rozmowa.
            <br />
            Pod dobrą opieką.
          </h1>
          <p>
            Połączenia, transkrypcje i sprawy do oddzwonienia — w jednym miejscu
            dla zespołu Tatravet.
          </p>
          <div className="story-line">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <span className="story-footer">Tatravet · Zakopane</span>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="lock-icon">
            <LockKeyhole size={23} />
          </span>
          <h2>Witaj w panelu</h2>
          <p>Zaloguj się, aby zobaczyć połączenia przychodni.</p>
          <form onSubmit={submit}>
            <label>
              Login
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={100}
              />
            </label>
            <label>
              Hasło
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary login-submit" disabled={busy}>
              {busy ? "Logowanie…" : "Zaloguj się"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-help">
            Nie pamiętasz hasła? Skontaktuj się z opiekunem panelu.
          </p>
          <div className="secure-note">
            <ShieldCheck size={16} /> Dostęp wyłącznie dla zespołu przychodni
          </div>
        </div>
      </section>
    </main>
  );
}
