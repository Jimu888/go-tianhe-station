function byId(id){return document.getElementById(id)}

const nameInput = byId('nameInput')
const btnDownload = byId('btnDownload')
const btnCopy = byId('btnCopy')
const copyText = byId('copyText')
const calibPanel = byId('calibPanel')
const btnCalibCopy = byId('btnCalibCopy')
const btnCalibDownload = byId('btnCalibDownload')

const btnNameUp = byId('btnNameUp')
const btnNameDown = byId('btnNameDown')
const btnNameLeft = byId('btnNameLeft')
const btnNameRight = byId('btnNameRight')
const btnNameStep = byId('btnNameStep')

const btnNoUp = byId('btnNoUp')
const btnNoDown = byId('btnNoDown')
const btnNoLeft = byId('btnNoLeft')
const btnNoRight = byId('btnNoRight')
const btnNoStep = byId('btnNoStep')

const nameText = byId('nameText')
const noText = byId('noText')
const posterImg = byId('posterImg')
const shareCard = byId('shareCard')
const closedState = byId('closedState')
const openState = byId('openState')

// export (unscaled) target
const exportCard = byId('exportCard')
const exportPosterImg = byId('exportPosterImg')
const exportNameText = byId('exportNameText')
const exportNoText = byId('exportNoText')

function normalizeText(s){
  return (s ?? '').toString().trim().slice(0, 16)
}

function setNameTextOnly(){
  const name = normalizeText(nameInput.value) || '章人丹'
  nameText.textContent = name
  if (exportNameText) exportNameText.textContent = name
}

function autoFitName(nameEl, basePx){
  const name = nameEl.textContent || ''
  const len = name.length
  let scale = 1
  if (len >= 10) scale = 0.70
  else if (len >= 8) scale = 0.78
  else if (len >= 6) scale = 0.86
  nameEl.style.fontSize = Math.round(basePx * scale) + 'px'
}

function getTurnstileToken(){
  // Turnstile puts token into a hidden input named 'cf-turnstile-response'
  const el = document.querySelector('input[name="cf-turnstile-response"]')
  return (el && el.value) ? el.value : ''
}

let cardConfigs = null

async function loadCardConfigs(){
  if (cardConfigs) return cardConfigs
  const r = await fetch('/configs/cards.json', { cache: 'no-store' })
  const t = await r.text()
  try { cardConfigs = JSON.parse(t) } catch { cardConfigs = null }
  return cardConfigs
}

let currentCardTypeId = 1

function applyOverlayLayoutTo(cardTypeId, imgEl, nameEl, noEl, cardEl){
  if (!cardConfigs) return
  const cfg = cardConfigs[String(cardTypeId)]
  if (!cfg?.nameBox || !cfg?.noBox) return

  const iw = imgEl.naturalWidth || 1
  const ih = imgEl.naturalHeight || 1
  const cw = cardEl.clientWidth || 1
  const ch = cardEl.clientHeight || 1

  const sx = cw / iw
  const sy = ch / ih

  const nb = cfg.nameBox
  const xb = cfg.noBox

  // Use calibrated coordinates directly (allow negatives), only clamp extreme values
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
  let nameLeft = nb.x * sx
  let nameTop  = nb.y * sy
  let noLeft   = xb.x * sx
  let noTop    = xb.y * sy

  nameLeft = clamp(nameLeft, -220, cw + 220)
  nameTop  = clamp(nameTop, -220, ch + 220)
  noLeft   = clamp(noLeft, -220, cw + 220)
  noTop    = clamp(noTop, -220, ch + 220)

  // global nudge for name
  const NAME_NUDGE_X = 20
  nameEl.style.left = Math.round(nameLeft + NAME_NUDGE_X) + 'px'
  nameEl.style.top  = Math.round(nameTop) + 'px'
  noEl.style.left   = Math.round(noLeft) + 'px'
  noEl.style.top    = Math.round(noTop) + 'px'

  // font sizes derived from calibrated heights (trust h)
  const nameBase = Math.max(14, Math.min(90, Math.round((nb.h || 420) * sy * 0.85)))
  const noBase = Math.max(12, Math.min(60, Math.round((xb.h || 200) * sy * 0.85)))
  autoFitName(nameEl, nameBase)
  noEl.style.fontSize = noBase + 'px'

  nameEl.style.display = 'block'
  noEl.style.display = 'block'
  nameEl.style.visibility = 'visible'
  noEl.style.visibility = 'visible'
  nameEl.style.opacity = '1'
  noEl.style.opacity = '1'
}

