"use client";

import React, { useState, useEffect } from "react";
import EstadoResultados from "../components/EstadoResultados";
import Presupuesto from "../components/Presupuesto";
import FlujoCaja from "../components/FlujoCaja";
import CargaManual from "../components/cargaManual";
import InformeMensual from "../components/InformeMensual";

type TabKey = "estado" | "presupuesto" | "flujo" | "manual" | "informe";

const API_BASE = "http://127.0.0.1:8000";
const TRIAL_DAYS = 30;
const TRIAL_KEY = "altium_trial_start";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("estado");

  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [isTrialActive, setIsTrialActive] = useState<boolean>(true);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("altium_token");
    if (!token) {
      window.location.href = "/login";
    } else {
      setCheckingAuth(false);
    }
  }, []);

  // Inicializa y calcula la prueba gratuita
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined"
        ? window.localStorage.getItem(TRIAL_KEY)
        : null;

      let startDate: Date;

      if (!stored) {
        // Primera vez que entra → arranca la prueba hoy
        startDate = new Date();
        window.localStorage.setItem(TRIAL_KEY, startDate.toISOString());
      } else {
        startDate = new Date(stored);
      }

      const now = new Date();
      const diffMs = now.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const remaining = TRIAL_DAYS - diffDays;
      setDaysLeft(remaining);
      setIsTrialActive(remaining > 0);
    } catch (e) {
      // Si algo falla con localStorage, asumimos prueba activa
      setDaysLeft(TRIAL_DAYS);
      setIsTrialActive(true);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(Array.from(e.target.files));
  };

  const upload = async () => {
    if (!files.length) return;
    if (!isTrialActive) {
      setStatus(
        "Tu período de prueba terminó. Podés seguir viendo tus datos, pero para cargar nuevos archivos necesitás pasar al plan PRO."
      );
      return;
    }

    setStatus("Subiendo archivos...");
    const resultados: string[] = [];

    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);

      const lowerName = f.name.toLowerCase();

      try {
        // Si es CSV -> lo mandamos al importador histórico
        if (lowerName.endsWith(".csv")) {
          const res = await fetch(`${API_BASE}/transactions/import-csv`, {
            method: "POST",
            body: fd,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const json = await res.json();
          resultados.push(
            `Histórico importado desde ${f.name}: ${json.message} (importadas ${json.imported}, saltadas ${json.skipped})`
          );
        } else {
          // Si NO es CSV -> va al OCR normal de comprobantes
          const res = await fetch(`${API_BASE}/documents/upload`, {
            method: "POST",
            body: fd,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const json = await res.json();
          resultados.push(
            `Subido: ${f.name} → doc ${json.document_id} | OCR: ${json.ocr_preview}`
          );
        }
      } catch (err) {
        console.error(err);
        resultados.push(`Error subiendo ${f.name}`);
      }
    }

    setStatus(resultados.join("\n"));
  };

  const scrollToApp = () => {
    const el = document.getElementById("app-panel");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const canUpload = isTrialActive && files.length > 0;
  if (checkingAuth) {
    return (
      <main style={{ padding: "16px" }}>
        <p>Comprobando sesión...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>
      {/* BANNER DE PRUEBA */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderRadius: 8,
          marginBottom: "1rem",
          backgroundColor: isTrialActive ? "#e6f4ea" : "#fde7e7",
          border: `1px solid ${isTrialActive ? "#b7e1c2" : "#f5b5b5"}`,
          fontSize: "0.9rem",
        }}
      >
        {daysLeft === null ? (
          <>Calculando tu período de prueba...</>
        ) : isTrialActive ? (
          <>
            <strong>Estás en tu período de prueba gratuita.</strong>{" "}
            Te quedan{" "}
            <strong>
              {daysLeft} día{daysLeft === 1 ? "" : "s"}
            </strong>{" "}
            para usar todas las funciones sin límite. Luego vas a poder seguir
            viendo tus datos, pero no cargar nuevos archivos.
          </>
        ) : (
          <>
            <strong>Tu período de prueba gratuita terminó.</strong>{" "}
            Podés seguir entrando a ver tus estados, presupuesto, flujo e
            informes, pero para seguir cargando nuevos comprobantes e históricos
            necesitás pasar al plan PRO (u$s 9,99/mes). Si te interesa, escribinos
            y lo coordinamos.
          </>
        )}
      </div>

      {/* HERO / LANDING SIMPLE */}
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          Altium Finanzas 2.0
        </h1>
        <p style={{ fontSize: "1rem", color: "#444", maxWidth: 700 }}>
          Una herramienta pensada para dueños de pequeños negocios que quieren
          entender, en sencillo, si su emprendimiento está ganando plata, dónde
          se va el dinero y qué podrían mejorar.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            marginTop: "1rem",
            alignItems: "center",
          }}
        >
          <button
            onClick={scrollToApp}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Usar la app ahora
          </button>
          <span style={{ fontSize: "0.9rem", color: "#666" }}>
            Funciona desde la web y la podés usar desde el celular.
          </span>
        </div>
      </header>

      {/* SECCIÓN: BENEFICIOS / PARA QUÉ SIRVE */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h2>¿Qué hace Altium Finanzas por vos?</h2>
          <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
            <li>
              Te arma un <strong>estado de resultados</strong> claro: cuánto
              entra, cuánto sale y si ganás o perdés.
            </li>
            <li>
              Te sugiere un <strong>presupuesto</strong> usando tus últimos
              meses como referencia.
            </li>
            <li>
              Te muestra el <strong>flujo de caja</strong> para que veas si te
              va a faltar o sobrar plata.
            </li>
            <li>
              Te genera un <strong>informe en lenguaje simple</strong>, pensado
              para alguien que no es contador.
            </li>
          </ul>
        </div>
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            backgroundColor: "#fafafa",
            fontSize: "0.9rem",
          }}
        >
          <h3>¿Para quién es?</h3>
          <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
            <li>Emprendedores que recién empiezan.</li>
            <li>Dueños de pequeños negocios con poco tiempo.</li>
            <li>
              Personas que quieren entender sus números sin hablar “en
              contadores”.
            </li>
          </ul>
        </div>
      </section>

      {/* SECCIÓN: CÓMO FUNCIONA */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>¿Cómo funciona?</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>
            Subís fotos o PDFs de tus comprobantes, o un archivo histórico en
            CSV/Excel con tus ventas y gastos.
          </li>
          <li>
            La app procesa los datos y arma automáticamente tus estados,
            presupuesto y flujo.
          </li>
          <li>
            Leés el informe en lenguaje simple y, si querés, pedís una
            consultoría personalizada para ir más a fondo.
          </li>
        </ol>
      </section>

      {/* PANEL DE LA APP */}
      <section id="app-panel" style={{ marginTop: "2rem" }}>
        <h2>Usá la app</h2>
        <p style={{ maxWidth: 700, color: "#444", marginBottom: "1rem" }}>
          Acá es donde cargás tu información y ves los números de tu negocio.
          Podés volver a esta sección todas las veces que quieras, e ir
          agregando nuevos meses y comprobantes.
        </p>

        {/* Zona de subida de archivos */}
        <section style={{ marginTop: "0.5rem", marginBottom: "1.5rem" }}>
          <h3>Cargá tu información</h3>
          <p style={{ maxWidth: 700 }}>
            Podés subir fotos o PDFs de tickets, facturas y estados de cuenta.
            Si tenés un archivo histórico en Excel/CSV (con ventas, compras,
            alquiler, sueldos, etc.), también podés subirlo y lo usamos para
            armar tus números.
          </p>

          <div style={{ marginTop: "0.75rem" }}>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ marginRight: "0.5rem" }}
              disabled={!isTrialActive}
            />
            <button onClick={upload} disabled={!canUpload}>
              Subir
            </button>
          </div>

          {!isTrialActive && (
            <p
              style={{
                fontSize: "0.85rem",
                color: "#b00020",
                marginTop: "0.5rem",
              }}
            >
              Tu prueba terminó. Podés ver tus datos, pero no cargar nuevos
              archivos. Escribinos si querés seguir usándola de forma completa.
            </p>
          )}

          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>
            {status}
          </pre>

          <p
            style={{
              fontSize: "0.85rem",
              color: "#555",
              marginTop: "0.5rem",
              maxWidth: 700,
            }}
          >
            💡 Tip: los archivos <strong>.csv</strong> los tomamos como
            histórico (meses anteriores). Las imágenes y PDF los leemos como
            comprobantes individuales.
          </p>
        </section>

        {/* Pestañas */}
        <section>
          <p style={{ marginBottom: "0.5rem" }}>
            Elegí qué querés ver de tu negocio:
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setTab("estado")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 4,
                border:
                  tab === "estado" ? "2px solid black" : "1px solid #ccc",
              }}
            >
              Estado de Resultados
            </button>

            <button
              onClick={() => setTab("presupuesto")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 4,
                border:
                  tab === "presupuesto" ? "2px solid black" : "1px solid #ccc",
              }}
            >
              Presupuesto
            </button>

            <button
              onClick={() => setTab("flujo")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 4,
                border:
                  tab === "flujo" ? "2px solid black" : "1px solid #ccc",
              }}
            >
              Flujo de Caja
            </button>

            <button
              onClick={() => setTab("manual")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 4,
                border:
                  tab === "manual" ? "2px solid black" : "1px solid #ccc",
              }}
            >
              Carga manual
            </button>

            <button
              onClick={() => setTab("informe")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 4,
                border:
                  tab === "informe" ? "2px solid black" : "1px solid #ccc",
              }}
            >
              Informe mensual
            </button>
          </div>

          {tab === "estado" && <EstadoResultados />}
          {tab === "presupuesto" && <Presupuesto />}
          {tab === "flujo" && <FlujoCaja />}
          {tab === "manual" && <CargaManual />}
          {tab === "informe" && <InformeMensual />}
        </section>
      </section>
            {/* PLAN PRO */}
      <hr style={{ margin: "2rem 0" }} />
      <div
        style={{
          padding: "1rem",
          borderRadius: 8,
          border: "1px solid #ddd",
          backgroundColor: "#f5f9ff",
          marginBottom: "1.5rem",
        }}
      >
        <h3>Plan PRO – u$s 9,99 / mes</h3>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Pensado para dueños de pequeños negocios que quieren tener sus
          números al día sin volverse locos con planillas.
        </p>
        <ul
          style={{
            paddingLeft: "1.2rem",
            marginTop: "0.5rem",
            fontSize: "0.9rem",
            color: "#444",
          }}
        >
          <li>Uso ilimitado de la app.</li>
          <li>Estados de resultados mensuales y anuales.</li>
          <li>Presupuesto sugerido y editable por rubro.</li>
          <li>Flujo de caja para ver si te falta o sobra plata.</li>
          <li>Informe mensual explicado en lenguaje simple.</li>
          <li>Prioridad para consultas por mail.</li>
        </ul>
        <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" }}>
          Después de tus 30 días de prueba, podés seguir viendo tus datos
          gratis, pero para cargar nuevos comprobantes e históricos
          necesitás pasar al plan PRO.
        </p>
        <button
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 1rem",
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
          onClick={() => {
            window.open(
              "mailto:altiumfinanzas@altiumfinanzas.com?subject=Quiero%20pasar%20al%20Plan%20PRO&body=Hola,%20quiero%20activar%20el%20Plan%20PRO%20de%20Altium%20Finanzas.%20Estos%20son%20mis%20datos:",
              "_blank"
            );
          }}
        >
          Quiero pasar al Plan PRO
        </button>
      </div>


      {/* Consultoría personalizada */}
      <hr style={{ margin: "2rem 0" }} />
      <div
        style={{
          padding: "1rem",
          borderRadius: 8,
          border: "1px solid #ddd",
          backgroundColor: "#fafafa",
        }}
      >
        <h3>¿Querés ayuda para entender tus números?</h3>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Si te gustaría que alguien te acompañe a mirar estos informes y armar
          un plan para mejorar tu negocio, podés pedir una consultoría
          personalizada de Altium Finanzas.
        </p>
        <button
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1rem",
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => {
            window.open(
              "mailto:altiumfinanzas@altiumfinanzas.com?subject=Quiero%20una%20consultor%C3%ADa%20personalizada&body=Hola,%20quiero%20ayuda%20con%20los%20n%C3%BAmeros%20de%20mi%20negocio.",
              "_blank"
            );
          }}
        >
          Pedir consultoría personalizada
        </button>
      </div>
    </main>
  );
}
