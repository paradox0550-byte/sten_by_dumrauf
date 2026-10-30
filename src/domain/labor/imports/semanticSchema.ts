import { z } from 'zod';

export const SemanticFieldSchema = z.enum([
  'businessDate','periodStart','periodEnd','employeeId','employeeName','positionName','departmentName',
  'startTime','endTime','hourOfDay','hours','payModel','hourlyRate','shiftRate','monthlySalary','approvedAllowances',
  'itemName','categoryName','quantity','revenue','cost','checks','guests','paymentType','discountType','discountAmount',
  'writeOffReason','accountName','operationType','warehouseName','unitName','balance','unknown',
]);
export type SemanticField = z.infer<typeof SemanticFieldSchema>;
export type SemanticReportFamily = 'labor_schedule'|'labor_actual'|'sales_hourly'|'sales_mix'|'inventory_cost'|'write_offs'|'finance_postings'|'payments_discounts'|'unknown';
export type SemanticColumn = { index:number; sourceLabel:string; normalizedLabel:string; field:SemanticField; confidence:number; alternatives:SemanticField[]; confirmed:boolean };
export type SemanticImportPreview = { headerRowIndex:number; columns:SemanticColumn[]; family:SemanticReportFamily; familyConfidence:number; needsConfirmation:boolean; preservedUnknownColumns:string[]; warnings:string[] };
export type CanonicalRecord = { values:Partial<Record<SemanticField,unknown>>; extra:Record<string,unknown>; sourceRow:number; isTotalRow:boolean };

