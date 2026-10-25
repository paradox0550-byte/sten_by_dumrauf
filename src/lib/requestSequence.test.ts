import{describe,expect,it}from'vitest';
import{createRequestSequence}from'./requestSequence';

describe('createRequestSequence',()=>{
 it('marks only the newest request as current',()=>{const sequence=createRequestSequence();const first=sequence.begin();const second=sequence.begin();expect(sequence.isCurrent(first)).toBe(false);expect(sequence.isCurrent(second)).toBe(true)});
 it('keeps a request current until another request begins',()=>{const sequence=createRequestSequence();const request=sequence.begin();expect(sequence.isCurrent(request)).toBe(true);expect(sequence.isCurrent(request)).toBe(true)});
});
