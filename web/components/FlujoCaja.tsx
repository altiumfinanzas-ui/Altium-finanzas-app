"use client";

import React, { useEffect, useState } from "react";

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

export default function FlujoCaja() {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1); // 1–12
  const [data, setData] = useState<IncomeStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/analytics/income-statement?year=${y}&month=${m}`
      );
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }
      const json = (await res.json()) as IncomeStatementResponse;
      setData(json);
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar el flujo de caja.");
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

  const entradas =
    data?.by_rubro.filter((l) => l.kind === "income") ?? [];
  const salidas =
    data?.by_rubro.filter((l) => l.kind === "expense") ?? [];

  const totalEntradas =
    data?.summary.income ?? entradas.reduce((acc, l) => acc + l.total, 0);
  const totalSalidas =
    data?.summary.expense ?? salidas.reduce((acc, l) => acc + l.total, 0);
  const flujoNeto = totalEntradas - totalSalidas;

  return (
    <div>
      <h2>Flujo de Caja</h2>

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

        <button onClick={handleRefresh}>Actualizar</button>
      </div>

      {loading && <p>Cargando flujo de caja...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && !loading && (
        <>
          <p>
            Período: <strong>{data.period}</strong>{" "}
            (comparado con <strong>{data.previous}</strong>)
          </p>

          {/* Resumen general */}
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              border: "1px solid #ddd",
              borderRadius: 6,
            }}
          >
            <p>
              Entradas de efectivo del período:{" "}
              <strong>
                {totalEntradas.toLocaleString("es-UY", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </p>
            <p>
              Salidas de efectivo del período:{" "}
              <strong>
                {totalSalidas.toLocaleString("es-UY", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              Flujo neto de caja:{" "}
              <strong
                style={{
                  color: flujoNeto >= 0 ? "green" : "crimson",
                }}
              >
                {flujoNeto.toLocaleString("es-UY", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </p>
          </div>

          {/* Detalle de entradas */}
          <h3 style={{ marginTop: "1.5rem" }}>Entradas de efectivo por rubro</h3>
          {entradas.length === 0 ? (
            <p>No hay entradas de efectivo en este período.</p>
          ) : (
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                marginTop: "0.5rem",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "left",
                    }}
                  >
                    Rubro
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "right",
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((l) => (
                  <tr key={`cf-in-${l.rubro}`}>
                    <td>{l.rubro}</td>
                    <td style={{ textAlign: "right" }}>
                      {l.total.toLocaleString("es-UY", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Detalle de salidas */}
          <h3 style={{ marginTop: "1.5rem" }}>Salidas de efectivo por rubro</h3>
          {salidas.length === 0 ? (
            <p>No hay salidas de efectivo en este período.</p>
          ) : (
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                marginTop: "0.5rem",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "left",
                    }}
                  >
                    Rubro
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "right",
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {salidas.map((l) => (
                  <tr key={`cf-out-${l.rubro}`}>
                    <td>{l.rubro}</td>
                    <td style={{ textAlign: "right" }}>
                      {l.total.toLocaleString("es-UY", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
