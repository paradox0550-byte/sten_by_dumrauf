import { z } from 'zod';

export const WorkModeSchema = z.enum(['flow', 'mixed', 'coverage']);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const RolePassportSchema = z.object({
  id: z.string().min(1),
  positionName: z.string().trim().min(1).max(120),
  workMode: WorkModeSchema,
  zoneIds: z.array(z.string().trim().min(1)).min(1),
  unitName: z.string().trim().min(1).max(40),
  minimumShiftHours: z.number().finite().nonnegative().nullable(),
  fixedHoursPerDay: z.number().finite().nonnegative().nullable(),
  hourlyRate: z.number().finite().nonnegative().nullable(),
  salaryPerShift: z.number().finite().nonnegative().nullable(),
  monthlySalary: z.number().finite().nonnegative().nullable(),
  productivityUnitsPerHour: z.number().finite().positive().nullable(),
  effortCoefficient: z.number().finite().positive().nullable(),
  active: z.boolean().default(true),
});
export type RolePassport = z.infer<typeof RolePassportSchema>;

export const ZoneDemandNormSchema = z.object({
  zoneId: z.string().min(1),
  unitsPerLaborHour: z.number().finite().positive().nullable(),
});
export type ZoneDemandNorm = z.infer<typeof ZoneDemandNormSchema>;

export const LaborConfigurationSchema = z.object({
  roles: z.array(RolePassportSchema),
  zoneDemandNorms: z.array(ZoneDemandNormSchema),
  coverageMinHoursByRole: z.record(z.string(), z.number().finite().nonnegative()),
});
export type LaborConfiguration = z.infer<typeof LaborConfigurationSchema>;
