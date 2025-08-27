// ====== 設定 ======
const WORDS = [
  "hello","world","neko","purr","hiss","keyboard","browser","function","variable","object",
  "array","string","promise","await","python","iphone","window","document","internet","school",
  "family","camera","video","program","science","ocean","fishing","student","teacher","holiday",
  "vacation","battery","lemon","tomato","drone","rocket","typing","speed","combo","coding"
];
const GAME_SECONDS = 60;

// ====== 状態 ======
let timeLeft = GAME_SECONDS, timerId = null;
let currentWord = "", nextWord = "", idx = 0;
let typed = 0, correct = 0, misses = 0, combo = 0;

// ====== 要素 ======
const startBtn = document.getElementById("startBtn");
const dangerBtn = document.getElementById("dangerBtn");
const timeEl = document.getElementById("time");
const wpmEl = document.getElementById("wpm");
const accEl = document.getElementById("acc");
const missEl = document.getElementById("miss");
const comboEl = document.getElementById("combo");
const targetEl = document.getElementById("target");
const previewEl = document.getElementById("preview");
const inputEl = document.getElementById("input");
const barFill = document.getElementById("barFill");
const cat = document.getElementById("cat");
const speech = document.getElementById("speech");

// ====== Web Audio（ごろごろ/シャー 合成） ======
let audioCtx;
function ensureAudio(){ if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
function playPurr(ms=300){
  ensureAudio();
  const ctx = audioCtx;
  const carrier = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  carrier.type="triangle"; carrier.frequency.value=45; gain.gain.value=0.0;
  lfo.type="sine"; lfo.frequency.value=22; lfoGain.gain.value=0.25;
  lfo.connect(lfoGain); lfoGain.connect(gain.gain);
  carrier.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.setTargetAtTime(0.15, now, 0.005);
  carrier.start(now); lfo.start(now);
  carrier.stop(now + ms/1000); lfo.stop(now + ms/1000);
}
function playHiss(ms=250){
  ensureAudio();
  const ctx = audioCtx;
  const bufferSize = Math.max(1, Math.floor(ms*48));
  const buffer = ctx.createBuffer(1, bufferSize, 48000);
  const data = buffer.getChannelData(0);
  for (let i=0;i<buffer.length;i++) data[i] = (Math.random()*2-1)*0.5;
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=2000;
  const gain = ctx.createGain(); gain.gain.value=0.0;
  src.connect(hp).connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(0.6, now+0.02);
  gain.gain.exponentialRampToValueAtTime(0.02, now+ms/1000);
  src.start(now); src.stop(now + ms/1000);
}

// ====== 動画オーバーレイ ======
const overlay = document.getElementById("videoOverlay");
const videoEl = document.getElementById("overlayVideo");
const closeBtn = document.getElementById("overlayClose");

function showOverlay(){ overlay.classList.add("show"); overlay.setAttribute("aria-hidden","false"); }
function hideOverlay(){
  overlay.classList.remove("show"); overlay.setAttribute("aria-hidden","true");
  videoEl.pause(); videoEl.removeAttribute("src"); videoEl.load();
}
closeBtn.addEventListener("click", hideOverlay);
overlay.addEventListener("click", (e)=>{ if (e.target === overlay) hideOverlay(); });

async function playVideoFile(filename, {autoclose=true} = {}){
  // ファイル名に全角括弧等が入ってもOKに
  const src = encodeURI(filename);
  videoEl.muted = false;
  videoEl.controls = true;
  videoEl.src = src;
  showOverlay();

  // 自動再生制限対策：失敗したら一度ミュートして再試行
  try {
    await videoEl.play();
  } catch (err) {
    try {
      videoEl.muted = true;
      await videoEl.play();
    } catch (e) {
      // それでもダメならユーザにクリックしてもらう
    }
  }

  // 終了で自動クローズ
  if (autoclose) {
    const onEnd = () => { videoEl.removeEventListener("ended", onEnd); hideOverlay(); };
    videoEl.addEventListener("ended", onEnd);
  }
}

// ミス動画は連発しない（3秒クールダウン）
let lastScoldAt = 0;
function playScoldVideo(){
  const now = Date.now();
  if (now - lastScoldAt < 3000) return;
  lastScoldAt = now;
  playVideoFile("叱られる猫.mp4");
}
function playFinishVideo(){
  playVideoFile("Dubidubidu猫（ちぴちゃぱ）.mp4");
}
function playExplosion(){
  document.body.classList.add("boom");
  setTimeout(()=>document.body.classList.remove("boom"), 700);
  playVideoFile("爆発素材.mp4", {autoclose:false}); // ユーザーに閉じてもらう
}

// ====== ユーティリティ ======
const rand = arr => arr[Math.floor(Math.random()*arr.length)];
function setWords(){
  currentWord = rand(WORDS);
  nextWord = rand(WORDS);
  idx = 0;
  renderWord();
  previewEl.textContent = nextWord;
  inputEl.value = "";
  updateBar();
}
function renderWord(){
  targetEl.innerHTML = "";
  [...currentWord].forEach((ch,i)=>{
    const sp = document.createElement("span");
    sp.textContent = ch;
    sp.className = "char" + (i < idx ? " good" : "");
    targetEl.appendChild(sp);
  });
}
function updateBar(){
  const r = idx/Math.max(1,currentWord.length);
  barFill.style.width = (r*100).toFixed(1) + "%";
}
function updateStats(){
  const elapsed = GAME_SECONDS - timeLeft;
  const minutes = Math.max(elapsed/60, 1/60);
  const wpm = Math.round((correct/5)/minutes);
  const acc = typed ? Math.round((correct/typed)*100) : 0;
  wpmEl.textContent = wpm;
  accEl.textContent = acc;
  missEl.textContent = misses;
  comboEl.textContent = combo;
}

// 画面に肉球エフェクト
function spawnPaw(x,y,text="✨🐾"){
  const el = document.createElement("div");
  el.className = "paw"; el.textContent = text;
  el.style.left = x+"px"; el.style.top = y+"px";
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 700);
}

