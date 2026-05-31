import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function loadEnv(path){
  for (const line of readFileSync(path,'utf8').split(/\r?\n/)){
    const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')
  }
}
function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n]/.test(s) ? '"'+s.replaceAll('"','""')+'"' : s }
function toCsv(rows){ if(!rows.length) return ''; const keys=Object.keys(rows[0]); return [keys.join(','), ...rows.map(r=>keys.map(k=>csvEscape(r[k])).join(','))].join('\n')+'\n' }
async function fetchAll(sb, table, select, queryFn){
  let out=[]; for(let from=0;;from+=1000){ let q=sb.from(table).select(select).range(from, from+999); if(queryFn) q=queryFn(q); const {data,error}=await q; if(error) throw error; out.push(...(data??[])); if((data??[]).length<1000) break; } return out
}
loadEnv('/root/projects/inventory-logger/.env')
const sb=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const sessionIds=['eb6c9403-64d8-48b1-8507-323991159f19','c7784af2-6496-437b-975a-ea3b33cf58b9']
const scans=await fetchAll(sb,'slab_stocktake_reconciliation','*', q=>q.in('session_id', sessionIds).order('scanned_at',{ascending:true}))
const sessions=await fetchAll(sb,'slab_stocktake_sessions','id,name,location_hint,started_at,status', q=>q.in('id', sessionIds))
const bySession=Object.fromEntries(sessions.map(s=>[s.id,s]))
const summary={sessions:{}, overlap:0, totals:{scanRows:scans.length}}
const certSessionMap=new Map()
for(const row of scans){
  const s=bySession[row.session_id]
  const key=s?.location_hint ?? row.session_id
  summary.sessions[key] ??= {sessionId:row.session_id, name:s?.name, total:0, statusCounts:{}, psaMatched:0, slabMatched:0}
  const bucket=summary.sessions[key]
  bucket.total++; bucket.statusCounts[row.scan_status]=(bucket.statusCounts[row.scan_status]??0)+1
  if(row.psa_row_id) bucket.psaMatched++
  if(row.slab_id) bucket.slabMatched++
  const arr=certSessionMap.get(row.cert_number)??[]; arr.push(key); certSessionMap.set(row.cert_number, arr)
}
summary.overlap=[...certSessionMap.values()].filter(v=>new Set(v).size>1).length
const reportDir='/root/projects/inventory-logger/data/slab-stocktake-2026-05-31/reports'
mkdirSync(reportDir,{recursive:true})
const cols=['session','cert_number','scan_status','reconciliation_summary','psa_order_number','psa_description','psa_grade','slab_cert','slab_grading_company','slab_grade','sold_date','listed_date']
const mapped=scans.map(r=>({session:bySession[r.session_id]?.location_hint, ...Object.fromEntries(cols.slice(1).map(k=>[k,r[k]]))}))
writeFileSync(join(reportDir,'all_stocktake_reconciliation.csv'), toCsv(mapped))
for(const status of ['matched_psa_only','new_cert','sold_but_seen','matched_existing_slab']){
  writeFileSync(join(reportDir,`${status}.csv`), toCsv(mapped.filter(r=>r.scan_status===status)))
}
writeFileSync(join(reportDir,'summary.json'), JSON.stringify(summary,null,2))
console.log(JSON.stringify({summary, reportDir}, null, 2))
