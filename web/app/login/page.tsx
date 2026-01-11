"use client";

import { useState } from "react";

const API_BASE = "https://altium-finanzas-app.onrender.com";

export default function LoginPage() {
  const [email, setEmail] = useState("altiumfinanzas@altiumfinanzas.com");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login"); // 👈 arrancá en login
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Procesando...");

    try {
      const url = `${API_BASE}/auth/${mode === "login" ? "login" : "register"}`;
      console.log("Llamando a:", url);

      // ✅ Volvemos a JSON para login y register (como te funcionaba antes)
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      console.log("AUTH STATUS:", res.status);
      console.log("AUTH RAW RESPONSE:", text);

      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // si no es JSON, queda {}
      }

      if (!res.ok) {
        setStatus(data.detail || data.message || `Error ${res.status}`);
        return;
      }

      // ✅ Si venís de register, pasamos a login
      if (mode === "register") {
        setStatus("Usuario registrado. Ahora iniciá sesión.");
        setMode("login");
        return;
      }

      // ✅ Login OK: guardar token (cubre varios nombres)
      const token = data.access_token || data.token || data.jwt;
      if (!token) {
        console.log("Respuesta inesperada de login:", data);
        setStatus("Login OK pero no vino token. Revisar backend.");
        return;
      }

      localStorage.setItem("altium_token", token);
      setStatus("Login correcto, entrando...");
      window.location.href = "/";
    } catch (err: any) {
      console.error("ERROR FETCH:", err);
      setStatus("Error de red: " + (err?.message || "no se pudo conectar"));
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
          onClick={() => setMode(mode === "login" ? "register" : "login")}
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
