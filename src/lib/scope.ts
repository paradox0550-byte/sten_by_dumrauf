export type ScopeType='project'|'branch'|'restaurant'|'department';

export type Scope={
  projectId?:string;
  branchId?:string;
  restaurantId?:string;
  departmentId?:string;
  period:string;
};

export const DEFAULT_PERIOD=new Date().toISOString().slice(0,7);

export function scopeQuery(scope:Scope):string{
  const q=new URLSearchParams();
  q.set('period',scope.period);
  if(scope.projectId)q.set('project_id',scope.projectId);
  if(scope.branchId)q.set('branch_id',scope.branchId);
  if(scope.restaurantId)q.set('restaurant_id',scope.restaurantId);
  if(scope.departmentId)q.set('department_id',scope.departmentId);
  return q.toString();
}

export function scopeKey(scope:Scope):string{
  return [scope.period,scope.projectId||'all',scope.branchId||'all',scope.restaurantId||'all',scope.departmentId||'all'].join(':');
}

export function hasScopeId(scope:Scope):boolean{
  return Boolean(scope.projectId||scope.branchId||scope.restaurantId||scope.departmentId);
}
