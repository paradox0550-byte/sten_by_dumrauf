import * as XLSX from 'xlsx';

export type ScheduleMatrixResult = {
  headerRowIndex: number;
  employeeColumn: number;
  positionColumn: number | null;
  dateColumns: Array<{ index: number; businessDate: string }>;
  rows: Array<{
    businessDate: string; employeeName: string; positionName: string | null; rawValue: unknown;
    hours: number | null; startTime: string | null; endTime: string | null;
    sourceRow: number; sourceColumn: number;
  }>;
  warnings: string[];
};
function dateFromHeader(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
  if (typeof value === 'number') {
    const parsed=XLSX.SSF.parse_date_code(value);
    if(parsed?.y&&parsed.m&&parsed.d)return [parsed.y,String(parsed.m).padStart(2,'0'),String(parsed.d).padStart(2,'0')].join('-');
  }
  const text=String(value??'').trim();
  let m=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)return [Number(m[1]),Number(m[2]),Number(m[3])].map((v,i)=>String(v).padStart(i===0?4:2,'0')).join('-');
  m=text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if(!m)return null;
  const day=Number(m[1]),month=Number(m[2]),year=Number(m[3]),d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day
    ? [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-'):null;
}
function normalize(value: unknown): string {
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[.]/g,'').replace(/[\s_-]+/g,' ').trim();
}
export type ScheduleCell =
  | { kind: 'hours'; hours: number; raw: string }
  | { kind: 'shift'; hours: 12; raw: string }
  | { kind: 'dayOff'; raw: string }
  | { kind: 'salary'; raw: string }
  | { kind: 'empty'; raw: '' }
  | { kind: 'unknown'; raw: string };

export function parseScheduleCell(value: unknown): ScheduleCell {
  if (value == null || String(value).trim() === '') return { kind: 'empty', raw: '' };
  const raw = String(value).trim();
  const text = normalize(raw);
  if (/^(в|вых|выходной|выходн|off|day off)$/.test(text)) return { kind: 'dayOff', raw };
  if (/^(оклад|salary)$/.test(text)) return { kind: 'salary', raw };
  if (/^(смена|см|shift)$/.test(text)) return { kind: 'shift', hours: 12, raw };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value <= 24 ? { kind: 'hours', hours: value, raw }
      : { kind: 'unknown', raw };
  }
  const numeric = raw.match(/^(\d{1,2}(?:[.,]\d+)?)\\s*(?:ч|час(?:а|ов)?|h|hrs?)?$/i);
  if (numeric) {
    const hours = Number(numeric[1].replace(',', '.'));
    if (hours > 0 && hours <= 24) return { kind: 'hours', hours, raw };
  }
  const range = raw.match(/(\d{1,2}):(\d{2})\\s*[-–—]\\s*(\d{1,2}):(\d{2})/);
  if (range) {
    const sh = Number(range[1]), sm = Number(range[2]), eh = Number(range[3]), em = Number(range[4]);
    if (sh <= 23 && eh <= 23 && sm <= 59 && em <= 59) {
      let minutes = eh * 60 + em - (sh * 60 + sm);
      if (minutes <= 0) minutes += 1440;
      return { kind: 'hours', hours: minutes / 60, raw };
    }
  }
  return { kind: 'unknown', raw };
}

function parseShiftValue(value: unknown): { hours: number | null; startTime: string | null; endTime: string | null; ambiguous: boolean } {
  const common = parseScheduleCell(value);
  if (common.kind === 'hours') {
    const range = common.raw.match(/(\d{1,2}):(\d{2})\\s*[-–—]\\s*(\d{1,2}):(\d{2})/);
    if (range) return { hours: common.hours, startTime: `${String(Number(range[1])).padStart(2,'0')}:${range[2]}`, endTime: `${String(Number(range[3])).padStart(2,'0')}:${range[4]}`, ambiguous: false };
    return { hours: common.hours, startTime: null, endTime: null, ambiguous: false };
  }
  if (common.kind === 'shift') return { hours: common.hours, startTime: null, endTime: null, ambiguous: false };
  if (common.kind === 'empty' || common.kind === 'dayOff' || common.kind === 'salary') return { hours: null, startTime: null, endTime: null, ambiguous: false };
  return { hours: null, startTime: null, endTime: null, ambiguous: true };
}


/** Detect matrix-style rota exports with employees in rows and dates in columns. */
export function parseScheduleMatrix(matrix: unknown[][]): ScheduleMatrixResult | null {
  const limit=Math.min(matrix.length,30);
  let best:{index:number;employeeColumn:number;positionColumn:number|null;dateColumns:Array<{index:number;businessDate:string}>;score:number}|null=null;
  for(let r=0;r<limit;r++){
    const header=matrix[r]??[];
    const employeeColumn=header.findIndex(v=>['сотрудник','фио','работник','имя сотрудника','employee','employee name'].includes(normalize(v)));
    if(employeeColumn<0)continue;
    const position=header.findIndex(v=>['должность','позиция','роль','position','job title'].includes(normalize(v)));
    const dateColumns=header.map((value,index)=>({index,businessDate:dateFromHeader(value)})).filter((x):x is {index:number;businessDate:string}=>x.businessDate!==null);
    const score=dateColumns.length+(position>=0?1:0);
    if(dateColumns.length&&(!best||score>best.score))best={index:r,employeeColumn,positionColumn:position>=0?position:null,dateColumns,score};
  }
  if(!best)return null;
  const rows:ScheduleMatrixResult['rows']=[],warnings:string[]=[];
  for(let r=best.index+1;r<matrix.length;r++){
    const source=matrix[r]??[],employeeName=String(source[best.employeeColumn]??'').trim();
    if(!employeeName||/^(итого|всего|total|grand total)$/i.test(employeeName))continue;
    const rawPosition=best.positionColumn==null?null:String(source[best.positionColumn]??'').trim()||null;
    for(const col of best.dateColumns){
      const rawValue=source[col.index],rawText=String(rawValue??'').trim();
      if(rawValue==null||rawText===''||/^(в|вых|выходной|off|day off)$/i.test(rawText))continue;
      const parsed=parseShiftValue(rawValue);
      if(parsed.ambiguous)warnings.push(`Строка ${r+1}, колонка ${col.index+1}: значение графика не распознано как часы или интервал; сохранено без расчёта.`);
      rows.push({businessDate:col.businessDate,employeeName,positionName:rawPosition,rawValue,hours:parsed.hours,startTime:parsed.startTime,endTime:parsed.endTime,sourceRow:r+1,sourceColumn:col.index+1});
    }
  }
  return {headerRowIndex:best.index,employeeColumn:best.employeeColumn,positionColumn:best.positionColumn,dateColumns:best.dateColumns,rows,warnings:[...new Set(warnings)]};
}
