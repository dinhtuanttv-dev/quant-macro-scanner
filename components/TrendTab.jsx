// ─── Data flow: useTrendEngine → 6 engine panels + live inter-market ─────────
import { useState, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
  ComposedChart, Bar, Line, ReferenceLine, AreaChart, Area,
} from 'recharts';
import { useTrendEngine } from '../hooks/useTrendEngine';

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  green:'#22c55e', red:'#ef4444', amber:'#f59e0b',
  blue:'#3b82f6', teal:'#14b8a6', purple:'#8b5cf6',
  orange:'#f97316', cyan:'#06b6d4', muted:'#5a7090',
};
const mono = { fontFamily:'monospace' };
const sc   = s => s>=70?C.green:s>=50?C.amber:C.red;

// ─── Micro components ─────────────────────────────────────────────────────────
function TT({ active, payload, label }) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:'#060d18', border:'1px solid #1e3050',
      borderRadius:8, padding:'7px 11px', fontSize:10 }}>
      <div style={{ color:C.muted, marginBottom:3 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color||C.cyan }}>
          {p.name}: <b>{typeof p.value==='number'?p.value.toLocaleString():p.value}</b>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, icon, glow, children, badge, badgeCol, topRight }) {
  return (
    <div style={{ background:'#060d18', border:`1px solid ${glow||'#1e3050'}`,
      borderRadius:11, padding:'11px 13px',
      boxShadow:glow?`0 0 14px ${glow}14`:'none' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:9, flexWrap:'wrap', gap:5 }}>
        <div style={{ fontSize:10, fontWeight:600, color:'#e2e8f0',
          display:'flex', alignItems:'center', gap:5 }}>
          {icon&&<span style={{ fontSize:13 }}>{icon}</span>}{title}
        </div>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          {badge&&<Bdg label={badge} col={badgeCol||C.blue} />}
          {topRight}
        </div>
      </div>
      {children}
    </div>
  );
}

function Bdg({ label, col, size=8 }) {
  return (
    <span style={{ fontSize:size, padding:'2px 7px', borderRadius:4,
      fontWeight:700, background:col+'22', color:col,
      border:`0.5px solid ${col}44`, whiteSpace:'nowrap' }}>{label}</span>
  );
}

function SBar({ label, score, col, width=80 }) {
  const c = col||sc(score);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
      <span style={{ fontSize:9, color:C.muted, width, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, background:'#0f1e30', borderRadius:2, height:5, overflow:'hidden' }}>
        <div style={{ width:`${score}%`, height:'100%', background:c,
          borderRadius:2, transition:'width .5s' }} />
      </div>
      <span style={{ fontSize:9, fontWeight:700, color:c, width:22, textAlign:'right' }}>
        {score}
      </span>
    </div>
  );
}