function applyOverlayLayout(cardTypeId){
  currentCardTypeId = Number(cardTypeId) || currentCardTypeId
  // preview card (may be inside transforms)
  applyOverlayLayoutTo(cardTypeId, posterImg, nameText, noText, shareCard)
  // export card (never transformed)
  if (exportCard && exportPosterImg) {
    applyOverlayLayoutTo(cardTypeId, exportPosterImg, exportNameText, exportNoText, exportCard)
  }
}

async function claimCard(name){
  const cfTurnstileToken = getTurnstileToken()
  const qs = isTestMode() ? `?test=1${getForcedCard()?`&card=${encodeURIComponent(getForcedCard())}`:''}` : ''
  const r = await fetch('/api/claim' + qs, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, cfTurnstileToken }),
  })

  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!data) throw new Error('服务器返回异常，请稍后重试')
  if (!data?.ok) throw new Error(data?.error || 'claim failed')
  return data
}

async function ensureImageLoaded(imgEl){
  await new Promise((resolve)=>{
    if (imgEl.complete) return resolve()
    const done = ()=>resolve()
    imgEl.onload = done
    imgEl.onerror = done
    setTimeout(done, 2000)
  })
}

function isTestMode(){
  const u = new URL(location.href)
  return u.searchParams.get('test') === '1'
}

function isCalibMode(){
  const u = new URL(location.href)
  return u.searchParams.get('calib') === '1'
}

function getForcedCard(){
  const u = new URL(location.href)
  return u.searchParams.get('card') || u.searchParams.get('cardTypeId') || ''
}

