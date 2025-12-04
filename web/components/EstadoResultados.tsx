"use client";

import React, { useEffect, useState } from "react";
const API_BASE = "http://127.0.0.1:8000";


type RubroLine = {
  rubro: string;
  kind: "income" | "expense";
  neto: number;
  iva: number;
  total: number;
};

type Summary = {
  income: number;
  expense: number;
  margin: number;
  prev_income: number;
  prev_expense: number;
  prev_margin: number;
  mom_income_pct: number | null;
  mom_expense_pct: number | null;
  margin_pct: number | null;
};

type IncomeStatementResponse = {
  period: string;
  previous: string;
  by_rubro: RubroLine[];
  summary: Summary;
};

type Mode = "mensual" | "anual";

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

function formatMoney(n: number) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 2 });
}

function formatPct(p: number) {
  return p.toFixed(1).replace(".", ",") + "%";
}

export default function EstadoResultados() {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [mode, setMode] = useState<Mode>("mensual"); // 👈 nuevo: mensual/anual
  const [data, setData] = useState<IncomeStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- función que trae datos mensual o anual según "mode" ----
  const fetchData = async (y: number, m: number, mode: Mode) => {
    setLoading(true);
    setError(null);

    try {
      if (mode === "mensual") {
        // 🔹 MODO MENSUAL: igual que siempre
        const res = await fetch(
          `${API_BASE}/analytics/income-statement?year=${y}&month=${m}`
        );
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
        const json = (await res.json()) as IncomeStatementResponse;
        setData(json);
      } else {
        // 🔹 MODO ANUAL: pedimos los 12 meses y los sumamos acá
        const promises: Promise<IncomeStatementResponse | null>[] = [];
        for (let month = 1; month <= 12; month++) {
          const url = `${API_BASE}/analytics/income-statement?year=${y}&month=${month}`;
          const p = fetch(url)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          promises.push(p as Promise<IncomeStatementResponse | null>);
        }

        const results = await Promise.all(promises);
        const valid = results.filter(
          (r): r is IncomeStatementResponse => r !== null
        );

        // si no hay datos en ningún mes, dejamos algo vacío
        if (valid.length === 0) {
          setData({
            period: `${y}`,
            previous: `${y - 1}`,
            by_rubro: [],
            summary: {
              income: 0,
              expense: 0,
              margin: 0,
              prev_income: 0,
              prev_expense: 0,
              prev_margin: 0,
              mom_income_pct: null,
              mom_expense_pct: null,
              margin_pct: null,
            },
          });
          return;
        }

        // juntar todos los by_rubro de todos los meses
        const allLines = valid.flatMap((v) => v.by_rubro);

        // agrupar por rubro+kind
        const map = new Map<string, RubroLine>();
        for (const line of allLines) {
          const key = `${line.rubro}|${line.kind}`;
          const existing = map.get(key);
          if (existing) {
            existing.neto += line.neto;
            existing.iva += line.iva;
            existing.total += line.total;
          } else {
            map.set(key, { ...line });
          }
        }

        const by_rubro = Array.from(map.values());

        const income = by_rubro
          .filter((x) => x.kind === "income")
          .reduce((acc, x) => acc + x.total, 0);
        const expense = by_rubro
          .filter((x) => x.kind === "expense")
          .reduce((acc, x) => acc + x.total, 0);
        const margin = income - expense;

        const annualData: IncomeStatementResponse = {
          period: `${y}`, // ejemplo "2025"
          previous: `${y - 1}`, // solo informativo
          by_rubro,
          summary: {
            income,
            expense,
            margin,
            prev_income: 0,
            prev_expense: 0,
            prev_margin: 0,
            mom_income_pct: null,
            mom_expense_pct: null,
            margin_pct: income ? (margin / income) * 100 : null,
          },
        };

        setData(annualData);
      }
    } catch (e) {
      console.error(e);
      setError(
        "No se pudo obtener el estado de resultados para este período."
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(year, month, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, mode]);

  const handleRefresh = () => {
    fetchData(year, month, mode);
  };

  // --- Cálculo de ventas contado / crédito y gastos ---
  let ventasContado = 0;
  let ventasCredito = 0;
  let otrosIngresos = 0;
  let gastosPorRubro: RubroLine[] = [];
  let totalGastos = 0;

  if (data) {
    const ingresos = data.by_rubro.filter((l) => l.kind === "income");
    gastosPorRubro = data.by_rubro.filter((l) => l.kind === "expense");

    for (const l of ingresos) {
      const rubroLower = l.rubro.toLowerCase();
      if (rubroLower.includes("contado")) {
        ventasContado += l.total;
      } else if (
        rubroLower.includes("credito") ||
        rubroLower.includes("crédito")
      ) {
        ventasCredito += l.total;
      } else {
        otrosIngresos += l.total;
      }
    }

    for (const g of gastosPorRubro) {
      totalGastos += g.total;
    }
  }

  const totalIngresos = ventasContado + ventasCredito + otrosIngresos;
  const resultado = totalIngresos - totalGastos;

  return (
    <div>
      <h2>Estado de Resultados</h2>

      {/* Controles de período y modo */}
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

        {mode === "mensual" && (
          <label>
            Mes:{" "}
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
        )}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => setMode("mensual")}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: 4,
              border:
                mode === "mensual" ? "2px solid black" : "1px solid #ccc",
            }}
          >
            Mensual
          </button>
          <button
            onClick={() => setMode("anual")}
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: 4,
              border: mode === "anual" ? "2px solid black" : "1px solid #ccc",
            }}
          >
            Anual
          </button>
        </div>

        <button onClick={handleRefresh}>Actualizar</button>
      </div>

      {mode === "anual" && (
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Vista anual: se suman los 12 meses del año seleccionado.
        </p>
      )}

      {loading && <p>Cargando estado de resultados...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && !loading && (
        <>
          <p style={{ marginBottom: "0.75rem" }}>
            Período:{" "}
            <strong>
              {mode === "mensual"
                ? data.period
                : `Año ${data.period}`}{" "}
            </strong>
          </p>

          {/* Ingresos */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3>Ingresos</h3>
            {totalIngresos === 0 ? (
              <p>No hay ingresos registrados en este período.</p>
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
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "0.25rem" }}>Ventas contado</td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(ventasContado)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.25rem" }}>Ventas crédito</td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(ventasCredito)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.25rem" }}>Otros ingresos</td>
                    <td style={{ padding: "0.25rem", textAlign: "right" }}>
                      $ {formatMoney(otrosIngresos)}
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
                      $ {formatMoney(totalIngresos)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Gastos */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3>Gastos por rubro</h3>
            {totalGastos === 0 ? (
              <p>No hay gastos registrados en este período.</p>
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
                      Neto
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      IVA
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        borderBottom: "1px solid #ccc",
                        padding: "0.25rem",
                      }}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gastosPorRubro.map((g) => (
                    <tr key={`${g.rubro}-${g.kind}`}>
                      <td style={{ padding: "0.25rem" }}>{g.rubro}</td>
                      <td style={{ padding: "0.25rem", textAlign: "right" }}>
                        $ {formatMoney(g.neto)}
                      </td>
                      <td style={{ padding: "0.25rem", textAlign: "right" }}>
                        $ {formatMoney(g.iva)}
                      </td>
                      <td style={{ padding: "0.25rem", textAlign: "right" }}>
                        $ {formatMoney(g.total)}
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
                    <td />
                    <td />
                    <td
                      style={{
                        padding: "0.25rem",
                        textAlign: "right",
                        borderTop: "1px solid #ccc",
                        fontWeight: 600,
                      }}
                    >
                      $ {formatMoney(totalGastos)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Resultado */}
          <section>
            <h3>
              Resultado neto del{" "}
              {mode === "mensual" ? "período" : "año seleccionado"}
            </h3>
            <p>
              Resultado:{" "}
              <strong>
                $ {formatMoney(resultado)}{" "}
                {resultado > 0
                  ? "(ganancia)"
                  : resultado < 0
                  ? "(pérdida)"
                  : "(empate)"}
              </strong>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
