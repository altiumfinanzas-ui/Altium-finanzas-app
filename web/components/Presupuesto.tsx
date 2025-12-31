"use client";

import React, { useEffect, useState } from "react";

type PresupuestoLine = {
  rubro: string;
  kind: "income" | "expense";
  suggested?: number;
  monthly: number;
  annual: number;
};

type BudgetResponse = {
  period: string;
  window_months: number;
  from: string;
  to_exclusive: string;
  lines: PresupuestoLine[];
};

const monthNames = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://altium-finanzas-app.onrender.com";

// 👇 Igual que en page.tsx / CargaManual: helper con token
function authFetch(input: RequestInfo, init: RequestInit = {}) {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("altium_token")
      : null;

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

function formatMoney(n: number) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 2 });
}

export default function Presupuesto() {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `${API_BASE}/budget/suggest?year=${y}&month=${m}&window_months=6`
      );

      if (res.status === 401) {
        setError("Tu sesión expiró. Volvé a iniciar sesión.");
        // opcional: redirigir
        // window.location.href = "/login";
        setData(null);
        return;
      }

      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }

      const json = (await res.json()) as BudgetResponse;
      setData(json);
    } catch (e) {
      console.error(e);
      setError(
        "No se pudo calcular el presupuesto sugerido para este período."
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    fetchData(year, month);
  };

  // --- Cálculos de ingresos / ventas contado / ventas crédito ---
  let ventasContadoMensual = 0;
  let ventasCreditoMensual = 0;
  let otrosIngresosMensual = 0;
  let totalGastosMensual = 0;

  if (data) {
    const ingresos = data.lines.filter((l) => l.kind === "income");
    const gastos = data.lines.filter((l) => l.kind === "expense");

    for (const l of ingresos) {
      const rubroLower = l.rubro.toLowerCase();
      if (rubroLower.includes("contado")) {
        ventasContadoMensual += l.monthly;
      } else if (
        rubroLower.includes("credito") ||
        rubroLower.includes("crédito")
      ) {
        ventasCreditoMensual += l.monthly;
      } else {
        otrosIngresosMensual += l.monthly;
      }
    }

    for (const l of gastos) {
      totalGastosMensual += l.monthly;
    }
  }

  const ventasContadoAnual = ventasContadoMensual * 12;
  const ventasCreditoAnual = ventasCreditoMensual * 12;
  const otrosIngresosAnual = otrosIngresosMensual * 12;
  const totalIngresosMensual =
    ventasContadoMensual + ventasCreditoMensual + otrosIngresosMensual;
  const totalIngresosAnual = totalIngresosMensual * 12;
  const totalGastosAnual = totalGastosMensual * 12;
  const resultadoMensual = totalIngresosMensual - totalGastosMensual;
  const resultadoAnual = resultadoMensual * 12;

  return (
    <div>
      <h2>Presupuesto sugerido</h2>

      {/* Controles de período */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          margin: "0.75rem 0 1rem",
          flexWrap: "wrap",
        }}
      >
        <label>
          Año:{" "}
          <input
            type="number"
            value={year}
            onChange={(e) =>
              setYear(Number(e.target.value || today.getFullYear()))
            }
            style={{ width: 90 }}
          />
        </label>

        <label>
          Mes base:{" "}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {monthNames.map((name, idx) =>
              idx === 0 ? null : (
                <option key={idx} value={idx}>
                  {idx.toString().padStart(2, "0")} - {name}
                </option>
              )
            )}
          </select>
        </label>

        <button onClick={handleRefresh}>Actualizar presupuesto</button>
      </div>

      {loading && <p>Calculando presupuesto...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && !loading && !error && (
        <>
          <p style={{ marginBottom: "0.75rem" }}>
            Este presupuesto se arma usando el promedio de los últimos{" "}
            <strong>{data.window_months}</strong> meses de datos reales (
            {data.from} a {data.to_exclusive}).
          </p>

          {/* Ingresos estimados */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3>Ingresos estimados</h3>
            {totalIngresosMensual === 0 ? (
              <p>
                Por ahora no hay suficiente historial de ingresos para sugerir
                un presupuesto.
              </p>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginTop: "0.75rem",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Concepto
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Mensual
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Anual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "0.25rem" }}>Ventas contado</td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(ventasContadoMensual)}
                    </td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(ventasContadoAnual)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.25rem" }}>Ventas crédito</td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(ventasCreditoMensual)}
                    </td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(ventasCreditoAnual)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.25rem" }}>Otros ingresos</td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(otrosIngresosMensual)}
                    </td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(otrosIngresosAnual)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "0.25rem",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      Total ingresos
                    </td>
                    <td
                      style={{
                        padding: "0.25rem",
                        textAlign: "right",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      $ {formatMoney(totalIngresosMensual)}
                    </td>
                    <td
                      style={{
                        padding: "0.25rem",
                        textAlign: "right",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      $ {formatMoney(totalIngresosAnual)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Gastos estimados */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3>Gastos estimados por rubro</h3>
            {totalGastosMensual === 0 ? (
              <p>
                No hay historial suficiente de gastos para sugerir un
                presupuesto por rubro.
              </p>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginTop: "0.75rem",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Rubro
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Mensual
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Anual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines
                    .filter((l) => l.kind === "expense")
                    .map((l) => (
                      <tr key={`${l.rubro}-${l.kind}`}>
                        <td style={{ padding: "0.25rem" }}>{l.rubro}</td>
                        <td style={{ padding: "0.25rem", textAlign: "right" }}>
                          $ {formatMoney(l.monthly)}
                        </td>
                        <td style={{ padding: "0.25rem", textAlign: "right" }}>
                          $ {formatMoney(l.annual)}
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td
                      style={{
                        padding: "0.25rem",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      Total gastos
                    </td>
                    <td
                      style={{
                        padding: "0.25rem",
                        textAlign: "right",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      $ {formatMoney(totalGastosMensual)}
                    </td>
                    <td
                      style={{
                        padding: "0.25rem",
                        textAlign: "right",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      $ {formatMoney(totalGastosAnual)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Resultado estimado */}
          <section>
            <h3>Resultado estimado</h3>
            <p>
              Resultado mensual estimado:{" "}
              <strong>
                $ {formatMoney(resultadoMensual)}{" "}
                {resultadoMensual >= 0 ? "(ganancia)" : "(pérdida)"}
              </strong>
            </p>
            <p>
              Resultado anual estimado:{" "}
              <strong>
                $ {formatMoney(resultadoAnual)}{" "}
                {resultadoAnual >= 0 ? "(ganancia)" : "(pérdida)"}
              </strong>
            </p>
          </section>
        </>
      )}
    </div>
  );
}