async function downloadPNG(){
  const name = normalizeText(nameInput.value)
  if(!name){
    alert('请先输入名字')
    nameInput.focus()
    return
  }

  // must have turnstile token (skip in test mode)
  if (!isTestMode() && !getTurnstileToken()) {
    alert('请先完成验证（人机校验）')
    return
  }

  btnDownload.disabled = true
  btnDownload.textContent = '抽取中...'

  try{
    const res = await claimCard(name)

    // Update preview to the assigned card
    // Update preview
    posterImg.src = res.image
    nameText.textContent = res.name
    noText.textContent = res.cardNoDisplay || `（编号${res.cardNo}）`

    // Update export target (unscaled)
    if (exportPosterImg) exportPosterImg.src = res.image
    if (exportNameText) exportNameText.textContent = res.name
    if (exportNoText) exportNoText.textContent = res.cardNoDisplay || `（编号${res.cardNo}）`

    // Ensure configs loaded + images loaded, then apply per-card layout
    await loadCardConfigs().catch(()=>{})
    await ensureImageLoaded(posterImg)
    if (exportPosterImg) await ensureImageLoaded(exportPosterImg)
    applyOverlayLayout(res.cardTypeId)

    // Reveal animation: start opening the box first, then show the card
    shareCard.classList.add('revealing')
    await new Promise(r=>setTimeout(r, 220))
    openState.style.display = 'block'

    // wait for animation to finish before capturing
    await new Promise(r=>setTimeout(r, 900))

    const target = exportCard || shareCard
    const canvas = await html2canvas(target, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    })

    canvas.toBlob((blob)=>{
      if(!blob){
        alert('导出失败，请重试')
        return
      }
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)

      const safeName = res.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_')
      a.href = url
      a.download = `card-${safeName}-${res.cardNo.replace('#','')}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(()=>URL.revokeObjectURL(url), 3000)
    }, 'image/png')

  } catch(e){
    console.error(e)
    alert('领取失败：' + (e?.message || 'unknown'))
  } finally {
    btnDownload.disabled = false
    btnDownload.textContent = '抽取卡片并保存'
  }
}

async function copyCopyText(){
  const text = copyText.value
  try {
    await navigator.clipboard.writeText(text)
    btnCopy.textContent = '已复制'
    setTimeout(()=>btnCopy.textContent='复制', 900)
  } catch {
    copyText.select()
    document.execCommand('copy')
    btnCopy.textContent = '已复制'
    setTimeout(()=>btnCopy.textContent='复制', 900)
  }
}

nameInput.addEventListener('input', ()=>{
  setNameTextOnly()
  // if we already have a layout applied, keep current font size (do not override here)
})
btnDownload.addEventListener('click', downloadPNG)
btnCopy.addEventListener('click', copyCopyText)

function px(n){ return Math.round(n) + 'px' }

function getXY(el){
  const left = parseFloat(el.style.left || '0')
  const top = parseFloat(el.style.top || '0')
  return { left, top }
}

function setXY(el, left, top){
  el.style.left = px(left)
  el.style.top = px(top)
}

function makeDraggable(el){
  let start = null

  // Pointer Events (preferred)
  el.addEventListener('pointerdown', (e)=>{
    if (!isCalibMode()) return
    e.preventDefault()
    el.setPointerCapture?.(e.pointerId)
    const xy = getXY(el)
    start = { x: e.clientX, y: e.clientY, left: xy.left, top: xy.top }
  })
  el.addEventListener('pointermove', (e)=>{
    if (!start || !isCalibMode()) return
    e.preventDefault()
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    setXY(el, start.left + dx, start.top + dy)
  })
  const end = ()=>{ start = null }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)

  // Mouse fallback (some embedded browsers behave oddly with pointer capture)
  el.addEventListener('mousedown', (e)=>{
    if (!isCalibMode()) return
    e.preventDefault()
    const xy = getXY(el)
    start = { x: e.clientX, y: e.clientY, left: xy.left, top: xy.top }
    const onMove = (ev)=>{
      if (!start) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      setXY(el, start.left + dx, start.top + dy)
    }
    const onUp = ()=>{
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      start = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  })
}

function calibToConfig(){
  if (!cardConfigs) return null
  const iw = posterImg.naturalWidth || 1
  const ih = posterImg.naturalHeight || 1
  const cw = shareCard.clientWidth || 1
  const ch = shareCard.clientHeight || 1
  const sx = iw / cw
  const sy = ih / ch

  const nxy = getXY(nameText)
  const xxy = getXY(noText)

  const nameH = parseFloat(getComputedStyle(nameText).fontSize) * 1.2
  const noH = parseFloat(getComputedStyle(noText).fontSize) * 1.2

  return {
    nameBox: { x: Math.round(nxy.left * sx), y: Math.round(nxy.top * sy), w: 0, h: Math.round(nameH * sy) },
    noBox: { x: Math.round(xxy.left * sx), y: Math.round(xxy.top * sy), w: 0, h: Math.round(noH * sy) },
  }
}

async function copyTextToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

async function onCalibCopy(){
  const cfg = calibToConfig()
  if (!cfg) return
  const payload = { [String(currentCardTypeId)]: cfg }
  const text = JSON.stringify(payload, null, 2)
  const ok = await copyTextToClipboard(text)
  alert(ok ? '已复制（发我即可）' : '复制失败，请手动复制')
}

function downloadFile(name, content){
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(()=>URL.revokeObjectURL(url), 2000)
}

function onCalibDownload(){
  const cfg = calibToConfig()
  if (!cfg || !cardConfigs) return
  const merged = { ...cardConfigs, [String(currentCardTypeId)]: cfg }
  downloadFile('cards.json', JSON.stringify(merged, null, 2))
}

function bindNudgeButtons(){
  let stepName = 1
  let stepNo = 1

  if (btnNameStep) btnNameStep.addEventListener('click', ()=>{ stepName = (stepName === 1 ? 10 : 1); btnNameStep.textContent = '+' + stepName })
  if (btnNoStep) btnNoStep.addEventListener('click', ()=>{ stepNo = (stepNo === 1 ? 10 : 1); btnNoStep.textContent = '+' + stepNo })

  const nudge = (el, dx, dy, step)=>{
    const xy = getXY(el)
    setXY(el, xy.left + dx*step, xy.top + dy*step)
  }

  if (btnNameUp) btnNameUp.addEventListener('click', ()=>nudge(nameText, 0, -1, stepName))
  if (btnNameDown) btnNameDown.addEventListener('click', ()=>nudge(nameText, 0, 1, stepName))
  if (btnNameLeft) btnNameLeft.addEventListener('click', ()=>nudge(nameText, -1, 0, stepName))
  if (btnNameRight) btnNameRight.addEventListener('click', ()=>nudge(nameText, 1, 0, stepName))

  if (btnNoUp) btnNoUp.addEventListener('click', ()=>nudge(noText, 0, -1, stepNo))
  if (btnNoDown) btnNoDown.addEventListener('click', ()=>nudge(noText, 0, 1, stepNo))
  if (btnNoLeft) btnNoLeft.addEventListener('click', ()=>nudge(noText, -1, 0, stepNo))
  if (btnNoRight) btnNoRight.addEventListener('click', ()=>nudge(noText, 1, 0, stepNo))
}

function setupCalibMode(){
  bindNudgeButtons()
  if (!isCalibMode()) return

  // visual indicator
  document.documentElement.setAttribute('data-calib','1')
  const tip = document.createElement('div')
  tip.textContent = '校准模式已开启（可拖动/按钮微调）'
  tip.style.cssText = 'position:fixed;left:12px;top:12px;z-index:9999;padding:8px 12px;border-radius:12px;background:rgba(0,0,0,.55);backdrop-filter:blur(10px);color:rgba(255,255,255,.9);font-size:12px;border:1px solid rgba(255,255,255,.14)'
  document.body.appendChild(tip)
  // show open state directly
  try{ closedState.style.display = 'none'; openState.style.display = 'block' } catch {}
  shareCard.classList.add('calib')
  if (calibPanel) calibPanel.style.display = 'block'

  // load specified card
  const n = parseInt(getForcedCard() || '1', 10)
  const cardId = (n>=1 && n<=12) ? n : 1
  // cache-bust so calib always shows newest images
  posterImg.src = `/assets/cards/${cardId}.jpg?v=${Date.now()}`

  // ensure overlays visible
  nameText.style.display = 'block'
  noText.style.display = 'block'
  nameText.style.zIndex = '50'
  noText.style.zIndex = '50'

  noText.textContent = '（编号#00001）'
  nameText.textContent = normalizeText(nameInput.value) || '章人丹'

  ensureImageLoaded(posterImg).then(async ()=>{
    await loadCardConfigs().catch(()=>{})
    applyOverlayLayout(cardId)
  })

  makeDraggable(nameText)
  makeDraggable(noText)

  document.addEventListener('keydown', (e)=>{
    if (!isCalibMode()) return
    const keys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']
    if (!keys.includes(e.key)) return
    e.preventDefault()

    const step = e.shiftKey ? 10 : 1
    const target = (e.altKey ? noText : nameText)
    const xy = getXY(target)
    if (e.key === 'ArrowLeft') setXY(target, xy.left - step, xy.top)
    if (e.key === 'ArrowRight') setXY(target, xy.left + step, xy.top)
    if (e.key === 'ArrowUp') setXY(target, xy.left, xy.top - step)
    if (e.key === 'ArrowDown') setXY(target, xy.left, xy.top + step)
  })

  if (btnCalibCopy) btnCalibCopy.addEventListener('click', onCalibCopy)
  if (btnCalibDownload) btnCalibDownload.addEventListener('click', onCalibDownload)
}

// init
loadCardConfigs().catch(()=>{})
setNameTextOnly()

// start in "closed" state
try{
  if (openState) openState.style.display = 'none'
  if (closedState) closedState.style.display = 'flex'
} catch {}

setupCalibMode()
