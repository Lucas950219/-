import {COUNTRY_INFO,emptyFilters,parseIntent,createRetriever,formatDistance,summarize,buildPrompt,informationNotice} from './engine.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
let data,retrieve,current,filters=emptyFilters(),limit=8,modelWorker,engine=null,aiBusy=false,questionBusy=false;
let lastQuestionFilters=null;
let favorites=new Set();try{favorites=new Set(JSON.parse(localStorage.getItem('taipei-food-favorites-v1')||'[]'));}catch{}
const scenes={台灣:['#e8eadb','#6b7b59','台灣好味','🍜'],日本:['#f0e1d9','#a97b64','和の味','🍱'],韓國:['#e5e7de','#6d7b65','맛있는','🥘'],泰國:['#e8e9d5','#8a9160','อร่อย','🍛'],香港:['#efe2cf','#ac8b5b','港味日常','🥟'],中國:['#eddfd7','#a77660','食味人間','🥢'],義大利:['#e8e6d5','#8a8c62','BUON APPETITO','🍝'],美國:['#ebe2d4','#ae8a5e','GOOD FOOD','🍔'],印度:['#efe4d2','#b28c4d','स्वादिष्ट','🍛']};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function sourceLinks(ids,short=false){return [...new Set(ids)].map(id=>data.sources.find(s=>s.id===id)).filter(Boolean).map((s,i)=>`<a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${short?'來源 '+(i+1):esc(s.title)} ↗</a>`).join('');}
function navigateURL(r){return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent('台北車站中央大廳')+'&destination='+encodeURIComponent(r.name+' '+r.address)+'&travelmode=walking';}
function card(r,index=0){
  const restaurant=r.restaurant,food=r.food,scene=scenes[food.country]||scenes.台灣;
  const flag=COUNTRY_INFO[food.country]?.[0]||'🌏',saved=favorites.has(restaurant.id);
  const emoji=/麵|河粉/.test(food.name)?'🍜':/披薩/.test(food.name)?'🍕':/咖哩/.test(food.name)?'🍛':/壽司|握/.test(food.name)?'🍣':/漢堡/.test(food.name)?'🍔':/包|餃|燒賣/.test(food.name)?'🥟':/甜|豆花|湯圓|冰/.test(food.name)?'🍨':scene[3];
  return `<article class="restaurant-card" id="restaurant-${esc(restaurant.id)}" data-restaurant="${esc(restaurant.id)}"><div class="card-scene" style="--scene-bg:${scene[0]};--scene-ink:${scene[1]}"><span class="card-country">${flag} ${esc(food.country)}風味</span><button class="save-button ${saved?'saved':''}" data-save="${esc(restaurant.id)}" aria-label="${saved?'取消收藏':'收藏'}${esc(restaurant.name)}" aria-pressed="${saved}">${saved?'♥':'♡'}</button><span class="scene-word">${scene[2]}</span><span class="scene-lines"></span><span class="food-emoji" aria-hidden="true">${emoji}</span></div><div class="card-body"><div class="card-title-row"><h3>${esc(restaurant.name)}</h3><span class="card-distance">⌖ ${formatDistance(r.distance)}</span></div><p class="card-dish" title="${esc(r.matches.slice(0,4).map(f=>f.name).join('・'))}">${esc(food.name)}${r.matches.length>1?' · 等 '+r.matches.length+' 種選擇':''}</p><div class="card-tags">${[...new Set([...food.staples,...food.proteins])].slice(0,4).map(x=>`<span>${esc(x)}</span>`).join('')}<span>${food.supplyStatus==='brand-menu'?'分店供應待確認':'分店公開餐點'}</span></div><p class="card-address">${esc(restaurant.address)}</p><div class="card-bottom"><span class="card-score">✧ 符合分數 <b>${Math.round(r.score*100)}</b> / 100</span><a href="${esc(navigateURL(restaurant))}" target="_blank" rel="noopener noreferrer" aria-label="導航到${esc(restaurant.name)}">查看導航 ↗</a></div><div class="card-sources">${sourceLinks([...(food.sourceIds||[]),...(restaurant.sourceIds||[])].slice(0,2),true)}</div></div></article>`;
}
function renderFilters(){
  const counts={};data.foods.forEach(f=>counts[f.country]=(counts[f.country]||0)+1);
  $('#country-filters').innerHTML=Object.keys(counts).sort((a,b)=>Object.keys(COUNTRY_INFO).indexOf(a)-Object.keys(COUNTRY_INFO).indexOf(b)).map(c=>`<button type="button" class="filter-button ${filters.countries.includes(c)?'selected':''}" data-filter="countries" data-value="${esc(c)}" aria-pressed="${filters.countries.includes(c)}"><span class="country-flag">${COUNTRY_INFO[c]?.[0]||'🌏'}</span>${esc(c)}<span>${counts[c]}</span></button>`).join('');
  for(const [id,key,values] of [['staple-filters','staples',['麵','飯','麵包','點心','其他']],['protein-filters','proteins',['牛肉','豬肉','雞肉','海鮮','蔬食','蛋奶']]]){
    $('#'+id).innerHTML=values.map(v=>`<button type="button" class="filter-button ${filters[key].includes(v)?'selected':''}" data-filter="${key}" data-value="${v}" aria-pressed="${filters[key].includes(v)}">${v}</button>`).join('');
  }
  $('#radius').max=String(Math.max(3000,filters.radius));$('#radius').value=filters.radius;$('#radius-output').textContent=formatDistance(filters.radius);
  $('#weight').value=filters.weight;$('#weight-output').textContent=filters.weight+'%';
}
function renderResults(){
  current=retrieve(filters,$('#sort').value);
  const {results,matchedFoods}=current;
  $('#result-count').textContent=results.length+' 家';
  $('#results-caption').textContent=`${matchedFoods} 種餐點符合條件 · ${current.ranking.mode==='text'?'餐點關鍵字比對':'條件篩選'} · 直線距離`;
  const tags=[...filters.countries,...filters.staples,...filters.proteins,...filters.excludedProteins.map(x=>'排除'+x),...filters.excludedStaples.map(x=>'排除'+x)];
  $('#active-filters').innerHTML=tags.map(t=>`<span class="active-filter">${esc(t)}</span>`).join('')+(filters.query?`<button class="active-filter" id="clear-query" title="清除問句與搜尋條件">問句：${esc(filters.query.slice(0,25))} ×</button>`:'');
  $('#results').innerHTML=results.length?results.slice(0,limit).map(card).join(''):`<div class="empty-state"><strong>${current.ranking.rejectedForRelevance?'餐點關鍵字的相符資料不足。':'換個條件，發現另一種好味道。'}</strong>${current.ranking.rejectedForRelevance?'候選資料未通過相關度門檻，距離近也不會補進推薦。<br>試試其他菜名或料理關鍵字。':`目前 ${formatDistance(filters.radius)} 內沒有符合全部條件的餐點。<br>試試放寬距離或減少一項篩選。`}<br><button id="empty-reset">重設篩選條件</button></div>`;
  $('#load-more').hidden=results.length<=limit;
  $('#formula').textContent=`綜合分數 = 相關度 × (${100-filters.weight}% + ${filters.weight}% × 距離分數)。${current.ranking.mode==='text'?'相關度由 65% 關鍵字覆蓋率與 35% 原始餘弦相似度組成，先通過門檻才排序。':'本次未指定額外餐點關鍵字，依已選條件篩選後，以距離調整順序。'}符合分數不是店家評分或機率。`;
  if(!$('#map-panel').hidden)renderMap();
}
function render(){renderFilters();renderResults();updateFavoriteCount();}
function reset(){
  filters=emptyFilters();limit=8;lastQuestionFilters=null;
  $('#reuse-conditions').checked=false;
  $('#reuse-conditions').disabled=true;
  $('#question').value='';$('#chat-history').replaceChildren();render();
}
function updateFavoriteCount(){$('#favorite-count').textContent=favorites.size;}
function renderFavorites(){
  const all=retrieve({...emptyFilters(),radius:10000}).results.filter(r=>favorites.has(r.restaurant.id));
  $('#favorite-results').innerHTML=all.length?all.map(card).join(''):'<p class="favorite-empty">點選餐廳卡片上的 ♡，把想吃的留在這裡。</p>';
}
function toggleFavorite(id){
  const name=data.restaurants.find(r=>r.id===id)?.name||'餐廳';
  if(favorites.has(id)){favorites.delete(id);toast('已移除收藏');}else{favorites.add(id);toast('已收藏 '+name);}
  try{localStorage.setItem('taipei-food-favorites-v1',JSON.stringify([...favorites]));}catch{toast('此瀏覽器無法保存收藏，暫存於本次頁面。');}
  updateFavoriteCount();renderResults();if($('#favorites-dialog').open)renderFavorites();
}
function renderMap(){
  const results=current.results;
  const scale=190/Math.max(750,...results.map(r=>r.distance));
  const pins=results.map((r,i)=>{
    // Small offsets separate restaurants that share a mall building coordinate.
    const same=results.filter(x=>x.restaurant.lat===r.restaurant.lat&&x.restaurant.lng===r.restaurant.lng);
    const pos=same.findIndex(x=>x.restaurant.id===r.restaurant.id),angle=pos*2*Math.PI/Math.max(1,same.length);
    const offset=same.length>1?Math.min(36,same.length*3):0;
    const x=320+(r.restaurant.lng-data.center.lng)*100800*scale+Math.cos(angle)*offset;
    const y=225-(r.restaurant.lat-data.center.lat)*111200*scale+Math.sin(angle)*offset;
    return `<g class="map-pin" data-map-id="${esc(r.restaurant.id)}" role="button" tabindex="0" aria-label="${i+1} ${esc(r.restaurant.name)}，直線距離${formatDistance(r.distance)}"><title>${esc(r.restaurant.name)} · ${formatDistance(r.distance)}</title><circle cx="${x}" cy="${y}" r="13" fill="#687956" stroke="#fffdf3" stroke-width="2"/><text x="${x}" y="${y+4}" fill="white" text-anchor="middle" font-size="10" font-family="Arial">${i+1}</text></g>`;
  }).join('');
  $('#neighborhood-map').innerHTML=`<svg viewBox="0 0 640 450" role="img" aria-labelledby="map-title"><title id="map-title">以台北車站為中心的餐廳相對位置示意圖，編號可點擊</title><defs><pattern id="map-grid" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M45 0H0V45" fill="none" stroke="#e4e5d5" stroke-width="1"/></pattern></defs><rect width="640" height="450" fill="url(#map-grid)"/><circle cx="320" cy="225" r="${500*scale}" fill="none" stroke="#bfc7a9" stroke-dasharray="4 5"/><circle cx="320" cy="225" r="${1000*scale}" fill="none" stroke="#d2d8be" stroke-dasharray="4 5"/><path d="M0 225H640M320 0V450" stroke="#d6dcc6"/><text x="332" y="24" class="map-text">北 N ↑</text><text x="28" y="31" class="map-text">NEIGHBORHOOD COMPASS</text><text x="${326+500*scale}" y="219" class="map-text">500m</text><rect x="276" y="212" width="88" height="30" rx="8" fill="#fbf8e9" stroke="#c98b6b"/><text x="320" y="232" text-anchor="middle" class="map-heading">◎ 台北車站</text>${pins}</svg>`;
}
function jumpToRestaurant(id){
  limit=Math.max(limit,current.results.findIndex(r=>r.restaurant.id===id)+1);renderResults();
  const card=document.getElementById('restaurant-'+id);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.classList.add('card-highlight');setTimeout(()=>card?.classList.remove('card-highlight'),2200);
}
function renderKnowledge(){
  const search=$('#knowledge-search').value.trim().toLocaleLowerCase();
  const restaurants=new Map(data.restaurants.map(r=>[r.id,r]));
  const foods=data.foods.filter(f=>[f.name,restaurants.get(f.restaurantId).name,f.country,...f.tags].join(' ').toLowerCase().includes(search));
  $('#knowledge-records').innerHTML=foods.length?foods.map(f=>`<div class="knowledge-row"><strong>${esc(f.name)}</strong><span>${esc(restaurants.get(f.restaurantId).name)} · ${esc(f.country)}</span><small>${esc([...f.staples,...f.proteins].join(' · ')||'主要食材未確認')} · ${f.supplyStatus==='brand-menu'?'品牌菜單，分店供應待確認':'分店公開餐點，當日供應依店家'}</small><div>${sourceLinks(f.sourceIds,true)}</div></div>`).join(''):'<p class="favorite-empty">找不到符合的餐點。</p>';
}
function addTrace(answer,result,snapshot,messages,willSend){
  const references=result.results.slice(0,3);
  const citations=document.createElement('div');citations.className='answer-citations';
  citations.innerHTML=references.map((r,i)=>{const s=data.sources.find(s=>s.id===r.food.sourceIds[0]);return s?`<a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">[${i+1}] ${esc(r.restaurant.name)} ↗</a>`:'';}).join('');answer.append(citations);
  const details=document.createElement('details');details.className='retrieval-trace';
  details.innerHTML=`<summary>查看本次檢索依據 · ${references.length} 個片段</summary><p>${result.ranking.mode==='text'?'別名正規化後，以中文單字／雙字 TF-IDF 檢索額外餐點關鍵字；覆蓋率至少 60%、原始餘弦相似度至少 0.04 才列入推薦。':'本次是條件篩選，未指定額外餐點關鍵字，不以文字相似度充當符合依據。'}距離權重 ${snapshot.weight}%，只調整符合資料的排序。${result.ranking.rejectedForRelevance?`已排除 ${result.ranking.rejectedForRelevance} 筆相關度不足的候選餐點。`:''}</p>`+references.map(r=>`<div class="trace-row">${esc(r.food.name)} · ${esc(r.restaurant.name)}<br>${r.matchMode==='text'?`餐點關鍵字相似度 ${r.focusSimilarity.toFixed(3)} · 覆蓋率 ${Math.round(r.coverage*100)}%`:'已符合分類與食材條件'} · 直線 ${formatDistance(r.distance)} · 綜合 ${Math.round(r.score*100)} 分<br>${sourceLinks(r.food.sourceIds,true)}</div>`).join('');answer.append(details);
  const prompt=document.createElement('details');
  prompt.className='prompt-preview';
  const heading=document.createElement('summary');
  heading.textContent='提示詞';
  prompt.append(heading);
  if(!willSend){
    const note=document.createElement('p');
    note.textContent=result.results.length?'目前使用檢索摘要。以下是本次查詢的 AI 提示詞預覽。':'本次查詢沒有符合的資料。以下是包含空白檢索結果的提示詞預覽。';
    prompt.append(note);
  }
  for(const {role,content} of messages){
    const label=document.createElement('h4');
    label.textContent=role==='system'?'系統指令':'使用者問題與檢索資料';
    const value=document.createElement('pre');
    value.textContent=content;
    prompt.append(label,value);
  }
  details.append(prompt);
}
async function ask(question,reuseConditions=false){
  if(!data||questionBusy)return;
  question=question.trim();if(!question)return;
  questionBusy=true;$('#ask-submit').disabled=true;
  const base=reuseConditions&&lastQuestionFilters?lastQuestionFilters:emptyFilters();
  filters=parseIntent(question,base);
  lastQuestionFilters=structuredClone(filters);
  $('#reuse-conditions').disabled=false;
  limit=8;render();
  const snapshot=structuredClone(filters),result=retrieve(snapshot);
  const messages=buildPrompt(result,question,snapshot);
  const willSend=Boolean(engine&&result.results.length);
  const message=document.createElement('div');message.className='chat-message';
  const q=document.createElement('div');q.className='chat-question';q.textContent=question;message.append(q);
  const answer=document.createElement('div');answer.className='chat-answer';
  const label=document.createElement('h3');label.textContent=engine?'✦ AI 正在根據檢索資料整理回答…':'✧ 根據美食知識庫的檢索摘要';answer.append(label);
  const body=document.createElement('div');body.textContent=summarize(result,snapshot);answer.append(body);message.append(answer);
  addTrace(answer,result,snapshot,messages,willSend);
  $('#chat-history').replaceChildren(message);
  $('#question').value='';
  try{
    if(willSend){
      const response=await engine.chat.completions.create({messages,temperature:.2,max_tokens:500,stream:false});
      const generated=response.choices?.[0]?.message?.content?.trim();
      if(generated){
        const notice=informationNotice(snapshot);
        body.textContent=notice&&!generated.includes(notice)?`${generated}\n\n${notice}`:generated;
        label.textContent='✦ AI 回答 · 根據本次檢索結果';
      }else label.textContent='✧ 模型未回傳內容，顯示檢索摘要';
    }else if(engine)label.textContent='✧ 沒有符合資料，顯示檢索摘要';
  }catch(error){label.textContent='✧ AI 本次無法完成，改用檢索摘要';console.warn('Local model completion failed:',error);}
  finally{questionBusy=false;$('#ask-submit').disabled=false;}
}
async function loadAI(){
  if(aiBusy||engine)return;
  const status=$('#model-status');
  if(!navigator.gpu){status.textContent='這台裝置尚未提供 WebGPU。你仍可使用完整的知識檢索摘要與推薦功能。';return;}
  const adapter=await navigator.gpu.requestAdapter().catch(()=>null);
  if(!adapter){status.textContent='無法取得 WebGPU 裝置，請使用檢索摘要。';return;}
  aiBusy=true;$('#load-ai').disabled=true;$('#model-progress').hidden=false;status.textContent='正在載入 AI 引擎，接著會下載模型…';
  try{
    const {CreateWebWorkerMLCEngine}=await import('https://esm.run/@mlc-ai/web-llm@0.2.88');
    modelWorker=new Worker(new URL('./llm-worker.js',import.meta.url),{type:'module'});
    engine=await CreateWebWorkerMLCEngine(modelWorker,'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',{initProgressCallback:report=>{status.textContent=report.text;$('#model-progress').value=report.progress;}});
    $('#mode-label').textContent='AI 生成模式';status.textContent='AI 已準備好。下一次提問會使用檢索結果生成回答。';$('#load-ai').textContent='AI 已啟用';toast('本機 AI 已啟用，可以開始提問');
  }catch(error){modelWorker?.terminate();modelWorker=null;engine=null;status.textContent='模型載入未完成：'+String(error.message||error).slice(0,180)+'。可重試或使用檢索摘要。';$('#load-ai').disabled=false;$('#model-progress').hidden=true;}
  finally{aiBusy=false;}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('button,[data-map-id]');if(!target)return;
  if(target.dataset.save){toggleFavorite(target.dataset.save);return;}
  if(target.dataset.question){ask(target.dataset.question);return;}
  if(target.dataset.filter){const key=target.dataset.filter,value=target.dataset.value;filters[key]=filters[key].includes(value)?filters[key].filter(x=>x!==value):[...filters[key],value];if(key==='proteins')filters.excludedProteins=filters.excludedProteins.filter(x=>x!==value);if(key==='staples')filters.excludedStaples=filters.excludedStaples.filter(x=>x!==value);limit=8;render();return;}
  if(target.dataset.mapId){jumpToRestaurant(target.dataset.mapId);return;}
  if(target.classList.contains('dialog-close')){target.closest('dialog').close();return;}
  if(['reset-filters','empty-reset','clear-query'].includes(target.id)){reset();return;}
});
$('#ask-form').addEventListener('submit',event=>{event.preventDefault();ask($('#question').value,$('#reuse-conditions').checked);});
$('#knowledge-open').addEventListener('click',()=>{renderKnowledge();$('#knowledge-dialog').showModal();});
$('#sources-open').addEventListener('click',()=>{renderKnowledge();$('#knowledge-dialog').showModal();$('#source-list').scrollIntoView({block:'start'});});
$('#knowledge-search').addEventListener('input',renderKnowledge);
$('#favorites-open').addEventListener('click',()=>{renderFavorites();$('#favorites-dialog').showModal();});
$('#ai-open').addEventListener('click',()=>$('#ai-dialog').showModal());
$('#load-ai').addEventListener('click',loadAI);
$('#use-summary').addEventListener('click',async()=>{if(aiBusy){toast('模型仍在載入，請稍候或關閉設定繼續探索。');return;}if(questionBusy){toast('回答完成後即可切換模式。');return;}if(engine)await engine.unload().catch(()=>{});modelWorker?.terminate();modelWorker=null;engine=null;$('#mode-label').textContent='檢索摘要模式';$('#load-ai').disabled=false;$('#load-ai').textContent='下載並啟用 AI';$('#model-status').textContent='';$('#model-progress').hidden=true;$('#ai-dialog').close();});
for(const id of ['radius','weight'])$('#'+id).addEventListener('input',()=>{filters[id]=Number($('#'+id).value);limit=8;render();});
$('#sort').addEventListener('change',renderResults);
$('#load-more').addEventListener('click',()=>{limit+=8;renderResults();});
function switchView(map){$('#map-panel').hidden=!map;$('#list-view').classList.toggle('active',!map);$('#map-view').classList.toggle('active',map);$('#list-view').setAttribute('aria-pressed',String(!map));$('#map-view').setAttribute('aria-pressed',String(map));if(map)renderMap();}
$('#map-view').addEventListener('click',()=>switchView(true));$('#list-view').addEventListener('click',()=>switchView(false));
$('#neighborhood-map').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.dataset.mapId){event.preventDefault();jumpToRestaurant(event.target.dataset.mapId);}});
try{
  const response=await fetch(new URL('./data/knowledge.json',import.meta.url));if(!response.ok)throw new Error('HTTP '+response.status);
  data=await response.json();retrieve=createRetriever(data);
  $('#food-total').textContent=data.foods.length;$('#nav-count').textContent=data.foods.length;$('#restaurant-total').textContent=data.restaurants.length;$('#country-total').textContent=new Set(data.foods.map(f=>f.country)).size;
  $('#updated-at').textContent='資料查閱 '+data.updatedAt;
  const valid=new Set(data.restaurants.map(r=>r.id));favorites=new Set([...favorites].filter(id=>valid.has(id)));
  $('#source-list').innerHTML=data.sources.map(s=>`<div class="source-item"><a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${s.kind==='official'?'官方資料':s.kind==='ordering'?'公開訂餐頁':'公開餐飲介紹'} · 查閱 ${esc(s.checkedAt)} · 查閱日不等於菜單更新日</small></div>`).join('');
  render();
}catch(error){$('#results').innerHTML='<div class="empty-state"><strong>美食知識庫暫時無法讀取</strong>請確認網路後重新整理。若在本機開啟，請使用 HTTP 伺服器。<br><button onclick="location.reload()">重新讀取</button></div>';$('#results-caption').textContent='知識庫載入失敗';for(const button of document.querySelectorAll('.site-header button,.suggestions button,#ask-submit,#knowledge-open,#sources-open'))button.disabled=true;console.error(error);}
