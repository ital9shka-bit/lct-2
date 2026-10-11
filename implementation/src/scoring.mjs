export const competencyIds = ['http','sql','debug','arch','security'];
export function scores(tasks) {
  const unresolved = tasks.filter(t=>t.score == null).length + Math.max(0,20-tasks.length);
  if (unresolved) return {S:null,B:null,H:null,competencies:[],unresolved_count:unresolved,passed:false,borderline:false};
  // All percentages are exact multiples of 1/8. Integer eighths avoid binary rounding at thresholds.
  const competencies = competencyIds.map(competency => {
    const group=tasks.filter(t=>t.private_item.competency===competency);
    const b=group.filter(t=>t.stage==='B').reduce((s,t)=>s+t.score,0),a=group.find(t=>t.stage==='A').score,v=group.find(t=>t.stage==='V').score;
    const C8=70*b+30*(a+v);
    return {competency,B:b*12.5,A:a*25,V:v*25,C:C8/8,minimum_passed:C8>=400};
  });
  const S=competencies.reduce((s,c)=>s+c.C*8,0)/40,B=competencies.reduce((s,c)=>s+c.B,0)/5,H=competencies.reduce((s,c)=>s+c.A+c.V,0)/10;
  return {S,B,H,competencies,unresolved_count:0,passed:S>=70&&B>=60&&H>=40&&competencies.every(c=>c.minimum_passed),borderline:S>=65&&S<=75};
}
export function branchFor(stage, tasks, competency) {
  const rows=tasks.filter(t=>t.private_item.competency===competency);
  const bs=rows.filter(t=>t.stage==='B');
  if(bs.length!==2||bs.some(t=>t.score==null)) return {branch:'repair',provisional:true};
  const B=bs.reduce((s,t)=>s+t.score,0)*12.5;
  if(stage==='A') return {branch:B<75?'repair':'transfer',provisional:false};
  const a=rows.find(t=>t.stage==='A');
  if(!a||a.score==null)return {branch:'repair',provisional:true};
  return {branch:a.score<2||(0.7*B+0.15*a.score*25)/0.85<70?'repair':'transfer',provisional:false};
}
export function evidenceValid(criteria, item, answer) {
  return Array.isArray(criteria)&&criteria.length===4&&new Set(criteria.map(c=>c.criterion_id)).size===4&&criteria.every(c=>item.rubric.some(r=>r.id===c.criterion_id)&&[0,1].includes(c.score)&&typeof c.reason==='string'&&(c.score===0||(typeof c.evidence_quote==='string'&&c.evidence_quote.trim().length>0&&answer.includes(c.evidence_quote))));
}
export function mergedSeconds(intervals) {
  const sorted=intervals.map(i=>[+new Date(i.start_at),+new Date(i.end_at)]).sort((a,b)=>a[0]-b[0]);
  let sum=0,start=null,end=null;
  for(const [s,e] of sorted){if(start==null){start=s;end=e;}else if(s<=end)end=Math.max(end,e);else{sum+=end-start;start=s;end=e;}}
  return (sum+(start==null?0:end-start))/1000;
}
