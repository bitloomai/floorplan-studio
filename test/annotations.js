'use strict';
module.exports = function(ok) {
  const A = require('../floorplan_studio/app/lib/annotations');
  const scene = require('../floorplan_studio/app/lib/plan-scene');
  const library = require('../floorplan_studio/app/defaults/library.json');
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const clone = v => JSON.parse(JSON.stringify(v));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const f = { id:'f', extent:{w:20,h:20}, rooms:[{id:'r',name:'Study',shape:'rect',rect:[0,0,10,10]}], items:[{id:'i',kind:'furniture',type:'table',at:[2,2],room:'r',props:{w:4,h:2}}], openings:[{id:'o',room:'r',wall:'n',at:2,w:3}], boundaries:[{id:'b',room:'r',wall:'s',from:2,to:6,type:'wall_partition'}] };
  const p = {id:'notes-test',ppf:20,floors:[f]};
  const targets = [{kind:'floor'},{kind:'room',id:'r'},{kind:'item',id:'i'},{kind:'opening',id:'o'},{kind:'boundary',id:'b'},{kind:'point',at:[3,4]},{kind:'boundary',room:'r',wall:'e',edge:1}];
  const centres = [[10,10],[5,5],[4,3],[3.5,0],[4,10],[3,4],[10,5]];
  targets.forEach((target,i) => ok('note anchor: '+JSON.stringify(target), equal(A.anchor(f,target,library),centres[i])));
  f.annotations = targets.map((target,i) => A.make(f,{id:'n'+(i+1),text:'Review '+i,target},library));
  const validate = value => { const errors=[],warnings=[]; A.validate(value,(p,m)=>errors.push(m),(p,m)=>warnings.push(m),'notes'); return {errors,warnings}; };
  ok('target matching ignores JSON key order', A.sameTarget({id:'r',kind:'room'}, {kind:'room',id:'r'}));
  ok('target matching distinguishes object kinds', !A.sameTarget({id:'r',kind:'room'}, {kind:'item',id:'r'}));
  ok('all note target forms validate', !validate(f).errors.length);
  ok('new note ids avoid collisions', A.make(f,{text:'Another'},library).id === 'n8');
  const invalids = [{text:''},{text:'x'.repeat(10001)},{status:'later'},{at:[NaN,0]},{at:[1]},{createdAt:'yesterday'},{target:{kind:'unknown'}},{target:{kind:'item'}},{target:{kind:'point',at:['x',1]}},{target:{kind:'boundary',room:'r',wall:'north'}},{id:''}];
  invalids.forEach((patch,i) => ok('invalid note rejected '+i, validate({...f,annotations:[{...f.annotations[0],...patch}]}).errors.length > 0));
  ok('duplicate ids rejected', validate({...f,annotations:[f.annotations[0],f.annotations[0]]}).errors.length > 0);
  ok('missing target is recoverable warning', validate({...f,annotations:[{...f.annotations[0],target:{kind:'item',id:'gone'}}]}).warnings.length === 1);
  ok('invalid collection rejected', validate({...f,annotations:{}}).errors.length === 1);
  const moved=clone(p); moved.floors[0].items[0].at=[4,5]; A.reconcile(p,moved,library);
  ok('item movement carries pin with offset', equal(moved.floors[0].annotations[2].at,[6,6]));
  moved.floors[0].annotations[2].at=[1,1]; A.reconcile(p,moved,library);
  ok('explicit pin move takes precedence over target move', equal(moved.floors[0].annotations[2].at,[1,1]));
  const deleted=clone(p); deleted.floors[0].items=[]; A.reconcile(p,deleted,library);
  ok('deleting item retains note as point', equal(deleted.floors[0].annotations[2].target,{kind:'point',at:[4,3]}));
  const malformed=clone(p); malformed.floors[0].items[0].at=null;
  try { A.reconcile(p,malformed,library); ok('malformed target cannot crash reconciliation',true); } catch { ok('malformed target cannot crash reconciliation',false); }
  /* What a note dropped on bare canvas attaches to. The chain is the editor's
   * own z-order — the thing you can see on top, then the wall, then the room,
   * then the floor — so feedback references an object rather than a bare
   * coordinate a reader has to interpret. */
  const chain = at => A.locate(f,at,library).map(t => t.kind + (t.id ? ':' + t.id : t.wall ? ':' + t.room + '/' + t.wall : ''));
  ok('locate returns the topmost thing first, then what is under it', equal(chain([4,3]),['item:i','room:r','floor']));
  ok('locate falls through to the room where nothing is placed', equal(chain([7,6]),['room:r','floor']));
  ok('locate names an explicit boundary when one covers that stretch', equal(chain([4,9.9]),['boundary:b','room:r','floor']));
  ok('and addresses a default wall without inventing a boundary for it', equal(chain([9,0.2]),['boundary:r/n','room:r','floor']));
  ok('an opening beats the wall it sits in', equal(chain([3.5,0.1]),['opening:o','boundary:r/n','room:r','floor']));
  ok('off the plan there is still the floor', equal(chain([15,15]),['floor']));
  ok('a note given a position and no target attaches to what is there', A.make(f,{text:'x',at:[4,3]},library).target.kind==='item');
  ok('and one raised with neither still belongs to the floor', A.make(f,{text:'x'},library).target.kind==='floor');

  const expanded=A.list(p,library,{floorId:'f',status:'open'});
  ok('list expands item type and current properties', expanded[2].resolvedTarget.typeKey==='furniture.table' && expanded[2].resolvedTarget.props.w===4);
  ok('list isolates floor and status', A.list(p,library,{floorId:'other'}).length===0 && A.list(p,library,{status:'done'}).length===0);
  /* The context is what makes a note actionable: "this is wrong" plus the room
   * it is in and what is standing next to it. */
  const ctx = expanded[2].context;
  ok('list reports the floor and the room a note is really about', ctx.floor.id==='f' && ctx.room.id==='r');
  ok('and what else is under its pin', equal(ctx.under.map(t=>t.kind),['item','room','floor']));
  ok('and what stands near it, nearest first, with distance and binding', ctx.nearby[0].id==='o' && ctx.nearby[0].kind==='opening' && ctx.nearby[0].distanceFt>0);
  ok('a note on a wall still resolves the room that wall belongs to', A.list(p,library,{floorId:'f'})[4].context.room.id==='r');
  const context={window:{localStorage:{getItem(){}},Annotations:A},Annotations:A};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../floorplan_studio/app/public/js/store.js'),'utf8'),context);
  const Store=context.window.Store; Store.S.project=clone(p); Store.S.activeFloorId='f'; Store.S.library=library;
  Store.mutate(()=>{Store.floor().items=[];},'delete target');
  ok('browser mutation orphans notes in same undo entry', Store.S.undoStack.length===1 && Store.floor().annotations[2].target.kind==='point');
  Store.undo(); ok('undo restores target and attached note', Store.floor().items.length===1 && Store.floor().annotations[2].target.kind==='item');
  Store.redo(); ok('redo restores orphaned note', Store.floor().annotations[2].target.kind==='point');
  const clean=A.withoutNotes(p);
  ok('stripping leaves editable source untouched', f.annotations.length===7 && !clean.floors[0].annotations);
  const legacy=clone(p); legacy.floors[0]._legacy={annotations:[{text:'private-note-sentinel'}]};
  ok('legacy sidecar stripped too', !JSON.stringify(A.withoutNotes(legacy)).includes('private-note-sentinel'));
  const trimmed=require('../floorplan_studio/app/lib/card-build').trimProject(legacy);
  ok('runtime card project excludes notes', !trimmed.floors[0].annotations && !trimmed.floors[0]._legacy);
  const stamp=require('../floorplan_studio/app/lib/provenance').stamp(legacy,{urlPath:'test-notes',embedProject:true});
  ok('HA embedded ownership project excludes notes', !stamp.project.floors[0].annotations && !stamp.project.floors[0]._legacy.annotations);
  ok('embedded project byte count describes stripped payload', stamp.project_bytes===JSON.stringify(stamp.project).length);
  const noOpts=scene.build(p,f,library,{}), off=scene.build(p,f,library,{}, {annotations:false}), on=scene.build(p,f,library,{annotationPin:'#123456'},{annotations:true});
  ok('default renderer and SVG exclude note layer', !noOpts.order.includes('annotations') && !scene.toSvg(noOpts).includes('fps-annotations'));
  ok('explicitly disabled rendering matches default', equal(noOpts,off));
  ok('editor renders numbered pins above labels', on.order.at(-1)==='annotations' && on.layers.annotations.filter(n=>n.tag==='text').length===7);
  ok('pin uses dedicated theme token', on.layers.annotations[0].attrs.fill==='#123456');
  const outside=clone(f); outside.annotations[0].at=[-3,25]; const out=scene.build(p,outside,library,{}, {annotations:true});
  ok('off-floor pins fit editor scene', out.width>on.width && out.height>on.height);
  const defaultNote=A.make(f,{text:'default'},library); ok('new notes have open status timestamp and floor target', defaultNote.status==='open' && Number.isFinite(Date.parse(defaultNote.createdAt)) && defaultNote.target.kind==='floor');
  const dataDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'fps-notes-'));
  const script=`
    const assert=require('node:assert/strict');
    const store=require('./floorplan_studio/app/lib/store');
    const tools=require('./floorplan_studio/app/lib/mcp').TOOLS;
    const call=(name,args)=>tools.find(t=>t.name===name).run(args);
    (async()=>{
      await store.init(); await store.writeProject(${JSON.stringify(p)});
      await call('edit_collection',{collection:'annotations',op:'add',floorId:'f',value:{text:'MCP feedback',target:{kind:'item',id:'i'}}});
      let result=await call('list_annotations',{floorId:'f',status:'open'}); assert.equal(result.annotations.length,8); assert.equal(result.annotations.at(-1).resolvedTarget.typeKey,'furniture.table');
      await call('edit_collection',{collection:'annotations',op:'update',floorId:'f',id:'n8',value:{status:'done',text:'Resolved'}});
      assert.equal((await call('list_annotations',{status:'done'})).annotations.length,1);
      const before=JSON.stringify(await store.readProject());
      await assert.rejects(()=>call('edit_collection',{collection:'annotations',op:'update',floorId:'f',id:'n8',value:{text:''}}));
      assert.equal(JSON.stringify(await store.readProject()),before);
      await call('edit_collection',{collection:'items',op:'remove',floorId:'f',id:'i'});
      assert.equal((await store.readProject()).floors[0].annotations.at(-1).target.kind,'point');
      await call('edit_collection',{collection:'annotations',op:'remove',floorId:'f',id:'n8'});
      assert.equal((await store.readProject()).floors[0].annotations.length,7);
    })().catch(e=>{console.error(e);process.exitCode=1;});`;
  try { require('node:child_process').execFileSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,FPS_DATA_DIR:dataDir},stdio:'pipe'}); ok('real MCP add list update validation deletion and persistence',true); }
  catch(e) { ok('real MCP annotation roundtrip',false,String(e.stderr||e)); }
  finally { fs.rmSync(dataDir,{recursive:true,force:true}); }
};
