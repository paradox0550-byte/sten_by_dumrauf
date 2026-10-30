import { LaborPlanRowSchema, type LaborPlanRow, type LaborRecordStatus } from './schema';
import type { ShiftLine } from '../imports/schema';
import { RolePassportSchema, type RolePassport } from '../roles/schema';

function key(value:string):string{return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[ё]/g,'е').replace(/\\s+/g,' ').trim();}

/** Joins imported shift facts with approved role passports without allocating monthly salary across shifts. */
export function buildLaborPlanRows(input:{
  shifts:ShiftLine[];
  rolePassports:RolePassport[];
  status:LaborRecordStatus;
  source:string;
  periodStart:string;
  periodEnd:string;
}):{rows:LaborPlanRow[];unmatchedPositions:string[]} {
  const passports=input.rolePassports.map(role=>RolePassportSchema.parse(role)).filter(role=>role.active);
  const byPosition=new Map(passports.map(role=>[key(role.positionName),role]));
  const rows:LaborPlanRow[]=[];
  const unmatched=new Set<string>();
  const monthlyEmployees=new Map<string,{role:RolePassport;employeeName:string;employeeId:string|null}>();
  for(const [index,shift] of input.shifts.entries()){
    const role=byPosition.get(key(shift.positionName));
    if(!role){unmatched.add(shift.positionName);continue;}
    const model=role.hourlyRate!=null?'hourly':role.salaryPerShift!=null?'per_shift':'monthly_salary';
    const pay={
      model,
      hourlyRate:role.hourlyRate,
      shiftRate:role.salaryPerShift,
      monthlySalary:role.monthlySalary,
      approvedAllowances:null,
      currency:'RUB',
    } as const;
    const parsed=LaborPlanRowSchema.safeParse({
      recordType:'shift',id:`shift:${shift.businessDate}:${shift.employeeName}:${shift.positionName}:${shift.sourceRow??index}`,
      businessDate:shift.businessDate,employeeId:null,employeeName:shift.employeeName,positionName:role.positionName,
      departmentId:null,departmentName:shift.zoneId,startTime:shift.startTime,endTime:shift.endTime,hours:shift.hours,
      pay,status:input.status,source:input.source,sourceRow:shift.sourceRow??null,
    });
    if(parsed.success)rows.push(parsed.data);
    if(model==='monthly_salary'){
      const employeeKey=`${key(shift.employeeName)}|${key(role.positionName)}`;
      monthlyEmployees.set(employeeKey,{role,employeeName:shift.employeeName,employeeId:null});
    }
  }
  // One explicit period obligation per employee/role; never repeat it on every shift.
  for(const [employeeKey,employee] of monthlyEmployees){
    const parsed=LaborPlanRowSchema.safeParse({
      recordType:'period_salary',id:`salary:${input.periodStart}:${employeeKey}`,businessDate:input.periodStart,
      employeeId:employee.employeeId,employeeName:employee.employeeName,positionName:employee.role.positionName,
      departmentId:null,departmentName:null,startTime:null,endTime:null,hours:null,
      pay:{model:'monthly_salary',hourlyRate:null,shiftRate:null,monthlySalary:employee.role.monthlySalary,
        approvedAllowances:null,currency:'RUB'},status:input.status,source:input.source,sourceRow:null,
    });
    if(parsed.success)rows.push(parsed.data);
  }
  return {rows,unmatchedPositions:[...unmatched].sort((a,b)=>a.localeCompare(b,'ru'))};
}
