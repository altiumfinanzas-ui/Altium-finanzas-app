"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://altium-finanzas-app.onrender.com";

function authFetch(input: RequestInfo, init: RequestInit = {}) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("altium_token") : null;

  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Si NO es FormData, seteamos JSON por defecto
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}

type RubroRow = {
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

  purchases?: number | null;
  initial_stock?: number | null;
  final_stock?: number | null;
  cogs?: number | null;
  gross_margin?: number | null;
  gross_margin_pct?: number | null;

  prev_income?: number | null;
  prev_expense?: number | null;
  prev_margin?: number | null;
  mom_income_pct?: number | null;
  mom_expense_pct?: number | null;
  margin_pct?: number | null;
};

type IncomeStatementResponse = {
  period: string;
  previous: string;
  by_rubro: RubroRow[];
  summary: Summary;
};

type StockResponse = {
  year: number;
  month: number;
  initial_stock: number | null;
  final_stock: number | null;
};

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: 2,
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value.toFixed(1) + " %";
}

export default function EstadoResultados() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [data, setData] = useState<IncomeStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stockInitial, setStockInitial] = useState<string>("");
  const [stockFinal, setStockFinal] = useState<string>("");
  const [stockMessage, setStockMessage] = useState<string>("");

  const periodLabel = `${month.toString().padStart(2, "0")}/${year}`;

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("altium_token") : null;

  const redirectToLogin = () => {
    try {
      localStorage.removeItem("altium_token");
    } catch {}
    window.location.href = "/login";
  };

  const loadAll = async () => {
    const token = getToken();
    if (!token) {
      // No hay sesión: no dispares requests protegidos.
      redirectToLogin();
      return;
    }

    setLoading(true);
    setError(null);
    setStockMessage("");

    try {
      const qs = `year=${year}&month=${month}`;

      // 1) EERR (con token)
      const res = await authFetch(`${API_BASE}/analytics/income-statement?${qs}`);

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Error al obtener estado de resultados: ${res.status} - ${text}`
        );
      }

      const json: IncomeStatementResponse = await res.json();
      setData(json);

      // 2) Stock (con token)
      const resStock = await authFetch(`${API_BASE}/stock?${qs}`);

      if (resStock.status === 401) {
        redirectToLogin();
        return;
      }

      if (resStock.ok) {
        const stockJson: StockResponse = await resStock.json();
        setStockInitial(
          stockJson.initial_stock !== null ? String(stockJson.initial_stock) : ""
        );
        setStockFinal(
          stockJson.final_stock !== null ? String(stockJson.final_stock) : ""
        );
      } else {
        setStockInitial("");
        setStockFinal("");
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "No se pudo cargar el estado de resultados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const handleSaveStock = async () => {
    const token = getToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    setLoadingStock(true);
    setStockMessage("");
    setError(null);

    try {
      const initial = parseFloat(stockInitial.replace(",", "."));
      const final = parseFloat(stockFinal.replace(",", "."));

      if (Number.isNaN(initial) || Number.isNaN(final)) {
        setStockMessage("Montos inválidos. Usa solo números.");
        return;
      }

      const qs = `year=${year}&month=${month}`;

      const res = await authFetch(`${API_BASE}/stock?${qs}`, {
        method: "POST",
        body: JSON.stringify({
          initial_stock: initial,
          final_stock: final,
        }),
      });

      if (res.status === 401) {
        redirectToLogin();
        return;
      }

      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (!res.ok) {
        console.error("Error guardando stock:", res.status, text);
        setStockMessage(
          json?.detail ||
            `Error al guardar stock: ${res.status} - ${
              text || "respuesta inválida"
            }`
        );
      } else {
        setStockMessage("Stock actualizado. Recalculando estado de resultados…");
        await loadAll();
        setStockMessage("Stock actualizado correctamente.");
      }
    } catch (err: any) {
      console.error("Error de red al guardar stock:", err);
      setStockMessage(
        "Error de red al guardar stock: " + (err?.message || "desconocido")
      );
    } finally {
      setLoadingStock(false);
    }
  };

  const summary = data?.summary;

  return (
    <div style={{ padding: "16px" }}>
      <h2 style={{ marginBottom: "8px" }}>Estado de Resultados</h2>
      <p style={{ marginTop: 0, marginBottom: "16px", color: "#555" }}>
        Período: <strong>{periodLabel}</strong>
      </p>

      {/* Filtros de periodo */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: "0.85rem" }}>Año</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value || "0", 10))}
            style={{ padding: "4px 8px", width: "100px" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem" }}>Mes</label>
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) =>
              setMonth(Math.min(12, Math.max(1, Number(e.target.value || 1))))
            }
            style={{ padding: "4px 8px", width: "80px" }}
          />
        </div>

        <button
          type="button"
          onClick={loadAll}
          style={{
            alignSelf: "flex-end",
            padding: "6px 12px",
            borderRadius: "4px",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Actualizar
        </button>
      </div>

      {loading && <p>Cargando estado de resultados…</p>}
      {error && <p style={{ color: "red", marginBottom: "12px" }}>{error}</p>}

      {/* Bloque de stock inicial / final */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "16px",
          background: "#f9fafb",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Stock de mercaderías</h3>

        <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#555" }}>
          Para calcular el <strong>costo de ventas</strong> se usa la fórmula:
          <br />
          <em>Existencia inicial + Compras – Existencia final.</em>
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "8px",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "0.85rem" }}>
              Existencia inicial
            </label>
            <input
              type="number"
              step="0.01"
              value={stockInitial}
              onChange={(e) => setStockInitial(e.target.value)}
              style={{ padding: "4px 8px", minWidth: "140px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem" }}>
              Existencia final
            </label>
            <input
              type="number"
              step="0.01"
              value={stockFinal}
              onChange={(e) => setStockFinal(e.target.value)}
              style={{ padding: "4px 8px", minWidth: "140px" }}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveStock}
            disabled={loadingStock}
            style={{
              alignSelf: "flex-end",
              padding: "6px 12px",
              borderRadius: "4px",
              border: "none",
              background: loadingStock ? "#9ca3af" : "#16a34a",
              color: "#fff",
              cursor: loadingStock ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {loadingStock ? "Guardando…" : "Guardar stock"}
          </button>
        </div>

        {stockMessage && (
          <p style={{ marginTop: "8px", fontSize: "0.85rem" }}>{stockMessage}</p>
        )}
      </div>

      {/* Resumen principal */}
      {summary && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Ventas</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.income)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Compras (Mercaderías)</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.purchases ?? null)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Existencia inicial</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.initial_stock ?? null)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Existencia final</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.final_stock ?? null)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Costo de ventas</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.cogs ?? null)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Resultado bruto</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.gross_margin ?? null)}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              {formatPercent(summary.gross_margin_pct ?? null)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Gastos totales</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.expense)}
            </div>
          </div>

          <div style={{ borderRadius: "8px", border: "1px solid #e5e7eb", padding: "10px" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              Resultado neto (Ingresos - Gastos)
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {formatCurrency(summary.margin)}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              Margen neto: {formatPercent(summary.margin_pct ?? null)}
            </div>
          </div>
        </div>
      )}

      {/* Detalle por rubro */}
      {data && (
        <div>
          <h3 style={{ marginTop: "8px" }}>Detalle por rubro</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "8px",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "4px" }}>
                  Rubro
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "4px" }}>
                  Tipo
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #e5e7eb", padding: "4px" }}>
                  Neto
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #e5e7eb", padding: "4px" }}>
                  IVA
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #e5e7eb", padding: "4px" }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.by_rubro.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "4px" }}>
                    {row.rubro}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "4px" }}>
                    {row.kind === "income" ? "Ingreso" : "Gasto"}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "4px", textAlign: "right" }}>
                    {formatCurrency(row.neto)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "4px", textAlign: "right" }}>
                    {formatCurrency(row.iva)}
                  </td>
                  <td style={{ borderBottom: "1px solid #f3f4f6", padding: "4px", textAlign: "right" }}>
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))}

              {data.by_rubro.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "8px", textAlign: "center" }}>
                    No hay movimientos en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
