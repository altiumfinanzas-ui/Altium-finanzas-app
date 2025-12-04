"use client";

import React, { useEffect, useMemo, useState } from "react";

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

function formatMoney(n: number) {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 2 });
}

function formatPct(p: number) {
  return p.toFixed(1).replace(".", ",") + "%";
}

export default function InformeMensual() {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
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
      setError("No se pudo generar el informe para este período.");
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

  const { resumen, recomendaciones } = useMemo(() => {
    if (!data) {
      return { resumen: [] as string[], recomendaciones: [] as string[] };
    }

    const s = data.summary;
    const ingresos = s.income;
    const gastos = s.expense;
    const margen = s.margin;
    const margenPct = s.margin_pct ?? null;
    const momIng = s.mom_income_pct ?? null;
    const momGto = s.mom_expense_pct ?? null;

    const gastosPorRubro = data.by_rubro.filter((l) => l.kind === "expense");
    const totalGastos = gastosPorRubro.reduce(
      (acc, l) => acc + (l.total || 0),
      0
    );
    const gastosOrdenados = [...gastosPorRubro].sort(
      (a, b) => b.total - a.total
    );
    const topGastos = gastosOrdenados.slice(0, 3).map((g) => ({
      ...g,
      pesoPct: totalGastos ? (g.total / totalGastos) * 100 : 0,
    }));

    const resumen: string[] = [];
    const recomendaciones: string[] = [];

    // 1) Cómo fue el mes en general
    if (margen > 0) {
      if ((margenPct || 0) >= 20) {
        resumen.push(
          `Este mes tu negocio generó una buena ganancia: ingresaron $ ${formatMoney(
            ingresos
          )} y salieron $ ${formatMoney(
            gastos
          )}, quedando un resultado positivo de $ ${formatMoney(
            margen
          )}. Es un margen cómodo para seguir creciendo.`
        );
      } else {
        resumen.push(
          `Este mes tu negocio ganó dinero, pero con un margen ajustado: ingresaron $ ${formatMoney(
            ingresos
          )} y salieron $ ${formatMoney(
            gastos
          )}, con una ganancia de $ ${formatMoney(
            margen
          )}. Hay espacio para mejorar la diferencia entre lo que entra y lo que sale.`
        );
      }
    } else if (margen < 0) {
      resumen.push(
        `Este mes tu negocio perdió plata: ingresaron $ ${formatMoney(
          ingresos
        )} y salieron $ ${formatMoney(
          gastos
        )}, lo que deja un resultado negativo de $ ${formatMoney(
          margen
        )}. Es una señal para tomar decisiones pronto.`
      );
    } else {
      resumen.push(
        "Este mes tu negocio quedó prácticamente en empate: lo que entró se fue en gastos, sin ganancia clara."
      );
    }

    if (margenPct != null) {
      if (margenPct >= 20) {
        resumen.push(
          `Tu margen sobre ventas fue de ${formatPct(
            margenPct
          )}, lo que es saludable para un pequeño negocio.`
        );
      } else if (margenPct >= 5) {
        resumen.push(
          `Tu margen sobre ventas fue de ${formatPct(
            margenPct
          )}. No está mal, pero sería ideal apuntar a un margen más alto para tener más “colchón”.`
        );
      } else {
        resumen.push(
          `El margen sobre ventas fue de solo ${formatPct(
            margenPct
          )}. Esto significa que casi todo lo que entra se va en gastos.`
        );
      }
    }

    // 2) Cambios vs mes anterior
    if (momIng != null) {
      if (momIng > 5) {
        resumen.push(
          `Las ventas subieron aproximadamente ${formatPct(
            momIng
          )} respecto al mes anterior. Es una buena señal, tratá de entender qué funcionó para repetirlo.`
        );
      } else if (momIng < -5) {
        resumen.push(
          `Las ventas bajaron aproximadamente ${formatPct(
            momIng
          )} respecto al mes anterior. Vale la pena revisar qué cambió: promociones, precios, atención al cliente o difusión.`
        );
      } else {
        resumen.push(
          "Las ventas se mantuvieron bastante parecidas al mes anterior, sin cambios grandes."
        );
      }
    }

    if (momGto != null) {
      if (momGto > 5) {
        resumen.push(
          `Los gastos crecieron unos ${formatPct(
            momGto
          )} vs el mes anterior. Es importante revisar en qué rubros aumentaron para ver si era necesario.`
        );
      } else if (momGto < -5) {
        resumen.push(
          `Los gastos bajaron alrededor de ${formatPct(
            momGto
          )} respecto al mes anterior. Buen trabajo controlando costos.`
        );
      } else {
        resumen.push(
          "Los gastos se mantuvieron en un nivel similar al mes pasado."
        );
      }
    }

    // 3) Principales gastos
    if (gastosPorRubro.length > 0) {
      if (topGastos.length === 1) {
        const g = topGastos[0];
        resumen.push(
          `Tu principal gasto del mes fue “${g.rubro}”, que representa aproximadamente ${formatPct(
            g.pesoPct
          )} de todos tus gastos.`
        );
      } else {
        const partes = topGastos.map(
          (g) => `"${g.rubro}" (${formatPct(g.pesoPct)})`
        );
        resumen.push(
          `Los gastos que más pesan en tu negocio este mes son: ${partes.join(
            ", "
          )}.`
        );
      }
    }

    // --- Recomendaciones ---

    if (margen < 0) {
      recomendaciones.push(
        "Definí un objetivo simple para el próximo mes: por ejemplo, que los ingresos sean al menos un 10% mayores que los gastos."
      );
      recomendaciones.push(
        "Elegí 1 o 2 rubros de gasto importantes y buscá formas concretas de reducirlos (negociar con proveedores, revisar consumos, ajustar stock, etc.)."
      );
    }

    if (margen > 0 && (margenPct || 0) < 10) {
      recomendaciones.push(
        "Tu negocio gana dinero, pero con margen chico. Revisá si tus precios están alineados con tus costos y con lo que cobra el mercado."
      );
      recomendaciones.push(
        "Analizá qué productos o servicios te dejan mejor ganancia y tratá de impulsarlos más (promociones, mejor exhibición, recomendar primero esos productos, etc.)."
      );
    }

    const gastoMuyPesado = topGastos.find((g) => g.pesoPct >= 30);
    if (gastoMuyPesado) {
      recomendaciones.push(
        `El gasto en “${gastoMuyPesado.rubro}” es muy alto (más del 30% de tus gastos). Vale la pena sentarte a revisarlo con calma y ver si podés bajar ese monto sin afectar demasiado el funcionamiento del negocio.`
      );
    }

    if (momIng != null && momIng < -10) {
      recomendaciones.push(
        "Las ventas vienen cayendo fuerte. Pensá en una acción simple para este mes: hablar con tus clientes actuales, ofrecer una promo a quienes ya te compran o mejorar tu presencia en redes."
      );
    }

    if (momGto != null && momGto > 10) {
      recomendaciones.push(
        "Los gastos están subiendo rápido. Identificá qué subió más y decidí si es un gasto que aporta valor o si se puede recortar o postergar."
      );
    }

    if (ingresos === 0 && gastos === 0) {
      resumen.push(
        "En este período no registraste ni ingresos ni gastos. Si el negocio está funcionando, asegurate de estar cargando todas las ventas y compras en el sistema."
      );
      recomendaciones.push(
        "Tomate 30 minutos para cargar al menos los movimientos principales del mes. Sin datos, es muy difícil tomar decisiones buenas."
      );
    }

    recomendaciones.push(
      "Elegí solo 1 o 2 acciones concretas de este informe para enfocarte este mes. No intentes cambiar todo a la vez: es mejor avanzar de a pasos simples pero constantes."
    );

    return { resumen, recomendaciones };
  }, [data]);

  return (
    <div>
      <h2>Informe mensual en lenguaje simple</h2>

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

        <button onClick={handleRefresh}>Actualizar informe</button>
      </div>

      {loading && <p>Generando informe...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && !loading && (
        <>
          <p style={{ marginBottom: "0.75rem" }}>
            Estás viendo el informe del período{" "}
            <strong>{data.period}</strong> (comparado con{" "}
            <strong>{data.previous}</strong>).
          </p>

          <section style={{ marginBottom: "1.5rem" }}>
            <h3>¿Qué está pasando en tu negocio este mes?</h3>
            {resumen.map((line, idx) => (
              <p key={idx} style={{ marginTop: "0.5rem" }}>
                {line}
              </p>
            ))}
          </section>

          <section>
            <h3>Recomendaciones prácticas para vos</h3>
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem" }}>
              {recomendaciones.map((r, idx) => (
                <li key={idx} style={{ marginTop: "0.4rem" }}>
                  {r}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

