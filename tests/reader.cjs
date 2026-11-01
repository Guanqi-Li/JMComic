const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const ts=require(process.env.TS_COMPILER||'typescript'),root=path.resolve(__dirname,'../JMComic');
const chapters=[{id:'3',order:3,title:'Three'},{id:'2',order:2,title:'Two'},{id:'1',order:1,title:'One'}].map(c=>({...c,updatedAt:''}));
const makePages=id=>[0,1].map(index=>({id:id+'_'+index,index,loadLocalFile:async()=>'/decoded/'+id+index+'.png'}));
function evaluate(file,requireMock,context={}){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;vm.runInNewContext('(function(require,module,exports){'+js+'})',context)(requireMock,m,m.exports);return m.exports;}
const {ChapterStream}=evaluate('features/reader/chapter-stream.ts',()=>({}));
(async()=>{
 let calls=0;const stream=new ChapterStream(chapters,chapters[2],makePages('1'),async c=>{calls++;await Promise.resolve();return makePages(c.id)});
 await Promise.all([stream.appendNext(),stream.appendNext()]);assert.equal(calls,1);assert.equal(stream.segments.length,2);assert.equal(stream.pages.length,4);assert.equal(stream.pages[0].id,'1:1_0');assert.equal(stream.segmentAt(2).chapter.id,'2');assert.equal(stream.segmentAt(2).count,2);
 await stream.appendNext();assert.equal(stream.segments.at(-1).chapter.id,'3');assert.equal(await stream.appendNext(),false);
 let release;const stale=new ChapterStream(chapters,chapters[2],makePages('1'),c=>c.id==='2'?new Promise(r=>release=r):Promise.resolve(makePages(c.id)));
 const pending=stale.appendNext();await stale.select(chapters[0]);release(makePages('2'));await pending;assert.equal(stale.segments.length,1);assert.equal(stale.segments[0].chapter.id,'3');
 console.log('PASS chapter order, deduplicated append, no skipped tail page, per-chapter boundaries, final chapter stops, stale request isolation');

 const slots=[],effects=[],timers=[],reads=[],saved=[],snapshots=[],scrolls=[];let cursor=0;
 const native=new Proxy({useObservable:v=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof v==='function'?v():v,setValue(x){this.value=x}};return slots[i]},useRef:v=>{const i=cursor++;if(!slots[i])slots[i]={current:v};return slots[i]},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]){slots[i]=deps;effects.push(fn)}},Navigation:{useDismiss:()=>()=>{},present:async()=>{}}},{get:(obj,k)=>k in obj?obj[k]:String(k)});
 const DeferredPageImage=()=>{};
 const context={Date,Promise,console,setTimeout:(fn,delay)=>{timers.push({fn,delay,cancelled:false});return timers.length},clearTimeout:id=>{if(timers[id-1])timers[id-1].cancelled=true},React:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})}};
 const mocks=id=>id==='scripting'?native:id==='./chapter-stream'?{ChapterStream}:id==='./deferred-page-image'?{DeferredPageImage}:id==='../../online-storage'?{buildOnlineReaderProgressKey:i=>i.chapterId,getOnlineChapterProgress:()=>({lastPage:0,totalPages:0}),pushOnlineReadingHistory:r=>snapshots.push(r)}:id==='../../library-storage'?{saveProgressData:(...args)=>saved.push(args)}:id==='../../jm-account'?{recordJMAccountReading:async id=>reads.push(id)}:{};
 const {ComicReaderView}=evaluate('features/reader/comic-reader-view.tsx',mocks,context);
 let fetches=0;const props={fileName:'Mock',initialPages:makePages('1'),onlineProgress:{sourceId:'zh.jmcomic',comicId:'42',chapterId:'1',chapterOrder:1,comicTitle:'Mock',chapterTitle:'One',host:'go2778'},chapters,selectedChapter:chapters[2],loadChapterPages:async chapter=>{fetches++;return makePages(chapter.id)}};
 const render=()=>{cursor=0;return ComicReaderView(props)};
 const proxy={scrollTo:(...args)=>scrolls.push(args)};
 function all(node){if(!node||typeof node!=='object')return [];return [node,...(node.children||[]).flatMap(child=>typeof child==='function'&&node.type==='ScrollViewReader'?all(child(proxy)):all(child))]}
 const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
 let tree=render();for(const effect of effects.splice(0))effect();let nodes=all(tree);
 assert.equal(tree.props.statusBarHidden,true);assert.equal(tree.props.toolbarVisibility,'hidden');assert(!nodes.some(n=>['Slider','Toolbar','NavigationStack'].includes(n.type)));assert(nodes.some(n=>n.type==='LazyVStack'&&n.props.spacing===0));
 let images=nodes.filter(n=>n.type===DeferredPageImage);images[0].props.onAppear();images[1].props.onLoaded();await settle();assert.equal(fetches,0);
 let tail=nodes.find(n=>String(n.props.key||'').startsWith('end:'));tail.props.onAppear();await settle();assert.equal(fetches,1);
 tree=render();nodes=all(tree);images=nodes.filter(n=>n.type===DeferredPageImage);assert.equal(images.length,4);assert.equal(images[0].props.item.id,'1:1_0');assert.equal(scrolls.length,0);
 // Newly appended metadata does not trigger another chapter while the old tail remains visible.
 images[3].props.onLoaded();await settle();assert.equal(fetches,1);
 tail=nodes.find(n=>String(n.props.key||'').startsWith('end:'));tail.props.onAppear();await settle();assert.equal(fetches,2);
 tree=render();nodes=all(tree);images=nodes.filter(n=>n.type===DeferredPageImage);assert.equal(images.length,6);
 images[0].props.onDisappear();images[2].props.onAppear();images[0].props.onTapGesture();tree=render();nodes=all(tree);
 for(const title of ['上一章','下一章','目录','退出阅读'])assert(nodes.some(n=>n.type==='Button'&&n.props.title===title));
 assert(!nodes.some(n=>n.type==='Slider'));for(const timer of timers.filter(t=>t.delay===800&&!t.cancelled))timer.fn();assert.equal(snapshots.at(-1).chapterId,'2');assert.equal(saved.at(-1)[1],0);assert.equal(saved.at(-1)[2],2);assert(reads.includes('2'));
 console.log('PASS immersive reader structure, zero spacing, load only at decoded tail, append without jump, transient chapter controls, per-chapter progress/history');
})().catch(error=>{console.error(error);process.exitCode=1});
