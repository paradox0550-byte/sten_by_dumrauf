export type PnlScale='RUB'|'THOUSAND'|'MILLION';

export type PnlDraftRow={
  id:string;
  article:string;
  plan?:number;
  fact?:number;
  source?:string;
  status?:string;
};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);

export function parseMoneyInput(value:string,scale:PnlScale):number|undefined{
  const raw=value.trim();
  if(!raw)return undefined;
  const normalized=raw.replace(/\s/g,'').replace(',','.');
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized))return undefined;
  const n=Number(normalized);
  if(!Number.isFinite(n))return undefined;
  const multiplier=scale==='MILLION'?1_000_000:scale==='THOUSAND'?1_000:1;
  return n*multiplier;
}

export function formatMoney(value?:number):string{
  return finite(value)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value)+' ₽':'—';
}

export function formatMoneyInput(value:number|undefined,scale:PnlScale):string{
  if(!finite(value))return '';
  const divisor=scale==='MILLION'?1_000_000:scale==='THOUSAND'?1_000:1;
  const display=value/divisor;
  return Number.isInteger(display)?String(display):display.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}

export function variance(plan?:number,fact?:number):number|undefined{
  return finite(plan)&&finite(fact)?fact-plan:undefined;
}

export function percent(part?:number,total?:number):number|undefined{
  return finite(part)&&finite(total)&&total!==0?part/total*100:undefined;
}
