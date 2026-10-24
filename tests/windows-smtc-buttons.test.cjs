'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSmtc}=require('../native/windows-media/winrt.cjs');
function fixture(){
    const calls=[],commands=[],buttons=new Map();let handler,retired=0,released=0;
    const bindings={initialize:()=>0,uninitialize(){},getFactory:()=> 'factory',query:()=> 'controls2',activate:()=> 'timeline',release(){released++;},
        check(code){assert.ok(code>=0);},hstring(text,operation){return operation(text);},
        buttonHandler(callback){handler=callback;return {object:'listener',retire(){retired++;},async dispose(){}};},
        invoke(pointer,index,_result,_args,values){calls.push({pointer,index,values});
            if(pointer==='factory'&&index===6)values[2][0]='controls';
            if(pointer==='controls'&&index===8)values[0][0]='updater';
            if(pointer==='updater'&&index===13)values[0][0]='video';
            if(pointer==='controls'&&index===32)values[1][0]=42n;
            if(pointer==='controls'&&[13,15,17,19,21,23,25,27,29,31].includes(index))buttons.set(index,values[0]);
            return 0;}};
    return {bindings,calls,commands,buttons,press:value=>handler(value),get retired(){return retired;},get released(){return released;}};
}
test('SMTC supports exactly stateful play pause stop previous next and retires callbacks',async()=>{
    const f=fixture(),session=await createSmtc(f.bindings,1n,{onCommand:command=>f.commands.push(command)});
    for(let value=0;value<12;value++)f.press(value);assert.deepEqual(f.commands,[]);
    session.update({active:true,paused:false,title:'Fixture',mediaType:'Video',canNext:true,canPrevious:false});
    // IInspectable(6) + PlaybackStatus(2) + updater/sound(2) + IsEnabled(2)
    // + Play/Stop/Pause/Record/FastForward/Rewind(12), then Previous(2), Next(2).
    // Official windows.media.h orders Previous before Next (setters 25, 27).
    assert.deepEqual([...f.buttons].filter(([,on])=>on).map(([index])=>index),[15,17,27]);
    for(let value=0;value<12;value++)f.press(value);assert.deepEqual(f.commands,['pause','stop','next']);
    session.update({active:true,paused:true,title:'Fixture',mediaType:'Video',canNext:false,canPrevious:true});
    assert.deepEqual([...f.buttons].filter(([,on])=>on).map(([index])=>index),[13,15,25]);
    for(let value=0;value<12;value++)f.press(value);assert.deepEqual(f.commands,['pause','stop','next','play','stop','previous']);
    session.update({active:false,title:'',canNext:false,canPrevious:false});
    for(let value=0;value<12;value++)f.press(value);assert.equal(f.commands.length,6);
    await session.dispose();await session.dispose();for(let value=0;value<12;value++)f.press(value);
    assert.equal(f.commands.length,6);assert.equal(f.retired,1);assert.equal(f.released,6);
    assert.ok(f.calls.some(row=>row.pointer==='controls'&&row.index===33&&row.values[0]===42n));
    assert.ok(f.calls.some(row=>row.pointer==='controls'&&row.index===11&&row.values[0]===0));
});
