import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAttendance,normalizePunchTime} from "../shared/hr-attendance.ts";
const shift={startTime:"09:00",endTime:"17:30",breakStart:"13:00",breakEnd:"13:30",normalMinutes:480};
const roster={kind:"shift"};
test("accept all HHmm entry variants and reject invalid clocks",()=>{
 for(const input of ["0905","9:05","09:05"])assert.equal(normalizePunchTime(input),"09:05");
 for(const input of ["25:00","9:77","bad"])assert.throws(()=>normalizePunchTime(input));
});
test("scheduled 8 hour shift deducts break once",()=>{
 const v=evaluateAttendance(roster,shift,{in1:"09:00",out1:"17:30"});
 assert.equal(v.workedMinutes,480);assert.equal(v.lateMinutes,0);assert.equal(v.earlyMinutes,0);
});
test("two punches, late and early",()=>{
 const v=evaluateAttendance(roster,shift,{in1:"09:05",out1:"13:00",in2:"13:30",out2:"17:10"});
 assert.equal(v.workedMinutes,455);assert.equal(v.lateMinutes,5);assert.equal(v.earlyMinutes,20);
 assert.ok(v.anomalies.includes("遲到")&&v.anomalies.includes("早退"));
});
test("partial card, no card, overlapping and overnight punches",()=>{
 assert.ok(evaluateAttendance(roster,shift,{in1:"09:00"}).anomalies.includes("缺卡"));
 assert.ok(evaluateAttendance(roster,shift,{}).anomalies.includes("曠職"));
 assert.throws(()=>evaluateAttendance(roster,shift,{in1:"23:00",out1:"01:00"}),/CLOCK_ORDER/);
 assert.throws(()=>evaluateAttendance(roster,shift,{in1:"09:00",out1:"13:00",in2:"12:00",out2:"17:00"}),/OVERLAPPING/);
});
test("home no clock, booth no late or early, no-roster casual punches only",()=>{
 assert.equal(evaluateAttendance({...roster,marker:"home"},shift,{}).workedMinutes,480);
 const booth=evaluateAttendance({...roster,marker:"booth"},shift,{in1:"10:00",out1:"16:00"});
 assert.equal(booth.lateMinutes,0);assert.equal(booth.earlyMinutes,0);
 const casual=evaluateAttendance(null,shift,{in1:"10:00",out1:"12:00"},{noRosterPartTime:true});
 assert.equal(casual.lateMinutes,0);assert.equal(casual.workedMinutes,120);
});
test("off-day punches, X punches and typhoon leave are classified",()=>{
 assert.ok(evaluateAttendance({kind:"off",restLabel:"regular"},shift,{in1:"09:00",out1:"17:30"}).anomalies.includes("例假出勤"));
 assert.ok(evaluateAttendance({kind:"off",offMark:"x"},null,{in1:"09:00",out1:"12:00"}).anomalies.includes("X 日出勤"));
 assert.deepEqual(evaluateAttendance({kind:"leave",leaveCode:"颱"},shift,{}).anomalies,[]);
});
