"use client";

import { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Procesando...");

    try {
      const res = await fetch(
        `${API_BASE}/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.detail || "Error al procesar la solicitud");
        return;
      }

      if (mode === "register") {
        setStatus("Usuario registrado, ahora inicia sesión.");
        setMode("login");
        return;
      }

      // Login OK → guardamos token y vamos a la app principal (/)
      localStorage.setItem("altium_token", data.access_token);
      setStatus("Login correcto, entrando a la app...");
      window.location.href = "/";
    } catch (err: any) {
      console.error("ERROR FETCH:", err);
      setStatus("Error: " + (err?.message || "no se pudo conectar"));
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: "24px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          maxWidth: "360px",
          width: "100%",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: "16px" }}>
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>Email</label>
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "8px", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: "8px", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px",
              border: "none",
              borderRadius: "4px",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {mode === "login" ? "Entrar" : "Registrarme"}
          </button>
        </form>

        <p
          style={{
            marginTop: "12px",
            fontSize: "0.9rem",
            textAlign: "center",
            minHeight: "1.5em",
          }}
        >
          {status}
        </p>

        <button
          type="button"
          onClick={() =>
            setMode(mode === "login" ? "register" : "login")
          }
          style={{
            marginTop: "8px",
            background: "none",
            border: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: "0.85rem",
            textDecoration: "underline",
            display: "block",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {mode === "login"
            ? "¿No tienes cuenta? Crear una"
            : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </main>
  );
}
