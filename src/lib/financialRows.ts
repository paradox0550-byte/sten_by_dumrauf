export type FinancialRow={article:string;plan?:number|null;fact?:number|null;source?:string};

const aliases:Record<string,string>={
  revenue:'revenue',выручка:'revenue',
  cogs:'cogs',себестоимость:'cogs',
  payroll:'payroll',personnel:'payroll','фот':'payroll',
  opex:'opex','операционные расходы':'opex','операционные затраты':'opex',
  depreciation:'depreciation','амортизация':'depreciation',
  interest:'interest','проценты':'interest',
  tax:'tax','налоги':'tax',
  other:'other','прочее':'other',
};
const key=(v:string)=>v.normalize('NFC').trim().toLocaleLowerCase('ru-RU').replace(/[–—-]+/g,' ').replace(/\s+/g,' ');
export function canonicalArticleKey(article:string){const k=key(article);return aliases[k]||k}
export function canonicalArticleLabel(article:string){switch(canonicalArticleKey(article)){case'revenue':return'Выручка';case'cogs':return'Себестоимость';case'payroll':return'ФОТ';case'opex':return'OPEX';case'depreciation':return'Амортизация';case'interest':return'Проценты';case'tax':return'Налоги';case'other':return'Прочее';default:return article.trim()||'Без названия'}}
export function aggregateFinancialRows(rows:FinancialRow[]):FinancialRow[]{const map=new Map<string,FinancialRow>();for(const row of rows){const k=canonicalArticleKey(row.article);const prev=map.get(k);if(!prev){map.set(k,{article:canonicalArticleLabel(row.article),plan:typeof row.plan==='number'&&Number.isFinite(row.plan)?row.plan:null,fact:typeof row.fact==='number'&&Number.isFinite(row.fact)?row.fact:null,source:row.source});continue}prev.plan=typeof prev.plan==='number'&&typeof row.plan==='number'&&Number.isFinite(row.plan)?prev.plan+row.plan:null;prev.fact=typeof prev.fact==='number'&&typeof row.fact==='number'&&Number.isFinite(row.fact)?prev.fact+row.fact:null;if(row.source&&row.source!==prev.source)prev.source=[prev.source,row.source].filter(Boolean).join(',')}return [...map.values()]}
