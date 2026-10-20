const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
(async()=>{
  const dir=process.argv[2], mode=process.argv[3]||'preview';
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.goto('file://'+path.join(dir,'quiz.html'));
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForTimeout(500);
  if(mode==='preview'){
    for(const t of [3,7,12,17,22,30,36,45,57,66,72]){await p.evaluate(t=>render(t),t);await p.screenshot({path:path.join(dir,'..','prev_'+t+'.png')});}
  } else {
    const fps=30, dur=await p.evaluate(()=>TIMELINE.DURATION);
    fs.mkdirSync(path.join(dir,'..','frames'),{recursive:true});
    for(let i=0;i<dur*fps;i++){await p.evaluate(t=>render(t),i/fps);
      await p.screenshot({path:path.join(dir,'..','frames',String(i).padStart(5,'0')+'.jpg'),type:'jpeg',quality:92});}
  }
  await b.close();
})();
