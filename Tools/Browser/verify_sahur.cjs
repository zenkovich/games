const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert/strict');
const root=require('path').resolve(__dirname,'../..')+'/';
const dir=root+'Work/ScreenShots/';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:450,height:800},deviceScaleFactor:1,recordVideo:{dir:root+'Work/Videos',size:{width:450,height:800}}});
 const page=await context.newPage(), errors=[],perf=[],files=[],milestones=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.text().includes('perf:'))perf.push(m.text());});
 page.on('response',r=>{if(/Game\.(wasm|data|js)$/.test(r.url()))files.push({file:r.url().split('/').pop(),status:r.status(),encoding:r.headers()['content-encoding'],bytes:Number(r.headers()['content-length'])});});
 await page.goto('http://localhost:8090/Game.html');
 await page.waitForFunction(()=>globalThis.BF?.game?.progression);
 const started=Date.now();
 const state=()=>page.evaluate(()=>{let g=BF.game,s=g.progression.Current();return{x:g.player.x,y:g.player.y,money:g.money,earned:g.earned,sold:g.sold,harvested:g.harvested,stack:g.player.StackCount(),capacity:g.capacity,pending:g.player.pending,stock:g.counter.stock.length+g.counter.pending,index:g.progression.index,victory:g.victoryOpen,stage:s&&{x:s.x,y:s.y,cost:s.Remaining()}};});
 async function go(x,y,untilFull=false){
  await page.mouse.move(225,570);await page.mouse.down();await page.waitForTimeout(50);
  for(let i=0;i<180;i++){
   let s=await state(),dx=x-s.x,dy=y-s.y,d=Math.hypot(dx,dy);if(d<25 || (untilFull && s.stack+s.pending>=s.capacity))break;
   const yaw=35*Math.PI/180,c=Math.cos(yaw),sn=Math.sin(yaw);
   let sx=c*dx+sn*dy,sy=Math.cos(Math.PI/4)*(-sn*dx+c*dy),length=Math.hypot(sx,sy);
   const r=Math.min(60,Math.max(18,d*.4));
   await page.mouse.move(225+sx/length*r,570-sy/length*r);await page.waitForTimeout(70);
   if(i===179)throw new Error('navigation stalled: '+JSON.stringify({x,y,s}));
  }
  await page.mouse.up();await page.waitForTimeout(100);
 }
 await page.waitForTimeout(800);await page.screenshot({path:dir+'50_wasm_start.png'});
 let trips=0;
 while((await state()).index<4 && Date.now()-started<300000){
  let s=await state();
  if(s.money>=s.stage.cost){
   await go(s.stage.x,s.stage.y);
   await page.waitForFunction(index=>BF.game.progression.index>index,s.index,{timeout:6000});
   let next=await state();milestones.push({...next,seconds:(Date.now()-started)/1000});console.log('UPGRADE',JSON.stringify(milestones.at(-1)));
   await page.waitForTimeout(400);await page.screenshot({path:dir+`5${next.index}_wasm_upgrade.png`});
   continue;
  }
  if(s.stack< s.capacity){
   let bed=await page.evaluate(index=>{let p=BF.game.plantations[index],a=p.spots[0],b=p.spots[3],c=p.spots[76],d=p.spots[79];return{near:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},far:{x:(c.x+d.x)/2,y:(c.y+d.y)/2}};},s.index>=3?2:s.index>=1&&trips%2?1:0);
   await go(bed.near.x,bed.near.y,true);
   for(let sweep=0;sweep<4 && (await state()).stack+(await state()).pending<s.capacity;sweep++){
    let end=sweep%2?bed.near:bed.far;await go(end.x,end.y,true);
   }
   await page.waitForFunction(()=>BF.game.player.StackCount()===BF.game.capacity,{}, {timeout:4000});
   if(trips===0 || s.index===2)await page.screenshot({path:dir+(trips===0?'55_wasm_stack.png':'56_wasm_big_stack.png')});
  }
  let drop=await page.evaluate(()=>BF.points.counterDrop);await go(drop.x,drop.y);
  await page.waitForFunction(()=>BF.game.player.StackCount()===0&&BF.game.player.pending===0,{}, {timeout:18000});
  if(trips===0)await page.screenshot({path:dir+'57_wasm_delivery.png'});
  await page.waitForFunction(()=>BF.game.counter.stock.length===0&&BF.game.counter.pending===0&&BF.game.flights.length===0,{}, {timeout:22000});
  trips++;console.log('TRIP',trips,JSON.stringify(await state()));
 }
 const final=await state();assert.equal(final.index,4);assert(final.earned>=400);assert(final.victory);
 await page.screenshot({path:dir+'58_wasm_victory.png'});
 await page.mouse.click(225,487,{delay:150});
 await page.waitForFunction(()=>!BF.game.victoryOpen,{}, {timeout:2500});
 await go(570,-500);await go(435,580);await go(-600,580,true);await page.waitForTimeout(500);await page.screenshot({path:dir+'59_wasm_gold.png'});
 await page.mouse.move(225,620);await page.mouse.down();await page.waitForTimeout(100);
 await page.mouse.move(270,580);await page.waitForTimeout(350);await page.screenshot({path:dir+'60_wasm_joystick.png'});await page.mouse.up();
 const duration=(Date.now()-started)/1000;
 await page.evaluate(()=>Bridge.SetColorGrade(false));await page.waitForTimeout(200);await page.screenshot({path:dir+'61_wasm_ungraded.png'});
 await page.evaluate(()=>Bridge.SetColorGrade(true));await page.waitForTimeout(200);await page.screenshot({path:dir+'62_wasm_graded.png'});
 const video=page.video();await context.close();await video.saveAs(root+'Work/Sahur-gameplay.webm');
 const desktop=await browser.newPage({viewport:{width:1280,height:900}});desktop.on('pageerror',e=>errors.push(e.message));
 await desktop.goto('http://localhost:8090/Game.html');await desktop.waitForFunction(()=>globalThis.BF?.game?.player);await desktop.waitForTimeout(900);
 const bounds=await desktop.locator('canvas').boundingBox();assert(Math.abs(bounds.width/bounds.height-9/16)<.001);
 await desktop.screenshot({path:dir+'63_wasm_desktop.png'});await desktop.close();
 const mobile=await browser.newPage({viewport:{width:360,height:640},isMobile:true,hasTouch:true,deviceScaleFactor:2});mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto('http://localhost:8090/Game.html');await mobile.waitForFunction(()=>globalThis.BF?.game?.player);
 const mobileCanvas=await mobile.evaluate(()=>{let c=document.querySelector('canvas'),r=c.getBoundingClientRect();return{cssWidth:r.width,cssHeight:r.height,width:c.width,height:c.height,dpr:devicePixelRatio};});
 assert(Math.abs(mobileCanvas.width-mobileCanvas.cssWidth*mobileCanvas.dpr)<=1);assert(Math.abs(mobileCanvas.height-mobileCanvas.cssHeight*mobileCanvas.dpr)<=1);
 const touchStart=await mobile.evaluate(()=>({x:BF.game.player.x,y:BF.game.player.y}));
 const cdp=await mobile.context().newCDPSession(mobile);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:410}]});await mobile.waitForTimeout(100);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:460}]});await mobile.waitForTimeout(700);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(100);
 const touch=await mobile.evaluate(()=>({x:BF.game.player.x,y:BF.game.player.y,joy:BF.game.player.joyActive}));assert(touch.x>touchStart.x+80&&touch.y<touchStart.y-20);assert.equal(touch.joy,false);
 await mobile.screenshot({path:dir+'64_wasm_mobile.png'});
 const edge=await browser.newPage({viewport:{width:450,height:800}});edge.on('pageerror',e=>errors.push(e.message));
 await edge.goto('http://localhost:8090/Game.html');await edge.waitForFunction(()=>globalThis.BF?.game?.player);
 const stick=()=>edge.evaluate(()=>{let p=BF.game.player;return{x:p.x,y:p.y,ox:p.joyOriginX,oy:p.joyOriginY,active:p.joyActive,speed:Math.hypot(p.dirX,p.dirY)};});
 await edge.mouse.move(225,620);await edge.mouse.down();await edge.waitForTimeout(100);let anchor=await stick();
 await edge.mouse.move(5,620);await edge.waitForTimeout(350);let atEdge=await stick();
 await edge.waitForTimeout(350);let held=await stick();
 assert.equal(held.ox,anchor.ox);assert.equal(held.oy,anchor.oy);assert(held.speed>.99);assert(Math.hypot(held.x-atEdge.x,held.y-atEdge.y)>80);
 await edge.screenshot({path:dir+'65_wasm_fixed_joystick.png'});
 await edge.mouse.up();await edge.waitForTimeout(200);let released=await stick();assert.equal(released.active,false);assert.equal(released.speed,0);
 await edge.mouse.move(140,580);await edge.mouse.down();await edge.waitForTimeout(100);let nextTap=await stick();assert.notEqual(nextTap.ox,anchor.ox);await edge.mouse.up();await edge.close();
 const fixedJoystick={anchor,atEdge,held,released,nextTap};
 assert(files.every(f=>f.status===200&&f.encoding==='gzip'));assert.deepEqual(errors,[]);
 const result={passed:true,realInput:true,noEconomyCheats:true,duration,progressionSeconds:milestones.at(-1).seconds,trips,final,referenceField:{widthMeters:22,lengthMeters:26,beds:3,brains:240,cameraYaw:35},milestones,touch,mobileCanvas,fixedJoystick,desktop:bounds,files,errors,perf};
 fs.writeFileSync(dir+'browser-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
