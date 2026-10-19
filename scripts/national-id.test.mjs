import test from "node:test";
import assert from "node:assert/strict";
import {isValidTaiwanId,maskTaiwanId} from "../shared/national-id.ts";
test("citizen identity checksum and masking",()=>{
 assert.equal(isValidTaiwanId("A123456789"),true);
 assert.equal(maskTaiwanId("A123456789"),"A12****789");
 assert.equal(isValidTaiwanId("A123456780"),false);
 assert.equal(maskTaiwanId(null),null);
});
test("invalid input fails closed",()=>{
 for(const input of ["", "A000000000", "a1xxxxxxxx","A12345678","ZZ12345678"])assert.equal(isValidTaiwanId(input),false);
});