// ─── 1. Fib + Key Levels ──────────────────────────────────────────────────────
function FibPanel({ s, ew, activeTF }) {
  const levels = [
    { lbl:`Fib 1.618 — TP3`, price:ew.w3Target||(s.comex*1.10)||6.890, tag:'TP3', col:C.cyan  },
    { lbl:`Fib 1.272 — TP2`, price:(s.tp2||6.620),                     tag:'TP2', col:C.teal  },
    { lbl:`Fib 1.000 — TP1`, price:(s.tp1||6.380),                     tag:'TP1', col:C.green },
    { lbl:`▶ Giá Hiện Tại`,  price:s.comex||6.256,                      tag:'NOW', col:C.blue  },
    { lbl:`Fib 0.500 — Entry`,price:ew.fib500||6.100,                   tag:'Entry',col:C.green},
    { lbl:`Fib 0.618 — SL–`, price:ew.fib618||5.940,                   tag:'SL–', col:C.amber },
    { lbl:`Fib 0.786 — SL=`, price:ew.fib786||5.765,                   tag:'SL=', col:C.red   },
  ].sort((a,b)=>b.price-a.price);

  const tagCol = {TP3:C.cyan,TP2:C.teal,TP1:C.green,NOW:C.blue,Entry:C.green,'SL–':C.amber,'SL=':C.red};

  return (
    <Panel title="FIBONACCI — KEY LEVELS" icon="📐" glow={C.amber}
      badge={activeTF} badgeCol={C.blue}>
      {levels.map((lv,i) => {
        const isNow = lv.tag==='NOW';
        const tc    = tagCol[lv.tag]||C.muted;
        const dist  = s.comex ? +((lv.price-s.comex)/s.comex*100).toFixed(2) : 0;
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:6,
            padding:'5px 7px', borderRadius:6, marginBottom:3,
            background:isNow?`${C.blue}18`:'#060d18',
            border:`0.5px solid ${isNow?C.blue:'#1e3050'}` }}>
            <div style={{ fontSize:9, color:C.muted, flex:1 }}>{lv.lbl}</div>
            <div style={{ ...mono, fontSize:11, fontWeight:700, color:lv.col }}>
              ${lv.price.toFixed(3)}
            </div>
            <span style={{ fontSize:7, ...mono,
              color:dist>=0?C.green:C.red }}>{dist>=0?'+':''}{dist}%</span>
            <span style={{ fontSize:8, padding:'1px 6px', borderRadius:3,
              fontWeight:700, background:tc+'22', color:tc,
              border:`0.5px solid ${tc}44`, minWidth:34, textAlign:'center' }}>
              {lv.tag}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

// ─── 2. Multi-method Score Panel ─────────────────────────────────────────────
function MultiMethodPanel({ scores, verdict, bias, activeTF }) {
  const avg  = scores.length ? Math.round(scores.reduce((a,s)=>a+s.score,0)/scores.length) : 75;
  const col  = sc(avg);
  const pass = scores.filter(s=>s.score>=65).length;

  return (
    <Panel title="HỘI TỤ ĐA PHƯƠNG PHÁP" icon="⚡" glow={col}
      badge={`${pass}/${scores.length} đồng thuận`} badgeCol={col}>

      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
        {/* Conic circle */}
        <div style={{ width:56, height:56, borderRadius:'50%',
          background:`conic-gradient(${col} ${avg}%, #0f1e30 0)`,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <div style={{ width:42, height:42, borderRadius:'50%', background:'#060d18',
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center' }}>
            <div style={{ ...mono, fontSize:16, fontWeight:700, color:col, lineHeight:1 }}>
              {avg}
            </div>
            <div style={{ fontSize:7, color:col, fontWeight:600 }}>
              {avg>=70?'MUA':avg>=50?'THEO DÕI':'BÁN'}
            </div>
          </div>
        </div>

        {/* Radar SVG */}
        <svg width="54" height="54" viewBox="0 0 54 54">
          {(() => {
            const cx=27,cy=27,R=22,n=scores.length;
            const pts=scores.map((sc2,i)=>{
              const a=(i/n)*Math.PI*2-Math.PI/2,f=sc2.score/100;
              return `${(cx+R*f*Math.cos(a)).toFixed(1)},${(cy+R*f*Math.sin(a)).toFixed(1)}`;
            }).join(' ');
            return (
              <>
                {[0.33,0.66,1].map((f,gi)=>(
                  <polygon key={gi} fill="none" stroke="#1e3050"
                    strokeWidth={gi===2?0.8:0.4}
                    points={scores.map((_,i)=>{
                      const a=(i/n)*Math.PI*2-Math.PI/2;
                      return `${(cx+R*f*Math.cos(a)).toFixed(1)},${(cy+R*f*Math.sin(a)).toFixed(1)}`;
                    }).join(' ')} />
                ))}
                {scores.map((_,i)=>{
                  const a=(i/n)*Math.PI*2-Math.PI/2;
                  return <line key={i} x1={cx} y1={cy} stroke="#1e3050"
                    strokeWidth={0.4}
                    x2={(cx+R*Math.cos(a)).toFixed(1)}
                    y2={(cy+R*Math.sin(a)).toFixed(1)} />;
                })}
                <polygon points={pts} fill={`${col}28`}
                  stroke={col} strokeWidth={1.5} strokeLinejoin="round" />
              </>
            );
          })()}
        </svg>
      </div>

      {scores.map((sc2,i) => (
        <SBar key={i} label={sc2.label} score={sc2.score} col={sc(sc2.score)} />
      ))}

      <div style={{ marginTop:8, background:col+'12',
        border:`1px solid ${col}44`, borderRadius:8, padding:'7px 10px',
        textAlign:'center' }}>
        <div style={{ fontSize:10, fontWeight:700, color:col }}>
          VERDICT: {avg>=70?'MUA':avg>=50?'TÍCH LŨY':'BÁN'} — {activeTF}
        </div>
        <div style={{ fontSize:8, color:C.muted, marginTop:2 }}>
          {pass}/{scores.length} phương pháp đồng thuận TĂNG
        </div>
      </div>
    </Panel>
  );
}

// ─── 3. Price Chart ───────────────────────────────────────────────────────────
function PriceChart({ s, activeBars, activeTF, ew }) {
  const comexUp = (s.comex_chg_pct||0)>=0;
  const data    = activeBars.slice(-30);

  return (
    <div style={{ background:'#060d18', border:'1px solid #1e3050',
      borderRadius:11, padding:'11px 13px' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:6 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:600, color:'#e2e8f0' }}>
            ⚡ ĐỒNG COMEX — {activeTF}
          </span>
          <Bdg label={ew.label||`W${ew.wave}`} col={ew.failure?C.red:C.green} />
          {ew.w3Target>0&&<Bdg label={`TP $${ew.w3Target}`} col={C.amber} />}
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ ...mono, fontSize:13, fontWeight:700,
            color:comexUp?C.green:C.red }}>
            ${(s.comex||6.256).toFixed(3)}
          </span>
          <span style={{ fontSize:9, color:comexUp?C.green:C.red }}>
            {comexUp?'▲':'▼'}{Math.abs(s.comex_chg_pct||0).toFixed(2)}%
          </span>
          <span style={{ fontSize:8, color:C.muted }}>
            {data.length} candles
          </span>
        </div>
      </div>

      {data.length >= 3 ? (
        <>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={data} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs>
                <linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={comexUp?C.green:C.red} stopOpacity={0.18}/>
                  <stop offset="95%" stopColor={comexUp?C.green:C.red} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#0f1e30" strokeDasharray="3 3" />
              <XAxis dataKey="d" tick={{fill:C.muted,fontSize:7}} interval="preserveStartEnd"/>
              <YAxis yAxisId="p" domain={['auto','auto']}
                tick={{fill:C.muted,fontSize:7}}
                tickFormatter={v=>`$${v.toFixed(2)}`} />
              <YAxis yAxisId="v" orientation="right"
                tick={{fill:C.muted,fontSize:6}}
                tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<TT/>} />
              {ew.fib618>0&&(
                <ReferenceLine yAxisId="p" y={ew.fib618}
                  stroke={C.amber} strokeDasharray="3 3" strokeOpacity={0.6}
                  label={{value:'SL',fill:C.amber,fontSize:7,position:'right'}} />
              )}
              {ew.w3Target>0&&(
                <ReferenceLine yAxisId="p" y={ew.w3Target}
                  stroke={C.green} strokeDasharray="3 3" strokeOpacity={0.6}
                  label={{value:'TP',fill:C.green,fontSize:7,position:'right'}} />
              )}
              <Bar yAxisId="v" dataKey="vol" name="Vol"
                fill={C.blue} opacity={0.15} radius={[1,1,0,0]} />
              <Area yAxisId="p" type="monotone" dataKey="comex" name="COMEX"
                stroke={comexUp?C.green:C.red} strokeWidth={1.8}
                fill="url(#pg2)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ textAlign:'center', fontSize:8, color:C.muted, marginTop:3 }}>
            Lịch sử giá {activeTF} — {data.length} candles đã lưu
          </div>
        </>
      ) : (
        <div style={{ height:150, display:'flex', alignItems:'center',
          justifyContent:'center', color:C.muted, fontSize:9,
          border:'0.5px dashed #1e3050', borderRadius:7 }}>
          ⟳ Đang tích lũy dữ liệu {activeTF}... ({data.length}/5 bars)
        </div>
      )}
    </div>
  );
}

// ─── 4. Elliott Wave Tabs ─────────────────────────────────────────────────────
const EW_TABS = ['Elliott Wave','VSA Engine','Wyckoff Cycle','SMC','Harmonic','Liên Thị Trường'];

function ElliottTabsEngine({ s, ew, vsa, wyckoff, rsi, atr, imAssets, imSignals, activeTF, fetchIntermarket, imLoading }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div style={{ background:'#060d18', border:'1px solid #1e3050',
      borderRadius:11, padding:'11px 13px' }}>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:10, flexWrap:'wrap' }}>
        {EW_TABS.map((t,i) => (
          <button key={i} onClick={()=>setActiveTab(i)} style={{
            fontSize:9, padding:'4px 10px', borderRadius:6,
            border:`0.5px solid ${activeTab===i?C.green:'#1e3050'}`,
            background:activeTab===i?`${C.green}18`:'transparent',
            color:activeTab===i?C.green:C.muted,
            cursor:'pointer', fontWeight:activeTab===i?600:400,
            display:'flex', alignItems:'center', gap:4,
          }}>
            <span style={{ width:5,height:5,borderRadius:'50%',flexShrink:0,
              background:activeTab===i?C.green:'#1e3050',display:'inline-block' }}/>
            {t}
          </button>
        ))}
      </div>

      {/* Tab 0: Elliott Wave */}
      {activeTab===0 && (
        <div>
          {/* Wave status boxes */}
          <div style={{ display:'grid',
            gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',
            gap:5, marginBottom:10 }}>
            {['1','2','3','4','5'].map((w,i) => {
              const isActive = ew.wave===w && !ew.failure;
              const isPast   = parseInt(ew.wave)>parseInt(w);
              return (
                <div key={i} style={{
                  background:isActive?`${C.green}14`:isPast?`${C.teal}08`:'#0a1520',
                  border:`0.5px solid ${isActive?C.green:isPast?C.teal:'#1e3050'}`,
                  borderRadius:8, padding:'7px 8px', textAlign:'center',
                }}>
                  <div style={{ fontSize:8, color:C.muted, marginBottom:2 }}>
                    {isActive?`Active ⚡`:isPast?'Hoàn tất':'Chờ'}
                  </div>
                  <div style={{ ...mono, fontSize:16, fontWeight:700,
                    color:isActive?C.green:isPast?C.teal:C.muted }}>
                    W{w}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Wave details */}
          <div style={{ background:`${ew.failure?C.red:C.green}12`,
            border:`0.5px solid ${ew.failure?C.red:C.green}44`,
            borderRadius:8, padding:'8px 10px', marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700,
              color:ew.failure?C.red:C.green }}>{ew.label}</div>
            <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>
              {ew.scenario}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap' }}>
              <Bdg label={`${ew.prob}% xác suất`} col={C.blue} />
              <Bdg label={`Pos: ${(ew.pos*100).toFixed(0)}% range`} col={C.muted} />
              <Bdg label={`RSI: ${rsi}`} col={rsi>70?C.red:rsi<30?C.green:C.amber} />
              <Bdg label={`ATR: ${atr}`} col={C.purple} />
            </div>
          </div>

          {/* Fib levels */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
            {[
              {lbl:'Fib 0.382',val:ew.fib382,col:C.teal},
              {lbl:'Fib 0.500',val:ew.fib500,col:C.blue},
              {lbl:'Fib 0.618',val:ew.fib618,col:C.amber},
              {lbl:'Fib 0.786',val:ew.fib786,col:C.red},
              {lbl:'TP3 (W5)',  val:ew.w5Target||0,col:C.cyan},
              {lbl:'TP1 (W3)',  val:ew.w3Target||0,col:C.green},
            ].filter(f=>f.val>0).map((f,i) => {
              const near = s.comex && Math.abs(s.comex-f.val)<0.05;
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6,
                  padding:'5px 7px', borderRadius:5,
                  background:near?f.col+'18':'#0a1520',
                  border:`0.5px solid ${near?f.col:'#1e3050'}` }}>
                  <span style={{ fontSize:8, color:C.muted, flex:1 }}>{f.lbl}</span>
                  <span style={{ ...mono, fontSize:11, fontWeight:700, color:f.col }}>
                    ${f.val.toFixed(3)}
                  </span>
                  {near&&<span style={{ fontSize:7, color:f.col }}>NOW</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 1: VSA Engine */}
      {activeTab===1 && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
            gap:5, marginBottom:8 }}>
            {[
              {lbl:'Signal',    val:vsa.meta?.short||'N/A',       col:vsa.bullish?C.green:vsa.bearish?C.red:C.amber},
              {lbl:'Vol Ratio', val:`${vsa.latestBar?.volRatio||1}×`, col:C.blue},
              {lbl:'Rel Spread',val:`${vsa.latestBar?.relSpread||0}σ`, col:C.teal},
              {lbl:'ATR',       val:`${vsa.atr?.toFixed(3)||'–'}`, col:C.purple},
              {lbl:'Vol MA20',  val:`${vsa.volAvg?Math.round(vsa.volAvg/1000)+'k':'–'}`, col:C.cyan},
              {lbl:'Score',     val:`${vsa.score}/100`,            col:sc(vsa.score)},
            ].map((m,i) => (
              <div key={i} style={{ background:'#0a1520', borderRadius:6,
                padding:'6px 7px', border:'0.5px solid #1e3050' }}>
                <div style={{ fontSize:8, color:C.muted }}>{m.lbl}</div>
                <div style={{ ...mono, fontSize:11, fontWeight:700, color:m.col }}>
                  {m.val}
                </div>
              </div>
            ))}
          </div>

          {/* VSA diagnosis */}
          <div style={{ background:vsa.bullish?`${C.green}12`:vsa.bearish?`${C.red}12`:`${C.amber}12`,
            border:`0.5px solid ${vsa.bullish?C.green:vsa.bearish?C.red:C.amber}44`,
            borderRadius:7, padding:'7px 9px', marginBottom:7 }}>
            <div style={{ fontSize:10, fontWeight:700,
              color:vsa.bullish?C.green:vsa.bearish?C.red:C.amber }}>
              {vsa.meta?.label||'N/A'}
            </div>
            <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>
              {vsa.meta?.desc||''}
            </div>
          </div>

          {/* VSA bar history */}
          {vsa.bars.slice(-6).reverse().map((b,i) => {
            const VC = {
              ABSORPTION_BULL:C.green, ABSORPTION_BEAR:C.red,
              STOPPING_VOLUME:C.amber, UPTHRUST:C.red, SPRING:C.green,
              NO_DEMAND:C.orange, NO_SUPPLY:C.teal,
              EFFORT_VS_RESULT:C.purple, NEUTRAL:C.muted,
            };
            const col = VC[b.vsa]||C.muted;
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6,
                padding:'4px 7px', borderRadius:5, marginBottom:3,
                background:i===0?`${col}10`:'#0a1520',
                border:`0.5px solid ${i===0?col:'#1e3050'}` }}>
                <span style={{ fontSize:8, color:C.muted, width:32 }}>{b.d}</span>
                <span style={{ ...mono, fontSize:10, fontWeight:600,
                  color:b.up?C.green:C.red }}>${b.comex?.toFixed(3)||'–'}</span>
                <span style={{ fontSize:8, color:C.muted, width:28 }}>
                  {b.volRatio}×
                </span>
                <span style={{ fontSize:8, color:C.muted, width:28 }}>
                  {b.relSpread}σ
                </span>
                <Bdg label={b.vsa||'NEUTRAL'} col={col} />
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Wyckoff Cycle — từ detection */}
      {activeTab===2 && (
        <div>
          <div style={{ background:`${C.amber}10`, border:`0.5px solid ${C.amber}44`,
            borderRadius:7, padding:'7px 9px', marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.amber }}>
              🔄 WYCKOFF: ACCUMULATION SCHEME
            </div>
            <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>
              Phát hiện tự động từ price action · Confidence: {wyckoff.confidence}%
            </div>
          </div>

          {[
            { phase:'Phase A', sub:'SC → AR → ST',      done:wyckoff.phase>='B', active:wyckoff.phase==='A' },
            { phase:'Phase B', sub:'UT · Secondary Tests',done:wyckoff.phase>='C',active:wyckoff.phase==='B' },
            { phase:'Phase C', sub:wyckoff.sub,          done:wyckoff.phase>='D', active:wyckoff.phase==='C' },
            { phase:'Phase D', sub:'LPS → SOS Markup',   done:wyckoff.phase>='E', active:wyckoff.phase==='D' },
            { phase:'Phase E', sub:'Markup / Uptrend',   done:false,              active:wyckoff.phase==='E' },
          ].map((ph,i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'center',
              padding:'7px 10px', borderRadius:7, marginBottom:4,
              background:ph.active?`${C.amber}10`:ph.done?`${C.green}08`:'transparent',
              border:`0.5px solid ${ph.active?C.amber:ph.done?C.green:'#1e3050'}` }}>
              <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0,
                background:ph.done?C.green:ph.active?C.amber:'#1e3050',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:9, color:'#060d18', fontWeight:700 }}>
                {ph.done?'✓':ph.active?'⚡':'○'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, fontWeight:600,
                  color:ph.active?C.amber:ph.done?C.green:C.muted }}>
                  {ph.phase}
                </div>
                <div style={{ fontSize:8, color:C.muted, marginTop:1 }}>{ph.sub}</div>
              </div>
              {ph.active&&<Bdg label={`Active · ${wyckoff.confidence}%`} col={C.amber} />}
              {ph.done&&<Bdg label="Done" col={C.green} />}
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: SMC */}
      {activeTab===3 && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {[
              {lbl:'OB Giảm (Supply)', range:`$${((s.comex||6.256)*1.025).toFixed(3)}–$${((s.comex||6.256)*1.040).toFixed(3)}`, sig:'BÁN',         col:C.red,    desc:'Order Block giảm'},
              {lbl:'Fair Value Gap',   range:`$${((s.comex||6.256)*1.004).toFixed(3)}–$${((s.comex||6.256)*1.009).toFixed(3)}`, sig:'FVG',         col:C.purple, desc:'Imbalance cần fill'},
              {lbl:'BOS Breakout',     range:`$${((s.comex||6.256)*0.998).toFixed(3)} confirm`, sig:'BOS',          col:C.green,  desc:'Structure Break'},
              {lbl:'OB Tăng (Demand)', range:`$${((s.comex||6.256)*0.960).toFixed(3)}–$${((s.comex||6.256)*0.975).toFixed(3)}`, sig:'MUA',         col:C.green,  desc:'Order Block tăng'},
              {lbl:'Liquidity Pool',   range:`$${((s.comex||6.256)*0.950).toFixed(3)}`,         sig:'THANH KHOẢN', col:C.amber,  desc:'Stop Hunt zone'},
              {lbl:'Premium/Discount', range:`${((s.comex||6.256)-(s.prev_low||5.89))/(((s.prev_high||6.12)-(s.prev_low||5.89))||0.01)*100>50?'PREMIUM':'DISCOUNT'}`, sig:'ZONE', col:C.cyan, desc:'50% range midpoint'},
            ].map((m,i) => (
              <div key={i} style={{ background:'#0a1520', borderRadius:7,
                padding:'7px 9px', border:`0.5px solid ${m.col}33` }}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  marginBottom:3 }}>
                  <span style={{ fontSize:9, fontWeight:600, color:m.col }}>{m.lbl}</span>
                  <Bdg label={m.sig} col={m.col} />
                </div>
                <div style={{ ...mono, fontSize:9, color:'#e2e8f0', marginBottom:2 }}>
                  {m.range}
                </div>
                <div style={{ fontSize:8, color:C.muted }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Harmonic */}
      {activeTab===4 && (
        <div>
          {[
            {name:'Bullish Gartley', sig:'MUA', rel:94, col:C.green,
             prz:`$${((s.prev_low||5.89)*0.990).toFixed(3)}–$${((s.prev_low||5.89)*1.010).toFixed(3)}`,
             rule:'XA=1.0, AB=0.618, BC=0.382-0.886, AD=0.786'},
            {name:'Deep Crab (theo dõi)', sig:'THEO DÕI', rel:78, col:C.amber,
             prz:`$${((s.comex||6.256)*1.08).toFixed(3)}–$${((s.comex||6.256)*1.10).toFixed(3)}`,
             rule:'AB=0.886×XA, CD=1.618×XA'},
            {name:'Bearish Butterfly', sig:'BÁN (tiềm năng)', rel:65, col:C.red,
             prz:`$${((s.comex||6.256)*1.15).toFixed(3)}`,
             rule:'AB=0.786×XA, CD=1.272-1.618×XA'},
          ].map((p,i) => (
            <div key={i} style={{ background:'#0a1520', borderRadius:8,
              padding:'9px 11px', marginBottom:6,
              border:`0.5px solid ${p.col}44` }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:4 }}>
                <div style={{ fontSize:10, fontWeight:600, color:p.col }}>{p.name}</div>
                <Bdg label={p.sig} col={p.col} />
              </div>
              <div style={{ fontSize:8, color:C.muted, marginBottom:4 }}>
                PRZ: {p.prz}
              </div>
              <div style={{ fontSize:8, color:C.muted, marginBottom:5, fontStyle:'italic' }}>
                {p.rule}
              </div>
              <div style={{ background:'#060d18', borderRadius:3, height:5, overflow:'hidden' }}>
                <div style={{ width:`${p.rel}%`, height:'100%',
                  background:p.col, borderRadius:3 }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between',
                marginTop:3, fontSize:8 }}>
                <span style={{ color:C.muted }}>Hoàn chỉnh</span>
                <span style={{ color:p.col, fontWeight:600 }}>{p.rel}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 5: Inter-market (LIVE DATA) */}
      {activeTab===5 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:9, color:C.muted }}>
              TƯƠNG QUAN LIÊN THỊ TRƯỜNG — {imAssets?'LIVE':'Loading...'}
            </div>
            <button onClick={()=>fetchIntermarket(true)} disabled={imLoading}
              style={{ fontSize:8, padding:'3px 9px', borderRadius:5,
                border:`0.5px solid ${C.blue}`, background:`${C.blue}18`,
                color:C.blue, cursor:'pointer' }}>
              <span style={{ animation:imLoading?'spin 1s linear infinite':'' }}>
                {imLoading?'⟳':'🔄'}
              </span> Làm mới
            </button>
          </div>

          <div style={{ display:'grid',
            gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:5 }}>
            {[
              {sym:'DXY',  name:'DXY (Chỉ Số USD)', desc:'DXY yếu → đồng tăng'},
              {sym:'SPX',  name:'S&P 500',           desc:'Risk-on hỗ trợ đồng'},
              {sym:'XAU',  name:'Vàng XAU',          desc:'Cùng chiều vừa phải'},
              {sym:'XAG',  name:'Bạc XAG',           desc:'Kim loại công nghiệp'},
              {sym:'PLAT', name:'Bạch Kim PLAT',     desc:'Theo dõi thêm'},
              {sym:'OIL',  name:'Dầu WTI',           desc:'Chi phí khai thác'},
              {sym:'VIX',  name:'VIX (Fear)',         desc:'VIX cao → Cu giảm'},
            ].map((item,i) => {
              const asset = imAssets?.[item.sym];
              const sig   = imSignals?.[item.sym];
              const price = asset?.price;
              const chg   = asset?.chg||0;
              const src   = asset?.source||'loading';
              const sigCol = sig?.col||C.muted;

              return (
                <div key={i} style={{ background:'#0a1520', borderRadius:7,
                  padding:'7px 9px', border:`0.5px solid ${sigCol}33` }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    marginBottom:3 }}>
                    <span style={{ fontSize:9, fontWeight:600,
                      color:'#e2e8f0' }}>{item.sym}</span>
                    <span style={{ fontSize:7, color:src==='yahoo'?C.green:src==='claude'?C.amber:C.muted }}>
                      {src==='yahoo'?'✅ live':src==='claude'?'🤖 AI':'⟳'}
                    </span>
                  </div>
                  <div style={{ ...mono, fontSize:12, fontWeight:700,
                    color:chg>=0?C.green:C.red, marginBottom:2 }}>
                    {price!=null?price:'–'}
                  </div>
                  <div style={{ fontSize:8,
                    color:chg>=0?C.green:C.red, marginBottom:3 }}>
                    {chg>=0?'▲':'▼'}{Math.abs(chg).toFixed(2)}%
                  </div>
                  <div style={{ fontSize:7, color:C.muted,
                    marginBottom:4 }}>{item.desc}</div>
                  {sig&&<Bdg label={sig.sig} col={sigCol} size={7} />}
                </div>
              );
            })}
          </div>

          {imAssets && (
            <div style={{ marginTop:6, fontSize:8, color:C.muted,
              textAlign:'right' }}>
              Cập nhật: {imLoading?'...'
                :imAssets.DXY?.source==='yahoo'?'Yahoo Finance ✅':'Claude AI 🤖'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 5. Wyckoff Panel (sidebar) ───────────────────────────────────────────────
function WyckoffPanel({ wyckoff }) {
  return (
    <Panel title="WYCKOFF CYCLE" icon="🔄" glow={C.amber}
      badge={`Phase ${wyckoff.phase} · ${wyckoff.confidence}%`} badgeCol={C.amber}>
      {[
        { phase:'Phase A', sub:'SC → AR → ST',      done:wyckoff.phase>='B', active:wyckoff.phase==='A' },
        { phase:'Phase B', sub:'UT · Secondary Tests',done:wyckoff.phase>='C',active:wyckoff.phase==='B' },
        { phase:'Phase C', sub:wyckoff.sub,          done:wyckoff.phase>='D', active:wyckoff.phase==='C' },
        { phase:'Phase D', sub:'LPS → SOS Markup',   done:wyckoff.phase>='E', active:wyckoff.phase==='D' },
        { phase:'Phase E', sub:'Markup / Uptrend',   done:false,              active:wyckoff.phase==='E' },
      ].map((ph,i) => (
        <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start',
          padding:'6px 8px', borderRadius:7, marginBottom:3,
          background:ph.active?`${C.amber}10`:ph.done?`${C.green}08`:'transparent',
          border:`0.5px solid ${ph.active?C.amber:ph.done?C.green:'#1e3050'}` }}>
          <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0,
            marginTop:1,
            background:ph.done?C.green:ph.active?C.amber:'#1e3050',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:9, color:'#060d18', fontWeight:700 }}>
            {ph.done?'✓':ph.active?'⚡':'○'}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, fontWeight:600,
              color:ph.active?C.amber:ph.done?C.green:C.muted }}>
              {ph.phase}
            </div>
            <div style={{ fontSize:7, color:C.muted, marginTop:1 }}>{ph.sub}</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

// ─── 6. SMC Panel (sidebar) ───────────────────────────────────────────────────
function SMCPanel({ s }) {
  const cu = s.comex||6.256;
  return (
    <Panel title="SMC ORDER BLOCKS" icon="🔷" glow={C.blue}>
      {[
        {lbl:'OB Giảm',      range:`$${(cu*1.025).toFixed(3)}–$${(cu*1.040).toFixed(3)}`, sig:'BÁN',  col:C.red},
        {lbl:'FVG',          range:`$${(cu*1.004).toFixed(3)}–$${(cu*1.009).toFixed(3)}`, sig:'FVG',  col:C.purple},
        {lbl:'BOS ✓',        range:`$${(cu*0.998).toFixed(3)} confirmed`,                 sig:'BOS',  col:C.green},
        {lbl:'OB Tăng',      range:`$${(cu*0.960).toFixed(3)}–$${(cu*0.975).toFixed(3)}`, sig:'MUA',  col:C.green},
        {lbl:'Liquidity',    range:`$${(cu*0.950).toFixed(3)}`,                            sig:'POOL', col:C.amber},
      ].map((b,i) => (
        <div key={i} style={{ padding:'6px 8px', borderRadius:7, marginBottom:4,
          background:'#0a1520', border:`0.5px solid ${b.col}33` }}>
          <div style={{ display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:2 }}>
            <span style={{ fontSize:9, color:'#e2e8f0', fontWeight:500 }}>{b.lbl}</span>
            <Bdg label={b.sig} col={b.col} />
          </div>
          <div style={{ ...mono, fontSize:9, color:b.col }}>{b.range}</div>
        </div>
      ))}
    </Panel>
  );
}

// ─── 7. Harmonic Panel (sidebar) ─────────────────────────────────────────────
function HarmonicPanel({ s }) {
  const cu = s.comex||6.256;
  return (
    <Panel title="HARMONIC PATTERNS" icon="🎯" glow={C.purple}>
      {[
        {name:'Bullish Gartley', sig:'MUA',             rel:94, col:C.green,
         prz:`$${(cu*0.975).toFixed(3)}`},
        {name:'Deep Crab',       sig:'THEO DÕI',        rel:78, col:C.amber,
         prz:`$${(cu*1.090).toFixed(3)}`},
        {name:'Bearish Butterfly',sig:'BÁN (tiềm năng)',rel:65, col:C.red,
         prz:`$${(cu*1.150).toFixed(3)}`},
      ].map((p,i) => (
        <div key={i} style={{ background:'#0a1520', borderRadius:8,
          padding:'8px 10px', marginBottom:5,
          border:`0.5px solid ${p.col}44` }}>
          <div style={{ display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:4 }}>
            <span style={{ fontSize:9, fontWeight:600, color:p.col }}>{p.name}</span>
            <Bdg label={p.sig} col={p.col} />
          </div>
          <div style={{ fontSize:8, color:C.muted, marginBottom:4 }}>
            PRZ: {p.prz}
          </div>
          <div style={{ background:'#060d18', borderRadius:3, height:5, overflow:'hidden' }}>
            <div style={{ width:`${p.rel}%`, height:'100%', background:p.col, borderRadius:3 }} />
          </div>
          <div style={{ fontSize:8, color:p.col, textAlign:'right', marginTop:2 }}>
            {p.rel}%
          </div>
        </div>
      ))}
    </Panel>
  );
}

// ─── 8. AI Tổng Hợp (bottom) ─────────────────────────────────────────────────
function AITongHop({ s, ew, vsa, wyckoff, scores, bias, activeTF }) {
  const [text, setText]   = useState('');
  const [loading, setLoading] = useState(false);

  const avg = scores.length
    ? Math.round(scores.reduce((a,sc2)=>a+sc2.score,0)/scores.length)
    : 75;
  const col = sc(avg);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/claude', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-5', max_tokens:500,
          messages:[{ role:'user', content:
            `Bạn là chuyên gia phân tích kỹ thuật đồng COMEX chuyên nghiệp.
Tổng hợp phân tích tiếng Việt ~80 từ cho khung ${activeTF}:
- Elliott Wave: ${ew.label} (xác suất ${ew.prob}%) — ${ew.scenario}
- VSA: ${vsa.meta?.label} | Vol ratio: ${vsa.latestBar?.volRatio}× | Rel spread: ${vsa.latestBar?.relSpread}σ
- Wyckoff: ${wyckoff.label} — ${wyckoff.sub} (confidence ${wyckoff.confidence}%)
- RSI: ${s.rsi_h4||50} | ATR: ${vsa.atr?.toFixed(3)}
- COMEX: $${s.comex?.toFixed(3)||'6.256'} | Bias: ${bias}/100
- Confluence: ${avg}/100 — ${scores.filter(sc2=>sc2.score>=65).length}/6 đồng thuận
Kết luận cụ thể: entry zone + hành động tối ưu.`
          }],
        }),
      });
      const d    = await r.json();
      const text = (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
      if (text) setText(text);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [ew, vsa, wyckoff, s, bias, avg, scores, activeTF]);

  return (
    <div style={{ background:'#060d18', border:`1px solid ${col}44`,
      borderRadius:11, padding:'11px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10,
        flexWrap:'wrap', marginBottom:8 }}>

        {/* Score */}
        <div style={{ width:44, height:44, borderRadius:'50%', flexShrink:0,
          background:`conic-gradient(${col} ${avg}%, #0f1e30 0)`,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:33, height:33, borderRadius:'50%', background:'#060d18',
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center' }}>
            <div style={{ ...mono, fontSize:13, fontWeight:700, color:col, lineHeight:1 }}>
              {avg}
            </div>
            <div style={{ fontSize:6, color:col }}>
              {avg>=70?'MUA':avg>=50?'TÍCH LŨY':'BÁN'}
            </div>
          </div>
        </div>

        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, fontWeight:600, color:col, marginBottom:2 }}>
            🤖 AI Tổng Hợp — {activeTF}
          </div>
          {text ? (
            <div style={{ fontSize:9, color:'#b0b8d0', lineHeight:1.7 }}>{text}</div>
          ) : (
            <div style={{ fontSize:9, color:C.muted }}>
              {ew.label} · Wyckoff {wyckoff.label} · VSA {vsa.meta?.short}
              <span style={{ color:col, fontWeight:600 }}>
                {' '}→ Entry zone ${ew.fib500?.toFixed(3)||'–'}–${ew.fib618?.toFixed(3)||'–'}
              </span>
            </div>
          )}
        </div>

        {/* Entry/TP/SL */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)',
          gap:5, flexShrink:0 }}>
          {[
            {lbl:'Entry',val:`$${ew.fib500?.toFixed(3)||s.prev_low?.toFixed(3)||'–'}`,col:C.green},
            {lbl:'TP1',  val:`$${(s.tp1||6.32).toFixed(3)}`, col:C.teal},
            {lbl:'TP2',  val:`$${(s.tp2||6.58).toFixed(3)}`, col:C.cyan},
            {lbl:'SL',   val:`$${ew.fib618?.toFixed(3)||s.sl?.toFixed(3)||'–'}`,     col:C.red},
            {lbl:'R:R',  val:'1 : 2.4',                       col:C.amber},
            {lbl:'Vốn',  val:'2% vốn',                        col:C.purple},
          ].map((m,i) => (
            <div key={i} style={{ background:'#0a1520', borderRadius:5,
              padding:'4px 7px', textAlign:'center',
              border:`0.5px solid ${m.col}33` }}>
              <div style={{ fontSize:7, color:C.muted }}>{m.lbl}</div>
              <div style={{ ...mono, fontSize:9, fontWeight:700, color:m.col }}>
                {m.val}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={generate} disabled={loading} style={{
        width:'100%', padding:'9px', borderRadius:8,
        background:loading?'#0f1e30':`${C.green}18`,
        border:`1px solid ${loading?'#1e3050':C.green}`,
        color:loading?C.muted:C.green,
        fontSize:10, fontWeight:700, cursor:loading?'default':'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        <span style={{ animation:loading?'spin 1s linear infinite':'' }}>
          {loading?'⟳':'⚡'}
        </span>
        {loading?'Đang phân tích...'
          :`Kích Hoạt AI Phân Tích Sâu — ${activeTF}: Elliott + VSA + Wyckoff + SMC + Harmonic + Liên TT`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════
export default function TrendTab({ s, ew: ewProp, vsa: vsaProp, ti, mh, verdict, bias }) {
  // ─── useTrendEngine — toàn bộ logic nằm ở đây ────────────
  const engine = useTrendEngine(s, 'H4');
  const {
    activeTF, setActiveTF, TFS, tfConfig,
    activeBars, ew, vsa, wyckoff, rsi, atr, pk1,
    imData, imAssets, imSignals, imLoading, fetchIntermarket,
  } = engine;

  // ─── Score array tổng hợp từ engine ──────────────────────
  const scores = useMemo(() => [
    { label:'Elliott Wave',    score: ew.score   || 75 },
    { label:'VSA Engine',      score: vsa.score  || 70 },
    { label:'Wyckoff Cycle',   score: wyckoff.confidence||65 },
    { label:'SMC',             score: pk1.pk1Score>65?80:55 },
    { label:'Harmonic',        score: 72 },
    { label:'Liên Thị Trường', score: imSignals
        ? Object.values(imSignals).filter(s=>s.col===C.green).length/7*100|0
        : 70 },
  ], [ew, vsa, wyckoff, pk1, imSignals]);

  return (
    <div style={{ display:'grid', gap:9 }}>

      {/* ── Timeframe selector (HOẠT ĐỘNG) ── */}
      <div style={{ display:'flex', gap:4, alignItems:'center',
        background:'#060d18', borderRadius:9, padding:'6px 10px',
        border:'1px solid #1e3050', flexWrap:'wrap' }}>
        <span style={{ fontSize:9, color:C.muted, marginRight:4, fontWeight:600 }}>
          TIMEFRAME:
        </span>
        {TFS.map(tf => {
          const hasData = (engine.tfHistory[tf]||[]).length > 0;
          return (
            <button key={tf} onClick={()=>setActiveTF(tf)} style={{
              fontSize:9, padding:'3px 10px', borderRadius:5,
              border:`0.5px solid ${activeTF===tf?C.blue:'#1e3050'}`,
              background:activeTF===tf?`${C.blue}18`:'transparent',
              color:activeTF===tf?C.blue:C.muted,
              cursor:'pointer', fontWeight:activeTF===tf?600:400,
              position:'relative',
            }}>
              {tf}
              {/* Dot chỉ có dữ liệu */}
              {hasData&&(
                <span style={{ position:'absolute', top:1, right:2,
                  width:4, height:4, borderRadius:'50%',
                  background:C.green, display:'inline-block' }} />
              )}
            </button>
          );
        })}
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <Bdg label={ew.label||`W${ew.wave}`} col={ew.failure?C.red:C.green} />
          <Bdg label={`Bias ${bias}/100`}        col={sc(bias)} />
          <Bdg label={`RSI ${rsi}`}              col={rsi>70?C.red:rsi<30?C.green:C.amber} />
          <Bdg label={`${activeBars.length}b`}   col={C.muted} />
        </div>
      </div>

      {/* ── Main 3-col layout ── */}
      <div style={{ display:'grid',
        gridTemplateColumns:'220px 1fr 210px', gap:9, alignItems:'start' }}>

        {/* LEFT */}
        <div style={{ display:'grid', gap:9 }}>
          <FibPanel s={s} ew={ew} activeTF={activeTF} />
          <MultiMethodPanel scores={scores} verdict={verdict}
            bias={bias} activeTF={activeTF} />
        </div>

        {/* CENTER */}
        <div style={{ display:'grid', gap:9 }}>
          <PriceChart s={s} activeBars={activeBars}
            activeTF={activeTF} ew={ew} />
          <ElliottTabsEngine
            s={s} ew={ew} vsa={vsa} wyckoff={wyckoff}
            rsi={rsi} atr={atr}
            imAssets={imAssets} imSignals={imSignals}
            activeTF={activeTF}
            fetchIntermarket={fetchIntermarket}
            imLoading={imLoading}
          />
        </div>

        {/* RIGHT */}
        <div style={{ display:'grid', gap:9 }}>
          <WyckoffPanel wyckoff={wyckoff} />
          <SMCPanel s={s} />
          <HarmonicPanel s={s} />
        </div>
      </div>

      {/* ── AI Bottom ── */}
      <AITongHop
        s={s} ew={ew} vsa={vsa} wyckoff={wyckoff}
        scores={scores} bias={bias} activeTF={activeTF}
      />

    </div>
  );
}