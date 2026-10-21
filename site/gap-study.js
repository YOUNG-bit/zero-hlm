(() => {
  'use strict';
  const settings = [
    {name:'S-25', region:'upper', observations:'Simulation images', actions:'Simulation actions', caption:'25 simulation demonstrations cover the upper tabletop region. Both images and action labels come from simulation.'},
    {name:'R-25', region:'lower', observations:'Real images', actions:'Real actions', caption:'25 real demonstrations cover the lower region. They provide real observations and real action labels.'},
    {name:'Mix-50', region:'both', observations:'Sim + real images', actions:'Sim + real actions', caption:'Combine S-25 and R-25: 50 demonstrations covering both regions, while retaining each source’s images and actions.'},
    {name:'Mix-50*', region:'both', observations:'Real images', actions:'Sim + real actions', caption:'Physically replay the S-25 trajectories and replace their simulation images with recorded real images. Keep their simulation action labels unchanged, then add R-25.'}
  ];
  const make = (tag, cls, text) => { const n=document.createElement(tag); n.className=cls; if(text!==undefined)n.textContent=text; return n; };
  const media='./media/research/';
  function photo(src, alt, cls='') { const image=make('img',cls);image.src=media+src;image.alt=alt;image.loading='lazy';return image; }
  let graphicId=0;
  function bananaOverlay() {
    const ns='http://www.w3.org/2000/svg', id='gap-banana-'+(++graphicId);
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 415 253');svg.setAttribute('class','gap-banana-overlay');svg.setAttribute('aria-hidden','true');
    const add=(tag,attributes,parent=svg)=>{const n=document.createElementNS(ns,tag);Object.entries(attributes).forEach(([k,v])=>n.setAttribute(k,v));parent.append(n);return n;};
    const defs=add('defs',{}), patch=add('mask',{id:id+'-patch'},defs), cutout=add('clipPath',{id:id+'-cutout'},defs);
    const feather=add('filter',{id:id+'-feather'},defs);add('feGaussianBlur',{stdDeviation:3},feather);
    add('rect',{x:232,y:103,width:122,height:74,rx:7,fill:'white',filter:'url(#'+id+'-feather)'},patch);
    add('path',{d:'M246 118 Q252 113 262 118 L280 124 Q308 134 328 124 Q330 116 340 120 L339 129 L333 139 Q332 147 319 155 Q302 166 281 161 Q257 159 246 145 Q239 136 245 129 Q250 127 246 124 Z'},cutout);
    add('image',{href:media+'gap-tabletop.jpg',x:0,y:90,width:415,height:253,mask:'url(#'+id+'-patch)'});
    ['upper','lower'].forEach(region=>{const group=add('g',{class:'gap-banana gap-banana-'+region});add('image',{href:media+'gap-tabletop.jpg',x:0,y:0,width:415,height:253,'clip-path':'url(#'+id+'-cutout)'},group);});
    return svg;
  }
  function graphic() {
    const frame=make('div','gap-table-photo');
    frame.append(photo('gap-tabletop.jpg','Original Figure 6 tabletop: upper and lower regions used for Task 1 training.'));
    frame.append(bananaOverlay());
    frame.append(make('span','gap-table-tint gap-table-upper'),make('span','gap-table-tint gap-table-lower'),make('span','gap-table-divider'));
    const labels=make('div','gap-table-labels');
    [['upper','Upper region','S-25 · 25 sim demos'],['lower','Lower region','R-25 · 25 real demos']].forEach(([region,title,detail])=>{const label=make('div','gap-table-label gap-label-'+region);label.append(make('strong','',title),make('span','',detail));labels.append(label);});
    const figure=make('div','gap-table-figure');figure.append(frame,labels);return figure;
  }
  window.renderGapStudy = function renderGapStudy(item) {
    const root=make('section','gap-study'); root.setAttribute('aria-label','Explore the action and observation gap experiment');
    const header=make('div','gap-study-header'); header.append(make('span','gap-study-eyebrow','One task. Two regions. Four training sets.'));
    const controls=make('div','gap-study-controls'); const pause=make('button','','Pause'); pause.type='button'; const replay=make('button','','Replay'); replay.type='button'; replay.setAttribute('aria-label','Replay the training-setting explanation'); controls.append(pause,replay); header.append(controls); root.append(header);
    const tabs=make('div','gap-setting-tabs'); tabs.setAttribute('role','group'); tabs.setAttribute('aria-label','Training dataset');
    const buttons=settings.map((setting,i)=>{const b=make('button','',setting.name); b.type='button'; b.addEventListener('click',()=>{manual=true;animationPaused=false;select(i);update();}); tabs.append(b);return b;}); root.append(tabs);
    const layout=make('div','gap-study-layout'); const diagram=make('div','gap-study-diagram');
    const table=make('div','gap-tabletop'); table.append(graphic(),make('span','gap-tabletop-note','Figure 6 · animated region schematic'));
    diagram.append(table);
    const observations=make('div','gap-observation-demo');
    const obsHeader=make('div','gap-observation-heading');obsHeader.append(make('span','gap-stream-label','OBSERVATIONS'));const obsText=make('strong','');obsHeader.append(obsText);observations.append(obsHeader);
    const observationImages=[];
    function observationPhoto(src, alt, cls='') {
      const image=make('img',cls); image.alt=alt; image.decoding='async';
      image.dataset.state='loading'; observationImages.push(image);
      image.addEventListener('load',()=>{image.dataset.state='ready'; updateObservationStatus();});
      image.addEventListener('error',()=>{
        if (!image.dataset.retried) {
          image.dataset.retried='true';
          image.src=media+src.split('?')[0]+'?retry='+Date.now();
          return;
        }
        image.dataset.state='error'; updateObservationStatus();
      });
      image.src=media+src;
      return image;
    }
    const observationStatus=make('p','gap-observation-status','Loading observations…');
    observationStatus.setAttribute('role','status');
    function updateObservationStatus() {
      const failed=observationImages.some(image=>image.dataset.state==='error');
      const ready=observationImages.length===3&&observationImages.every(image=>image.dataset.state==='ready');
      root.dataset.observationsReady=String(ready);
      observationStatus.hidden=ready;
      observationStatus.textContent=failed?'Images could not load. Reload images to retry.':'Loading observations…';
      retryImages.hidden=!failed;
    }
    const retryImages=make('button','gap-observation-retry','Reload images');
    retryImages.type='button';retryImages.hidden=true;
    retryImages.addEventListener('click',()=>{
      observationImages.filter(image=>image.dataset.state==='error').forEach(image=>{
        image.dataset.state='loading'; image.src=image.src.split('?')[0]+'?retry='+Date.now();
      }); updateObservationStatus();
    });
    const imageFlow=make('div','gap-observation-flow');
    const simCard=make('figure','gap-observation-card gap-sim-card');const imageLayers=make('div','gap-image-layers');imageLayers.append(observationPhoto('gap-observation-sim.jpg?v=loading-v6','Upper region: source simulation observation.','gap-before-image'),observationPhoto('gap-observation-replay.jpg?v=loading-v6','Upper region: corresponding physical replay observation.','gap-after-image'));const upperCaption=make('figcaption','','Upper · S-25 sim images');simCard.append(imageLayers,upperCaption);
    const flowArrow=make('span','gap-photo-arrow','+');flowArrow.setAttribute('aria-hidden','true');
    const realCard=make('figure','gap-observation-card gap-real-card');realCard.append(observationPhoto('gap-observation-real.jpg?v=loading-v6','Lower region: original R-25 real demonstration observation.'),make('figcaption','','Lower · R-25 real images'));
    imageFlow.append(simCard,flowArrow,realCard);observations.append(imageFlow,observationStatus,retryImages,make('p','gap-observation-note','Upper: same trajectory, same action frame · Lower: R-25 demonstration'));
    const act=make('div','gap-action-strip');act.append(make('span','gap-stream-label','ACTION LABELS'));const actText=make('strong','');act.append(actText);observations.append(act);
    const addReal=make('div','gap-add-real');addReal.append(make('span','','Re-imaged S-25'),make('span','','+ R-25'),make('strong','','→ Mix-50* · 50 demos'));observations.append(addReal);diagram.append(observations);
    const caption=make('p','gap-setting-caption'); caption.setAttribute('aria-live','polite'); diagram.append(caption); layout.append(diagram);
    const results=make('div','gap-study-results'); results.append(make('h4','','Real-world success'),make('p','gap-results-note','5 real-world trials per region · Task 1'));
    const head=make('div','gap-result-row gap-result-head'); ['Training set','Upper','Lower'].forEach(t=>head.append(make('span','',t))); results.append(head);
    const rows=Array.isArray(item?.gap_study?.rows)?item.gap_study.rows:[];
    const key=v=>String(v).toLowerCase().replace(/[^a-z0-9*]/g,'');
    const resultRows=settings.map(setting=>{
      const data=rows.find(r=>key(r.data)===key(setting.name)); const row=make('div','gap-result-row'); row.append(make('strong','',setting.name));
      ['sr_up','sr_low'].forEach(field=>{const cell=make('div','gap-result-cell'); const value=data?.[field]; const match=String(value??'').match(/^(\d+)\s*\/\s*(\d+)$/); const count=match?Number(match[1]):Number(value); const denominator=match?Number(match[2]):5; const valid=value!==undefined&&Number.isFinite(count)&&count>=0&&count<=denominator; cell.append(make('span','',valid?`${count}/${denominator}`:'—')); const track=make('div','gap-result-track'); const bar=make('i',''); bar.style.width=valid?`${count/denominator*100}%`:'0%'; track.append(bar);cell.append(track);row.append(cell); }); results.append(row);return row;
    });
    results.append(make('p','gap-results-takeaway','Mix-50* changes the observations of S-25—not its action labels.'));layout.append(results);root.append(layout);
    let selected=0,manual=false,animationPaused=false,visible=false,timer=null; const motion=matchMedia('(prefers-reduced-motion: reduce)');
    function select(index){selected=index; const s=settings[index]; root.dataset.setting=String(index); root.dataset.region=s.region; buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index))); resultRows.forEach((r,i)=>r.classList.toggle('is-selected',i===index)); obsText.textContent=index===3?'Mix-50 → Mix-50*':s.observations; upperCaption.textContent=index===3?'Upper · sim → real replay':'Upper · S-25 sim images'; actText.textContent=index===3?'Original S-25 action labels · unchanged':s.actions; flowArrow.textContent='+'; caption.textContent=s.caption; root.classList.remove('is-animating'); void root.offsetWidth; root.classList.add('is-animating');}
    function update(){ if(timer){clearTimeout(timer);timer=null;} const details=root.closest('details'); const active=visible&&!!details?.open&&!document.hidden; root.classList.toggle('is-visible',active&&!animationPaused); const running=active&&!manual&&!motion.matches; root.classList.toggle('is-running',running);pause.textContent=motion.matches?'Motion off':manual?'Play':'Pause';pause.disabled=motion.matches;pause.setAttribute('aria-pressed',String(manual)); if(running)timer=setTimeout(()=>{select((selected+1)%settings.length);update();},7500); }
    pause.addEventListener('click',()=>{manual=!manual;animationPaused=manual;update();}); replay.addEventListener('click',()=>{manual=false;animationPaused=false;select(0);update();});
    requestAnimationFrame(()=>{const details=root.closest('details'); details?.addEventListener('toggle',update); const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();},{threshold:.2});observer.observe(root);document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);update();}); select(0); return root;
  };
})();
