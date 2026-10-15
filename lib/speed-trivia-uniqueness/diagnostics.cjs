/* Booleans and reason codes only: no key, provider payload or question data. */
const prerequisites = (env=process.env) => {
 const cap=Number(env.SPEED_TRIVIA_MAX_DOLLARS);
 const checks={geminiKey:typeof env.GEMINI_API_KEY==='string'&&env.GEMINI_API_KEY.trim().length>0,signingKey:typeof env.SPEED_TRIVIA_ADMISSION_SECRET==='string'&&env.SPEED_TRIVIA_ADMISSION_SECRET.length>=32,normalCap:Number.isFinite(cap)&&cap>0&&cap<=.5};
 return {ready:Object.values(checks).every(Boolean),checks,reasons:Object.entries(checks).filter(([,valid])=>!valid).map(([key])=>key+'_unconfigured'),normalCapDollars:checks.normalCap?cap:null,subjectPolicy:'speed-subject-variety-v1',factPolicy:'speed-facts-v2'};
};
module.exports={prerequisites};
