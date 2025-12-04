"use client";

import React, { useState } from "react";

type Kind = "income" | "expense";

export default function CargaManual() {
  const [date, setDate] = useState<string>("");
  const [kind, setKind] = useState<Kind>("income");
  const [rubro, setRubro] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [total, setTotal] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("");

    if (!date || !rubro || !total) {
      setStatus("Por favor completá fecha, rubro y monto.");
      return;
    }

    const monto = Number(
      total.replace(".", "").replace(",", ".")
    );

    if (isNaN(monto) || monto <= 0) {
      setStatus("El monto debe ser un número mayor a cero.");
      return;
    }

    try {
      const res = await fetch(
        "http://127.0.0.1:8000/transactions/manual",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date,
            kind,
            rubro,
            description: description || null,
            total: monto,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }

      const json = await res.json();
      setStatus(
        `Transacción guardada correctamente (id ${json.id}).`
      );

      // limpiar formulario
      setRubro("");
      setDescription("");
      setTotal("");
    } catch (err) {
      console.error(err);
      setStatus(
        "No se pudo guardar la transacción. Verificá que el backend esté corriendo."
      );
    }
  };

  return (
    <div>
      <h2>Carga manual de ingresos y gastos</h2>
      <p style={{ marginBottom: "0.75rem" }}>
        Usá este formulario cuando no tengas un comprobante para
        subir, o quieras registrar un movimiento a mano.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: "0.75rem",
          maxWidth: 420,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Tipo de movimiento
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="income">Ingreso</option>
            <option value="expense">Gasto</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Rubro
          <input
            type="text"
            placeholder="Ventas, Alquiler, Compras, Sueldos..."
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Descripción (opcional)
          <input
            type="text"
            placeholder="Detalle del movimiento"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Monto total (con IVA)
          <input
            type="text"
            placeholder="Ej: 12345,67"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>

        <button type="submit">Guardar movimiento</button>
      </form>

      {status && (
        <p style={{ marginTop: "0.75rem" }}>
          <strong>{status}</strong>
        </p>
      )}
    </div>
  );
}
