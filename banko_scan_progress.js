'use strict';
const VERSION='banko-scan-progress-v1-2026-10-08';
class BudgetPaused extends Error{constructor(reason){super(reason==='reserve'?'Canlı API rezervi bekleniyor; tarama ilerlemesi korundu.':'Banko günlük API bütçesi doldu; tarama ilerlemesi korundu.');this.reason=reason;}}
const selected=r=>!!r.pick;
const dateOf=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
function plan(fixtures,date,settings,now,priority,normalize){
    const seen=new Set();return fixtures.filter(f=>{
        const time=Date.parse(f.kickoff);if(!Number.isInteger(f.fixtureId)||seen.has(f.fixtureId)||!Number.isFinite(time)||!f.home?.id||!f.away?.id)return false;
        const day=dateOf(time);
        if(day!==date||!['NS','TBD'].includes(f.status)||time<=now.getTime()+30*60000||settings.allowedLeagueIds.length&&!settings.allowedLeagueIds.includes(f.leagueId)||!settings.women&&/women|femen|feminin|\bw\b/i.test(f.league+' '+f.home.name+' '+f.away.name))return false;
        seen.add(f.fixtureId);return true;
    }).sort((a,b)=>Number(priority.has(normalize(b.league)))-Number(priority.has(normalize(a.league)))||Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.fixtureId-b.fixtureId);
}
function valid(progress,date){return !!progress&&progress.version===VERSION&&progress.date===date&&Number.isInteger(progress.target)&&progress.target>=1&&progress.target<=100&&Number.isInteger(progress.cursor)&&progress.cursor>=0&&(progress.fixtures===null&&progress.cursor===0||Array.isArray(progress.fixtures)&&progress.cursor<=progress.fixtures.length&&new Set(progress.fixtures.map(f=>f?.fixtureId)).size===progress.fixtures.length&&progress.fixtures.every(f=>Number.isInteger(f?.fixtureId)&&Number.isFinite(Date.parse(f.kickoff))&&dateOf(Date.parse(f.kickoff))===date));}
function resumable(session){return valid(session?.scanProgress,session?.date)&&['waiting-budget','interrupted'].includes(session.status)&&!session.scanProgress.inFlight;}
module.exports={VERSION,BudgetPaused,selected,plan,valid,resumable};
