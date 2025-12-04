'use client'
import { useEffect, useState } from 'react'

type Row = { rubro: string; kind: 'income'|'expense'; neto: number; iva: number; total: number }
type ApiResp = {
  period: string
  previous: string
  by_rubro: Row[]
  summary: {
    income: number; expense: number; margin: number;
    prev_income: number; prev_expense: number; prev_margin: number;
    mom_income_pct: number | null; mom_expense_pct: number | null; margin_pct: number | null;
  }
}

export default function EstadoPage(){
  const today = new Date()
  const [ym, setYm] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`)
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string| null>(null)

  const fetchData = async () => {
    try{
      setLoading(true); setError(null)
      const [y,m] = ym.split('-')
      const res = await fetch(`http://127.0.0.1:8000/analytics/income-statement?year=${y}&month=${m}`)
      if(!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      setData(json)
    }catch(e:any){
      setError(e.message || 'Error')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ fetchData() }, [])
  return (
    <main style={{padding:20, maxWidth:1100, margin:'0 auto'}}>
      <h1>Estado de Resultados</h1>
      <div style={{display:'flex', gap:8, alignItems:'center', margin:'12px 0'}}>
        <label>Periodo (YYYY-MM):</label>
        <input value={ym} onChange={e=> setYm(e.target.value)} style={{padding:6}} />
        <button onClick={fetchData} style={{padding:'6px 10px'}}>Actualizar</button>
      </div>

      {loading && <p>Cargando…</p>}
      {error && <p style={{color:'tomato'}}>Error: {error}</p>}

      {data && (
        <>
          <section style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
            <div style={{border:'1px solid #eee', borderRadius:8, padding:12}}>
              <h3>Ingresos</h3>
              <div style={{fontSize:22}}>${data.summary.income.toFixed(2)}</div>
              <small>Mes: {data.period}</small>
            </div>
            <div style={{border:'1px solid #eee', borderRadius:8, padding:12}}>
              <h3>Gastos</h3>
              <div style={{fontSize:22}}>${data.summary.expense.toFixed(2)}</div>
              <small>Vs. ant.: {data.summary.mom_expense_pct==null?'—':data.summary.mom_expense_pct.toFixed(1)+'%'}</small>
            </div>
            <div style={{border:'1px solid #eee', borderRadius:8, padding:12}}>
              <h3>Margen</h3>
              <div style={{fontSize:22}}>${data.summary.margin.toFixed(2)}</div>
              <small>Margen %: {data.summary.margin_pct==null?'—':data.summary.margin_pct.toFixed(1)+'%'}</small>
            </div>
          </section>

          <h3 style={{marginTop:20}}>Comparativo vs {data.previous}</h3>
          <ul>
            <li>Ingresos: actual ${data.summary.income.toFixed(2)} | previo ${data.summary.prev_income.toFixed(2)} | MoM: {data.summary.mom_income_pct==null?'—':data.summary.mom_income_pct.toFixed(1)+'%'}</li>
            <li>Gastos: actual ${data.summary.expense.toFixed(2)} | previo ${data.summary.prev_expense.toFixed(2)}</li>
            <li>Margen: actual ${data.summary.margin.toFixed(2)} | previo ${data.summary.prev_margin.toFixed(2)}</li>
          </ul>

          <h3>Detalle por rubro</h3>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{borderBottom:'1px solid #ccc', textAlign:'left'}}>Rubro</th>
                <th style={{borderBottom:'1px solid #ccc', textAlign:'left'}}>Tipo</th>
                <th style={{borderBottom:'1px solid #ccc', textAlign:'right'}}>Neto</th>
                <th style={{borderBottom:'1px solid #ccc', textAlign:'right'}}>IVA</th>
                <th style={{borderBottom:'1px solid #ccc', textAlign:'right'}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.by_rubro.map((r, i)=>(
                <tr key={i}>
                  <td style={{borderBottom:'1px solid #eee'}}>{r.rubro}</td>
                  <td style={{borderBottom:'1px solid #eee'}}>{r.kind}</td>
                  <td style={{borderBottom:'1px solid #eee', textAlign:'right'}}>{r.neto.toFixed(2)}</td>
                  <td style={{borderBottom:'1px solid #eee', textAlign:'right'}}>{r.iva.toFixed(2)}</td>
                  <td style={{borderBottom:'1px solid #eee', textAlign:'right'}}>{r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
