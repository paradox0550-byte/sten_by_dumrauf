import type { CanonicalRecord } from '../imports/semanticSchema';
import { toCanonicalSalesLines } from '../imports/toCanonicalRecords';
import { forecastHourlyDemand } from './demandForecast';
import { recommendHourlyStaffing } from './recommendSchedule';

export function buildDemandScheduleDraft(input:{
  records:CanonicalRecord[];
  zoneByDepartment:Readonly<Record<string,string>>;
  effortUnitsByItem:Readonly<Record<string,number>>;
  productivityUnitsPerHourByZone:Readonly<Record<string,number|null>>;
  asOf?:string;
  minimumWeeks?:number;
  historyWeeks?:number;
}) {
  const imported=toCanonicalSalesLines(input.records,{
    zoneByDepartment:input.zoneByDepartment,
    effortUnitsByItem:input.effortUnitsByItem,
  });
  const forecast=forecastHourlyDemand(imported.records,{
    ...(input.asOf?{asOf:input.asOf}:{}),
    ...(input.minimumWeeks?{minimumWeeks:input.minimumWeeks}:{}),
    ...(input.historyWeeks?{historyWeeks:input.historyWeeks}:{}),
  });
  const staffing=forecast.status==='ready'
    ?recommendHourlyStaffing(forecast.cells,input.productivityUnitsPerHourByZone):[];
  return {salesLines:imported.records,importIssues:imported.issues,skippedRows:imported.skippedRows,forecast,staffing};
}
