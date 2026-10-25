export function createRequestSequence(){let current=0;return{begin(){current+=1;return current},isCurrent(requestId:number){return requestId===current}}}
