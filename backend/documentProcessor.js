const XLSX=require('@e965/xlsx');
const zlib=require('zlib');
function norm(s){return String(s??'').normalize('NFC').toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gu,'')}
function text(v){if(v===null||v===undefined||v==='')return '';if(v instanceof Date)return v.toISOString().slice(0,10);return typeof v==='number'?String(v):String(v).trim()}
function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v!=='string')return null;const s=v.replace(/\u00a0/g,'').replace(/ /g,'').replace(/,/g,'.').replace(/[^0-9.\-]/g,'');return s&&Number.isFinite(Number(s))?Number(s):null}
// Лимиты против zip-bomb (H-7 из SECURITY_AUDIT_2026-10).
// MAX_ZIP_ENTRIES — сколько файлов может быть внутри архива.
// MAX_ZIP_TOTAL_BYTES — суммарный распакованный размер.
// MAX_ZIP_ENTRY_BYTES — размер одной распакованной записи.
const MAX_ZIP_ENTRIES = 500;
const MAX_ZIP_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;

function zipEntries(b) {
  const out = [];
  let p = 0;
  let totalUncompressed = 0;
  while (p + 30 <= b.length) {
    if (out.length >= MAX_ZIP_ENTRIES) throw new Error('ZIP archive contains too many entries');
    if (b.readUInt32LE(p) !== 0x04034b50) { p++; continue; }
    const m = b.readUInt16LE(p + 8);
    const cs = b.readUInt32LE(p + 18);
    const us = b.readUInt32LE(p + 22);
    const nl = b.readUInt16LE(p + 26);
    const el = b.readUInt16LE(p + 28);
    const name = b.subarray(p + 30, p + 30 + nl).toString('utf8');
    const start = p + 30 + nl + el;
    const d = b.subarray(start, start + cs);
    try {
      let x;
      if (m === 0) {
        if (us > MAX_ZIP_ENTRY_BYTES) throw new Error('ZIP entry too large: ' + name);
        x = d;
      } else if (m === 8) {
        const cap = Math.min(us > 0 ? us : MAX_ZIP_ENTRY_BYTES, MAX_ZIP_ENTRY_BYTES);
        x = zlib.inflateRawSync(d, { maxOutputLength: cap });
      } else {
        p = start + cs;
        continue;
      }
      totalUncompressed += x.length;
      if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) throw new Error('ZIP archive total uncompressed size exceeds limit');
      out.push({ name, data: x, size: us });
    } catch (err) {
      throw err;
    }
    p = start + cs;
  }
  return out;
}
function docxText(b){const e=zipEntries(b).find(x=>x.name==='word/document.xml');if(!e)throw new Error('DOCX: document.xml not found');return e.data.toString('utf8').replace(/<w:tab[^>]*\/>/g,'\t').replace(/<w:br[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim()}
const aliases={revenue:['выручка','доход','revenue','оборот'],cogs:['себестоимость','cogs','фудкост','закупки','продукты'],personnel:['фот','зарплата','payroll','персонал','фонд оплаты'],opex:['opex','операционные расходы','аренда','коммунальные'],depreciation:['амортизация'],interest:['проценты','кредиты'],tax:['налоги','налог'],other:['прочее','другое','other']};
function levenshtein(a,b){
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<=b.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
}
function classify(s){
  const k=norm(s);
  for(const [id,aa] of Object.entries(aliases))if(aa.some(a=>{const na=norm(a);return k===na||k.includes(na)}))return{id,confidence:1};
  let best=null;
  for(const [id,aa] of Object.entries(aliases))for(const a of aa){
    const na=norm(a);
    if(!na)continue;
    const d=levenshtein(k,na);
    if(d<=2&&(!best||d<best.distance))best={id,distance:d,confidence:Math.max(0,1-d/Math.max(k.length,na.length))};
  }
  return best;
}
function headerIndex(row,aa){for(let i=0;i<row.length;i++){const k=norm(text(row[i]));if(aa.some(a=>k===norm(a)||k.includes(norm(a))))return i}return -1}
function xlsxRows(b){const wb=XLSX.read(b,{type:'buffer',cellDates:true,raw:true}),out=[];for(const sheet of wb.SheetNames){const grid=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:null,raw:true});let h=-1,pc=-1,fc=-1;for(let i=0;i<Math.min(25,grid.length);i++){const r=grid[i]||[];const p=headerIndex(r,['план','plan','budget']),f=headerIndex(r,['факт','fact','actual']);if(p>=0||f>=0){h=i;pc=p;fc=f;break}}if(h<0){h=0;pc=1;fc=2}for(let i=h+1;i<grid.length;i++){const r=grid[i]||[];let li=-1,label='';for(let j=0;j<r.length;j++){const t=text(r[j]);if(t&&!/^[-+]?\d[\d\s,.]*$/.test(t)){li=j;label=t;break}}if(li<0)continue;const match=classify(label);const article=match?.id||'Требует уточнения';const requiresReview=!match||Number(match.confidence)<0.8;let plan=pc>=0?num(r[pc]):null,fact=fc>=0?num(r[fc]):null;if(plan===null&&fact===null){const ns=[];for(let j=li+1;j<r.length;j++){const n=num(r[j]);if(n!==null)ns.push(n)}plan=ns[0]??null;fact=ns[1]??(ns.length===1?ns[0]:null)}out.push({article,articleLabel:label,plan,fact,confidence:match?.confidence??0,requiresReview,source:'xlsx:'+sheet+':row-'+(i+1),sheet,row:i+1,sourceCellPlan:pc>=0?XLSX.utils.encode_cell({r:i,c:pc}):null,sourceCellFact:fc>=0?XLSX.utils.encode_cell({r:i,c:fc}):null})}}return out}
async function vision(b,mime,env){if(!env.YANDEXGPT_API_KEY||!env.YC_FOLDER_ID)throw new Error('Vision OCR not configured');const r=await fetch(env.VISION_OCR_URL||'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText',{method:'POST',headers:{Authorization:'Api-Key '+env.YANDEXGPT_API_KEY,'x-folder-id':env.YC_FOLDER_ID,'Content-Type':'application/json'},body:JSON.stringify({mimeType:mime||'image',languageCodes:['*'],model:'page',content:b.toString('base64')})});if(!r.ok)throw new Error('Vision OCR HTTP '+r.status);const j=await r.json(),blocks=j?.result?.textAnnotation?.blocks||j?.result?.blocks||[],lines=[];for(const bl of blocks)for(const l of bl.lines||[])if(l.text)lines.push(l.text);const s=lines.join('\n').trim();if(!s)throw new Error('Vision OCR returned empty text');return s}
async function process(buffer,name,mime,env){const ext=String(name).toLowerCase().split('.').pop()||'';if(['xlsx','xlsm','xls'].includes(ext)){const rows=xlsxRows(buffer);const wb=XLSX.read(buffer,{type:'buffer'});return{kind:'spreadsheet',text:JSON.stringify(rows),data:{rows,sheets:wb.SheetNames}}}if(ext==='docx')return{kind:'document',text:docxText(buffer),data:{format:'docx'}};if(['pdf','png','jpg','jpeg','webp','tiff','bmp'].includes(ext))return{kind:'ocr',text:await vision(buffer,mime||(ext==='pdf'?'application/pdf':'image/'+ext),env),data:{format:ext}};if(['csv','txt','md','json'].includes(ext))return{kind:'text',text:buffer.toString('utf8'),data:{format:ext}};throw new Error('Unsupported file format: .'+ext)}
module.exports={process,xlsxRows};