// 猫リアクション
function reactPurr(){
  cat.classList.remove("hiss"); cat.classList.add("purr");
  speech.textContent = "ごろごろ…";
  playPurr(280);
  setTimeout(()=>cat.classList.remove("purr"), 320);
}
function reactHiss(){
  cat.classList.remove("purr"); cat.classList.add("hiss");
  speech.textContent = "シャー！";
  playHiss(240);
  setTimeout(()=>{ if (cat.classList.contains("hiss")) cat.classList.remove("hiss"); }, 300);
}

// ====== ゲーム開始/終了 ======
function resetAll(){
  timeLeft = GAME_SECONDS;
  clearInterval(timerId); timerId = null;
  typed = 0; correct = 0; misses = 0; combo = 0;
  timeEl.textContent = timeLeft;
  updateStats();
  barFill.style.width = "0%";
  targetEl.innerHTML = ""; previewEl.textContent = ""; inputEl.value = "";
  speech.textContent = "にゃー";
}
startBtn.addEventListener("click", ()=>{
  resetAll();
  setWords();
  inputEl.disabled = false;
  inputEl.focus();
  startBtn.disabled = true;

  timerId = setInterval(()=>{
    timeLeft--;
    timeEl.textContent = timeLeft;
    if (timeLeft <= 0){
      clearInterval(timerId);
      inputEl.disabled = true;
      startBtn.disabled = false;
      startBtn.textContent = "もう一度";
      speech.textContent = `結果: WPM ${wpmEl.textContent} / 正確率 ${accEl.textContent}%`;
      playFinishVideo(); // ← 終了後の動画
    }
  }, 1000);
});

// ====== 入力処理 ======
inputEl.addEventListener("input", ()=>{
  if (!timerId) return;
  const v = inputEl.value;
  if (v.length < idx){ // バックスペース対応
    idx = v.length; renderWord(); updateBar(); return;
  }
  const ch = v[v.length-1];
  typed++;
  if (ch === currentWord[idx]){
    correct++; idx++; combo++;
    renderWord(); updateBar(); reactPurr();
    if (combo % 5 === 0){
      const rect = targetEl.getBoundingClientRect();
      spawnPaw(rect.left + rect.width*Math.random(), rect.top + rect.height*Math.random());
    }
    if (idx === currentWord.length) setWords();
  } else {
    misses++; combo = 0;
    const sp = targetEl.children[idx];
    if (sp){ sp.classList.add("bad"); setTimeout(()=>sp.classList.remove("bad"), 140); }
    reactHiss();
    const r = targetEl.getBoundingClientRect();
    spawnPaw(r.left + r.width*Math.random(), r.bottom, "×");
    playScoldVideo(); // ← ミス時の動画
  }
  updateStats();
});

// Enterでスキップ
inputEl.addEventListener("keydown", (e)=>{
  if (e.key === "Enter"){ setWords(); combo = 0; updateStats(); }
});

// 危険ボタン
dangerBtn.addEventListener("click", ()=>{
  playExplosion(); // ← 爆発動画
});
