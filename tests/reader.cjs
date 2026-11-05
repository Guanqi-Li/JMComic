const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const ts=require(process.env.TS_COMPILER||'typescript'),root=path.resolve(__dirname,'../JMComic');
const chapters=[{id:'3',order:3,title:'Three'},{id:'2',order:2,title:'Two'},{id:'1',order:1,title:'One'}].map(c=>({...c,updatedAt:''}));
const makePages=(id,count=2)=>Array.from({length:count},(_,index)=>index).map(index=>({id:id+'_'+index,index,loadLocalFile:async()=>'/decoded/'+id+index+'.png'}));
function evaluate(file,requireMock,context={}){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;vm.runInNewContext('(function(require,module,exports){'+js+'})',context)(requireMock,m,m.exports);return m.exports;}
const {ChapterStream}=evaluate('features/reader/chapter-stream.ts',()=>({}));
const pageQueue=evaluate('page-load-queue.ts',()=>({}));
const {ReaderPreloader}=evaluate('features/reader/reader-preloader.ts',()=>pageQueue,{FileManager:{existsSync:()=>true}});
(async()=>{
 let calls=0;const stream=new ChapterStream(chapters,chapters[2],makePages('1'),async c=>{calls++;await Promise.resolve();return makePages(c.id)});
 await Promise.all([stream.appendNext(),stream.appendNext()]);assert.equal(calls,1);assert.equal(stream.segments.length,2);assert.equal(stream.pages.length,4);assert.equal(stream.pages[0].id,'1:1_0');assert.equal(stream.segmentAt(2).chapter.id,'2');assert.equal(stream.segmentAt(2).count,2);
 await stream.appendNext();assert.equal(stream.segments.at(-1).chapter.id,'3');assert.equal(await stream.appendNext(),false);
 let release;const stale=new ChapterStream(chapters,chapters[2],makePages('1'),c=>c.id==='2'?new Promise(r=>release=r):Promise.resolve(makePages(c.id)));
 const pending=stale.appendNext();await stale.select(chapters[0]);release(makePages('2'));await pending;assert.equal(stale.segments.length,1);assert.equal(stale.segments[0].chapter.id,'3');
 console.log('PASS chapter order, deduplicated append, no skipped tail page, per-chapter boundaries, final chapter stops, stale request isolation');

 function fixture(lastPage=0,saveFails=false,chapterList=chapters,pageCount=2) {
  const slots=[],effects=[],timers=[],reads=[],saved=[],snapshots=[],presented=[];let cursor=0,dismissals=0;
  const scriptWrites=[];
  const native=new Proxy({
   useObservable:v=>{
    const i=cursor++;
    if(!slots[i]){
     const listeners=new Set();
     slots[i]={value:v,subscribe(fn){listeners.add(fn)},unsubscribe(fn){listeners.delete(fn)},
      nativeChange(x){this.value=x;for(const fn of listeners)fn(x)},
      setValue(x){scriptWrites.push([this,x]);this.nativeChange(x)}};
    }
    return slots[i];
   },
   useRef:v=>{const i=cursor++;if(!slots[i])slots[i]={current:v};return slots[i]},
   useEffect:fn=>{const i=cursor++;if(!slots[i]){slots[i]=true;effects.push(fn)}},
   Navigation:{useDismiss:()=>()=>{dismissals++},present:async p=>{presented.push(p.element)}}
  },{get:(obj,k)=>k in obj?obj[k]:String(k)});
  const DeferredPageImage=()=>{};
  const context={Date,Promise,console,setTimeout:(fn,delay)=>{timers.push({fn,delay,cancelled:false});return timers.length},clearTimeout:id=>{if(timers[id-1])timers[id-1].cancelled=true},React:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})}};
  const mocks=id=>id==='scripting'?native:id==='./chapter-stream'?{ChapterStream}:id==='./reader-preloader'?{ReaderPreloader}:id==='./deferred-page-image'?{DeferredPageImage}:id==='../../online-storage'?{buildOnlineReaderProgressKey:i=>i.chapterId,getOnlineChapterProgress:()=>({lastPage,totalPages:2,lastReadAt:100}),pushOnlineReadingHistory:r=>snapshots.push(r)}:id==='../../library-storage'?{saveProgressData:(...args)=>{if(saveFails)throw new Error('Storage unavailable');saved.push(args)}}:id==='../../jm-account'?{recordJMAccountReading:async id=>reads.push(id)}:{};
  const {ComicReaderView}=evaluate('features/reader/comic-reader-view.tsx',mocks,context);
  const props={fileName:'Mock',initialPages:makePages('1',pageCount),onlineProgress:{sourceId:'zh.jmcomic',comicId:'42',chapterId:'1',chapterOrder:1,comicTitle:'Mock',chapterTitle:'One',host:'go2778'},chapters:chapterList,selectedChapter:chapters[2],loadChapterPages:async c=>makePages(c.id)};
  const render=()=>{cursor=0;return ComicReaderView(props)};
  function all(node){if(!node||typeof node!=='object')return [];return [node,...(node.children||[]).flatMap(child=>typeof child==='function'&&node.type==='GeometryReader'?all(child({size:{width:390,height:844}})):all(child))]}
  const nodes=()=>all(render());
  const images=()=>nodes().filter(n=>n.type===DeferredPageImage);
  const scroll=()=>nodes().find(n=>n.type==='ScrollView');
  const binding=()=>scroll().props.scrollPosition.value;
  const change=id=>binding().nativeChange(id);
  const positionWrites=()=>scriptWrites.filter(([observable])=>observable===binding());
  const flush=delay=>{const pending=timers.filter(t=>t.delay===delay&&!t.cancelled);for(const timer of pending){timer.cancelled=true;timer.fn()}};
  const button=title=>nodes().find(n=>n.type==='Button'&&n.props.title===title);
  const show=()=>{if(!button('目录'))images()[0].props.onTapGesture()};
  const choose=async chapter=>{show();await button('目录').props.action();const directory=presented.at(-1).children[0];await directory.props.onChoose(chapter)};
  render();for(const effect of effects.splice(0))effect();
  return {render,nodes,images,scroll,binding,change,positionWrites,flush,show,button,choose,snapshots,saved,reads,timers,presented,get dismissals(){return dismissals}};
 }
 const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
 const reader=fixture();await settle();
 assert.equal(reader.render().props.statusBarHidden,true);assert.equal(reader.render().props.toolbarVisibility,'hidden');
 assert(!reader.nodes().some(n=>['ScrollViewReader','Slider','Toolbar'].includes(n.type)));
 assert(reader.nodes().some(n=>n.type==='LazyVStack'&&n.props.spacing===0&&n.props.scrollTargetLayout));
 assert.equal(reader.scroll().props.key,'reader-scroll');
 assert.equal(reader.binding().value,'1:1_0');
 let images=reader.images();
 images[1].props.onLoaded();await settle();
 assert.equal(reader.images().length,2);assert.equal(reader.snapshots.length,0);assert.equal(reader.reads.length,0);
 assert(!reader.nodes().some(n=>n.props.key==='reader-end')); // Status UI is outside the scroll target layout.
 images[0].props.onLoaded();reader.change('1:1_0');reader.flush(800);
 assert.equal(reader.saved.at(-1)[1],0);
 reader.change('1:1_1');await settle();
 assert.equal(reader.images().length,4);assert.equal(reader.binding().value,'1:1_1');
 assert.equal(reader.scroll().props.key,'reader-scroll');
 // An off-screen next-chapter tail may be created/decoded early, without changing position or appending again.
 reader.images()[3].props.onLoaded();await settle();reader.flush(800);
 assert.equal(reader.images().length,4);assert.equal(reader.binding().value,'1:1_1');
 assert.equal(reader.snapshots.at(-1).chapterId,'1');assert.equal(reader.saved.at(-1)[1],1);
 reader.change('2:2_0');reader.images()[2].props.onLoaded();reader.flush(800);
 assert.equal(reader.snapshots.at(-1).chapterId,'2');assert.equal(reader.saved.at(-1)[1],0);
 reader.show();
 for(const title of ['上一章','下一章','目录','返回'])assert(reader.button(title));
 assert(reader.nodes().some(n=>n.type==='Text'&&n.children.includes('第 2 章')));
 assert(reader.nodes().some(n=>n.type==='Text'&&n.children.includes('Two')));
 const before=reader.binding().value;
 await reader.choose(chapters[1]);assert.equal(reader.binding().value,before);
 reader.show();reader.flush(4000);assert(!reader.button('返回'));
 assert.equal(reader.binding().value,before);
 reader.change('2:2_1');await settle();assert.equal(reader.images().length,6);
 assert.equal(reader.binding().value,'2:2_1');
 reader.images()[5].props.onLoaded();await settle();
 assert.equal(reader.binding().value,'2:2_1');
 reader.change('3:3_0');reader.images()[4].props.onLoaded();reader.show();
 reader.button('返回').props.action();reader.button('返回').props.action();assert.equal(reader.dismissals,1);
 assert.equal(reader.snapshots.at(-1).chapterId,'3');assert.equal(reader.saved.at(-1)[1],0);
 assert(!reader.timers.some(t=>t.delay===100||t.delay===300));
 console.log('PASS native position tracking, stable scroll identity, off-screen callbacks cannot append or overwrite progress, same-chapter directory is a no-op');
 console.log('PASS auto append retains current last page; next chapter begins at its first page; controls never reposition; one reader dismissal');

 // A single chapter scrolls past its first two pages while loading and controls rerender.
 const single=fixture(1,false,[chapters[2]],6);await settle();
 const nativePosition=single.binding();
 assert.equal(nativePosition.value,'1:1_1');
 single.change('1:1_4');single.images()[4].props.onLoaded();
 single.images()[0].props.onLoaded();single.images()[1].props.onLoaded();
 single.show();single.flush(4000);single.flush(800);
 assert.equal(single.binding(),nativePosition);
 assert.equal(single.binding().value,'1:1_4');
 assert.equal(single.positionWrites().length,0);
 assert.equal(single.saved.at(-1)[1],4);
 console.log('PASS single-chapter scrolling and rerenders do not send scroll targets back to native');
 // Native visibility can advance while the observable still holds the restored page.
 const prefetch=fixture(0,false,[chapters[2]],14);await settle();
 assert.equal(prefetch.images()[5].props.cachedPath,'/decoded/15.png');
 assert.equal(prefetch.images()[8].props.cachedPath,'');
 prefetch.scroll().props.onScrollTargetVisibilityChange.onChanged(['1:1_7','1:1_6']);
 await settle();
 assert.equal(prefetch.images()[8].props.cachedPath,'/decoded/18.png');
 assert.equal(prefetch.images()[11].props.cachedPath,'/decoded/111.png');
 assert.equal(prefetch.images()[12].props.cachedPath,'');
 assert.equal(prefetch.binding().value,'1:1_0');
 assert.equal(prefetch.positionWrites().length,0);
 assert.equal(prefetch.snapshots.length,0);
 console.log('PASS visible pages advance the five-page prefetch window without scroll feedback or progress writes');
 // Reproduce the 56-page report with both native scroll callbacks silent.
 const long=fixture(1,false,[chapters[2]],56);await settle();
 const longImages=long.images();
 const targets=long.nodes().find(node=>node.props.scrollTargetLayout).children;
 assert.equal(targets[55].type,'VStack');
 assert.equal(targets[55].props.key,'1:1_55');
 longImages[1].props.onAppear();longImages[1].props.onLoaded();
 for(let index=2;index<56;index++){
  longImages[index].props.onAppear();
  longImages[index-1].props.onDisappear();
  await settle();
  if(index<55)assert(long.images()[index+1].props.cachedPath);
  longImages[index].props.onLoaded();
 }
 long.change('1:1_1'); // An old scroll report arrives after its row left the screen.
 long.show();long.button('返回').props.action();
 assert.equal(long.saved.at(-1)[1],55);
 assert.equal(long.snapshots.at(-1).progressText,'已读完');
 assert.equal(long.positionWrites().length,0);
 console.log('PASS page lifecycle keeps prefetch moving and saves page 56 without native scroll feedback');
 const earlyClose=fixture(1);await settle();assert.equal(earlyClose.binding().value,'1:1_1');
 earlyClose.show();earlyClose.button('返回').props.action();assert.equal(earlyClose.snapshots.length,0);
 const restored=fixture(1);await settle();
 restored.images()[1].props.onLoaded();restored.change('1:1_1');await settle();restored.flush(800);
 assert.equal(restored.saved.at(-1)[1],1);assert.equal(restored.binding().value,'1:1_1');
 restored.change('2:2_0');restored.images()[2].props.onLoaded();
 restored.flush(100);restored.flush(300);
 assert.equal(restored.binding().value,'2:2_0');
 // Explicit selection starts a new, not-yet-appended chapter at its first page, with no delayed scroll retries.
 const manual=fixture();await settle();manual.images()[0].props.onLoaded();
 await manual.choose(chapters[0]);await settle();
 assert.equal(manual.binding().value,'3:3_0');
 manual.change('1:1_0');assert.equal(manual.positionWrites().length,1);
 manual.images()[0].props.onLoaded();manual.change('3:3_0');manual.flush(800);
 assert.equal(manual.snapshots.at(-1).chapterId,'3');assert.equal(manual.saved.at(-1)[1],0);
 const short=fixture();await settle();short.images()[0].props.onLoaded();
 short.scroll().props.onScrollTargetVisibilityChange.onChanged(['1:1_0','1:1_1']);await settle();assert.equal(short.images().length,2);
 short.images()[1].props.onLoaded();await settle();
 assert.equal(short.images().length,4);assert.equal(short.binding().value,'1:1_0');
 short.images()[3].props.onLoaded();await settle();assert.equal(short.images().length,4);
 console.log('PASS short chapters append from actual native end visibility, without chaining on stale lazy callbacks');
 const corrupted=fixture();await settle();corrupted.images()[0].props.onLoaded();corrupted.images()[0].props.onInvalidate();corrupted.flush(800);assert.equal(corrupted.snapshots.length,0);corrupted.show();corrupted.button('返回').props.action();assert.equal(corrupted.snapshots.length,0);
 const unavailable=fixture(0,true);await settle();unavailable.images()[0].props.onLoaded();unavailable.flush(800);unavailable.show();unavailable.button('返回').props.action();assert.equal(unavailable.dismissals,1);
 console.log('PASS storage failures cannot throw from the debounce timer or trap the reader on exit');
 console.log('PASS one-shot restoration, no late timer snapback, unconfirmed close cannot erase saved progress, explicit chapter selection starts at page one');
})().catch(error=>{console.error(error);process.exitCode=1});
