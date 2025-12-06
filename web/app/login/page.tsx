"use client";

import { useState } from "react";

const API_BASE =
  "https://altium-finanzas-app.onrender.com";

export default function LoginPage() {
  const [email, setEmail] = useState("altiumfinanzas@altiumfinanzas.com");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("register");
  const [status, setStatus] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Procesando...");

    try {
      console.log("Llamando a:", `${API_BASE}/auth/${mode}`);
      const res = await fetch(
        `${API_BASE}/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        console.warn("Respuesta no JSON:", text);
      }

      if (!res.ok) {
        console.error("Respuesta de error:", res.status, text);
        setStatus(
          data.detail ||
            `Error ${res.status}: ${
              text || "Error al procesar la solicitud"
            }`
        );
        return;
      }

      // Registro OK
      if (mode === "register") {
        setStatus("Usuario registrado, ahora inicia sesión.");
        setMode("login");
        return;
      }

      // Login OK
      if (!data.access_token) {
        console.log("Respuesta inesperada de login:", data);
        setStatus("Respuesta inesperada del servidor.");
        return;
      }

      localStorage.setItem("altium_token", data.access_token);
      setStatus("Login correcto, entrando a la app...");
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
            <label style={{ display: "block", marginBottom: "4px" }}>
              Email
            </label>
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