const aliases: Record<Exclude<SemanticField,'unknown'>,string[]> = {
 businessDate:['дата','учетный день','учётный день','день','дата смены','дата операции','date','business date','accounting date','дата документа'],
 periodStart:['начало периода','период с','с даты','period start','from date'],
 periodEnd:['конец периода','период по','по дату','period end','to date'],
 employeeId:['табельный номер','код сотрудника','id сотрудника','employee id','employee code'],
 employeeName:['сотрудник','фио','ф.и.о.','имя сотрудника','работник','employee','employee name','staff member','персонал'],
 positionName:['должность','позиция сотрудника','роль','position','job title','role'],
 departmentName:['подразделение','отдел','торговое предприятие','ресторан','цех','department','outlet','store','restaurant'],
 startTime:['начало смены','время начала','начало работы','приход','start time','shift start','clock in'],
 endTime:['окончание смены','конец смены','время окончания','уход','end time','shift end','clock out'],
 hourOfDay:['час открытия','час закрытия','час продажи','час','часовой интервал','hour of day','closing hour','opening hour','time interval'],
 hours:['отработано часов','часы работы','продолжительность смены','длительность смены','время работы','worked hours','labor hours','duration'],
 payModel:['система оплаты','модель оплаты','pay model','compensation type'],
 hourlyRate:['ставка в час','часовая ставка','руб час','руб/час','оплата за час','hourly rate','rate per hour'],
 shiftRate:['ставка за смену','оплата за смену','стоимость смены','shift rate','pay per shift'],
 monthlySalary:['оклад','оклад в месяц','месячный оклад','зарплата в месяц','monthly salary','monthly wage','salary per month'],
 approvedAllowances:['утвержденная надбавка','утверждённая надбавка','премия','доплата','allowance','bonus','additional pay'],
 itemName:['блюдо','название блюда','номенклатура','товар','продукт','dish','item name','product'],
 categoryName:['категория блюда','группа блюд','категория','группа','category','group','product group'],
 quantity:['количество блюд','количество','кол-во','qty','quantity','sold quantity'],
 revenue:['сумма со скидкой','сумма без скидки','сумма продаж','выручка','продажи','revenue','sales amount','net sales'],
 cost:['себестоимость','сумма себестоимости','cost','cogs','cost amount'],
 checks:['количество чеков','чеков','чеки','checks','orders','transactions'],
 guests:['количество гостей','гостей','гости','guests','covers'],
 paymentType:['вид оплаты','форма оплаты','payment type','tender'],
 discountType:['тип скидки','вид скидки','discount type'],
 discountAmount:['сумма скидки','размер скидки','discount amount','discount value'],
 writeOffReason:['причина списания','тип списания','основание списания','write-off reason'],
 accountName:['статья затрат','счет учета','счёт учета','статья','account name','expense item'],
 operationType:['тип операции','вид операции','operation type','transaction type'],
 warehouseName:['склад','место хранения','warehouse','storage'],
 unitName:['единица измерения','ед. изм.','ед изм','unit of measure'],
 balance:['остаток','остатки','баланс','stock balance','on hand'],
};
function norm(value:unknown):string {
 return String(value??'').normalize('NFKC').replace(/[\uFEFF\u00A0]/g,' ').toLocaleLowerCase('ru-RU')
 .replace(/[.,:;(){}]/g,' ').replace(/\[/g,' ').replace(/\]/g,' ').replace(/[\s/_-]+/g,' ').trim();
}
function match(label:string):{field:SemanticField;confidence:number;alternatives:SemanticField[]} {
 const n=norm(label); if(!n)return {field:'unknown',confidence:0,alternatives:[]};
 const matches:Array<{field:Exclude<SemanticField,'unknown'>;score:number}>=[];
 for(const [field,terms] of Object.entries(aliases) as Array<[Exclude<SemanticField,'unknown'>,string[]]>) {
  for(const term of terms){const t=norm(term);if(n===t)matches.push({field,score:1});else if(n.includes(t)||t.includes(n))matches.push({field,score:.78});}
 }
 const bestByField=new Map<Exclude<SemanticField,'unknown'>,number>();
 for(const item of matches){bestByField.set(item.field,Math.max(bestByField.get(item.field)??0,item.score));}
 const unique=[...bestByField].map(([field,score])=>({field,score})).sort((a,b)=>b.score-a.score);
 if(!unique.length)return {field:'unknown',confidence:0,alternatives:[]};
 const top=unique[0], collision=unique.find(x=>x.field!==top.field&&x.score>=top.score);
 if(collision)return {field:'unknown',confidence:.45,alternatives:unique.slice(0,4).map(x=>x.field)};
 return {field:top.field,confidence:top.score,alternatives:unique.slice(1,4).map(x=>x.field)};
}
function scoreHeader(row:unknown[]):number{return row.reduce<number>((s,v)=>s+(match(String(v??'')).confidence>=.78?1:0),0);}
function familyOf(fields:SemanticField[]):{family:SemanticReportFamily;confidence:number}{
 const has=(...xs:SemanticField[])=>xs.some(x=>fields.includes(x));
 if(has('employeeName','employeeId')&&has('positionName')&&has('hours','startTime','endTime'))return {family:has('startTime','endTime')?'labor_actual':'labor_schedule',confidence:.9};
 if(has('businessDate')&&has('revenue')&&has('hourOfDay'))return {family:'sales_hourly',confidence:.88};
 if(has('writeOffReason')&&has('quantity'))return {family:'write_offs',confidence:.86};
 if(has('itemName','categoryName')&&has('quantity')&&has('cost'))return {family:'inventory_cost',confidence:.86};
 if(has('paymentType','discountType','discountAmount')&&has('revenue'))return {family:'payments_discounts',confidence:.82};
 if(has('accountName','operationType')&&has('cost','revenue'))return {family:'finance_postings',confidence:.78};
 if(has('businessDate')&&has('revenue')&&(has('checks')||has('guests')))return {family:'sales_hourly',confidence:.78};
 if(has('itemName','categoryName')&&has('quantity','revenue'))return {family:'sales_mix',confidence:.78};
 return {family:'unknown',confidence:.2};
}
/** Recognize field meaning from actual column labels, independent of file/sheet name and column order. */
export function recognizeSemanticReport(matrix:unknown[][]):SemanticImportPreview {
 const candidates=matrix.slice(0,Math.min(matrix.length,40)).map((row,index)=>({row,index,score:scoreHeader(row)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 const candidate=candidates[0]??{row:[],index:0,score:0};
 const columns:SemanticColumn[]=candidate.row.map((cell,index)=>{const sourceLabel=String(cell??'').trim(),m=match(sourceLabel);return {index,sourceLabel,normalizedLabel:norm(sourceLabel),field:m.field,confidence:m.confidence,alternatives:m.alternatives,confirmed:false};});
 const fields=columns.filter(c=>c.field!=='unknown').map(c=>c.field), family=familyOf(fields);
 const preservedUnknownColumns=columns.filter(c=>c.field==='unknown'&&c.sourceLabel).map(c=>c.sourceLabel),warnings:string[]=[];
 if(candidate.score<2)warnings.push('Не удалось уверенно определить строку заголовков; подтвердите структуру отчёта.');
 if(columns.some(c=>c.confidence>0&&c.confidence<.8))warnings.push('Есть неоднозначные поля — проверьте сопоставление перед импортом.');
 if(family.family==='unknown'||family.confidence<.75)warnings.push('Семейство отчёта определено неуверенно; данные не направляются в расчёт до подтверждения.');
 return {headerRowIndex:candidate.index,columns,family:family.family,familyConfidence:family.confidence,needsConfirmation:warnings.length>0||preservedUnknownColumns.length>0,preservedUnknownColumns,warnings};
}
/** Forward-fill grouped dimensions but retain original row number and mark subtotal rows. */
export function mapSemanticRows(matrix:unknown[][],preview:SemanticImportPreview):CanonicalRecord[] {
 const previous:Partial<Record<SemanticField,unknown>>={},out:CanonicalRecord[]=[];
 const dimensions:SemanticField[]=['businessDate','periodStart','periodEnd','departmentName','employeeId','employeeName','positionName','categoryName','itemName'];
 for(let i=preview.headerRowIndex+1;i<matrix.length;i++){
  const row=matrix[i]??[],values:Partial<Record<SemanticField,unknown>>={},extra:Record<string,unknown>={};
  for(const c of preview.columns){const v=row[c.index];if(c.field==='unknown'){if(c.sourceLabel)extra[c.sourceLabel]=v??null;continue;}
   if(v!==undefined&&v!==null&&String(v).trim()!==''){values[c.field]=v;previous[c.field]=v;}
   else if(dimensions.includes(c.field)&&previous[c.field]!==undefined)values[c.field]=previous[c.field];
  }
  if(!Object.values(values).some(v=>v!==undefined&&v!==null&&String(v).trim()!=='')&&!Object.values(extra).some(v=>v!=null&&String(v).trim()!==''))continue;
  const texts=[...Object.values(values),...Object.values(extra)].map(v=>String(v??'').trim().toLocaleLowerCase('ru-RU'));
  const isTotalRow=texts.some(v=>/^(итого|всего|total|grand total|subtotal|итого за день|итого за период)$/.test(v));
  out.push({values,extra,sourceRow:i+1,isTotalRow});
 }
 return out;
}
