"use client";

import React, { useState, useEffect } from "react";
import EstadoResultados from "../components/EstadoResultados";
import Presupuesto from "../components/Presupuesto";
import FlujoCaja from "../components/FlujoCaja";
import CargaManual from "../components/cargaManual";
import InformeMensual from "../components/InformeMensual";

type TabKey = "estado" | "presupuesto" | "flujo" | "manual" | "informe";

// API apuntando a Render (o env var)
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://altium-finanzas-app.onrender.com";

const TRIAL_DAYS = 60;
const TRIAL_KEY = "altium_trial_start";

// Helper para usar siempre el token del login
function authFetch(input: RequestInfo, init: RequestInit = {}) {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("altium_token")
      : null;

  const headers = new Headers(init.headers || {});

  // ✅ Si mandamos FormData, NO seteamos Content-Type
  if (init.body instanceof FormData) {
    headers.delete("Content-Type");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}


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
      const stored =
        typeof window !== "undefined"
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
    const lowerName = f.name.toLowerCase();
    const fd = new FormData();
    fd.append("file", f);

    try {
      let res: Response;

      if (lowerName.endsWith(".csv")) {
        res = await authFetch(`${API_BASE}/transactions/import-csv`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await authFetch(`${API_BASE}/documents/upload`, {
          method: "POST",
          body: fd,
        });
      }

      const text = await res.text();

      if (!res.ok) {
        resultados.push(`❌ Error subiendo ${f.name}: HTTP ${res.status} - ${text}`);
        continue;
      }

      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {}

      if (lowerName.endsWith(".csv")) {
        resultados.push(
          `✅ Histórico importado desde ${f.name}: ${json.message ?? "OK"} (importadas ${json.imported ?? "?"}, saltadas ${json.skipped ?? "?"})`
        );
      } else {
        resultados.push(
          `✅ Subido ${f.name}${json.document_id ? ` → doc ${json.document_id}` : ""}`
        );
      }
    } catch (err: any) {
      resultados.push(`❌ Error subiendo ${f.name}: ${err?.message ?? err}`);
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
            <strong>Estás usando la versión de prueba de Altium Finanzas.</strong>{" "}
            Te quedan{" "}
            <strong>
              {daysLeft} día{daysLeft === 1 ? "" : "s"}
            </strong>{" "}
            para usar todas las funciones sin límite.
            <br />
            Aprovechá este tiempo para cargar comprobantes, históricos y ver cómo
            está realmente tu negocio.
            <br />
            <br />
            Cuando termine la prueba vas a poder seguir entrando a mirar tus datos.
            Para seguir cargando nueva información podés pasarte al{" "}
            <strong>Plan PRO</strong>.
          </>
        ) : (
          <>
            <strong>Tu prueba gratuita de Altium Finanzas ya terminó.</strong>{" "}
            Podés seguir entrando a ver tus estados, presupuesto, flujo e informes,
            pero para seguir cargando nuevos comprobantes e históricos necesitás
            pasar al <strong>Plan PRO</strong> (u$s 9,99/mes).
            <br />
            Si te interesa, escribinos y lo coordinamos.
          </>
        )}
      </div>

      {/* HERO / LANDING SIMPLE */}
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          La manera simple de entender la plata de tu negocio.
        </h1>
        <p style={{ fontSize: "1rem", color: "#444", maxWidth: 700 }}>
          Altium Finanzas te muestra, en segundos, si tu negocio está ganando o
          perdiendo plata, qué gastos te están pesando y cómo podés mejorar mes a mes.
          Pensado para emprendedores, pequeños comercios y profesionales independientes.
          Sin planillas. Sin lenguaje de contador. En sencillo.
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
            Comenzar ahora
          </button>
          <span style={{ fontSize: "0.9rem", color: "#666" }}>
            Funciona desde la web y la podés usar desde el celular, sin instalar nada.
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
          <h2>¿Qué vas a lograr con Altium Finanzas?</h2>
          <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
            <li>
              Saber si tu negocio está ganando plata o no, sin hacer cuentas
              ni abrir planillas.
            </li>
            <li>
              Ver tus <strong>ingresos y gastos ordenados por rubro</strong> para
              entender dónde se va el dinero.
            </li>
            <li>
              Mirar tu <strong>flujo de caja</strong> y anticipar si te va a faltar
              o sobrar plata en el mes.
            </li>
            <li>
              Tener un <strong>presupuesto sugerido</strong> usando tus últimos meses
              como referencia.
            </li>
            <li>
              Recibir un <strong>informe mensual en lenguaje simple</strong>, con
              ideas concretas para mejorar tus resultados.
            </li>
            <li>
              Cargar comprobantes y planillas históricas sin pelearte con Excel.
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
          <h3>¿A quién le sirve?</h3>
          <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
            <li>Emprendedores y pequeños comercios que quieren ordenarse.</li>
            <li>Profesionales independientes que trabajan por su cuenta.</li>
            <li>
              Negocios que no llevan una contabilidad formal pero necesitan entender
              si están ganando plata.
            </li>
            <li>
              Personas que se cansaron de las planillas y quieren ver sus números
              “en criollo”.
            </li>
          </ul>
        </div>
      </section>

      {/* SECCIÓN: CÓMO FUNCIONA */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>¿Cómo funciona?</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>
            Cargás fotos o PDFs de tus comprobantes, o un archivo histórico
            en Excel/CSV con tus ventas y gastos.
          </li>
          <li>
            La app lee y organiza automáticamente tus ingresos y egresos
            por rubro y período.
          </li>
          <li>
            Ves tus <strong>estados, presupuesto y flujo de caja</strong> ya armados,
            sin fórmulas ni planillas.
          </li>
          <li>
            Leés un <strong>informe en lenguaje simple</strong> con los puntos
            clave del mes y sugerencias prácticas para mejorar.
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
          Pensado para dueños de pequeños negocios y profesionales
          independientes que quieren tener sus números claros sin vivir
          peleados con las planillas.
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
          <li>Flujo de caja para anticiparte a faltantes de plata.</li>
          <li>Presupuesto sugerido y editable por rubro.</li>
          <li>Informe mensual explicado en lenguaje simple.</li>
          <li>Soporte prioritario por mail.</li>
        </ul>
        <p
          style={{
            fontSize: "0.85rem",
            color: "#666",
            marginTop: "0.5rem",
          }}
        >
          Después de tus <strong>60 días de prueba gratuita</strong>, vas a poder
          seguir entrando a ver tus datos sin costo. Para seguir cargando nuevos
          comprobantes e históricos, podés pasarte al <strong>Plan PRO</strong>.
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

