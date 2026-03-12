function byId(id){return document.getElementById(id)}

const nameInput = byId('nameInput')
const btnDownload = byId('btnDownload')
const phoneInput = byId('phoneInput')

function getOrCreateDeviceId(){
  try{
    const KEY='go_th_device_id'
    let id = localStorage.getItem(KEY)
    if(!id){
      // prefer crypto.randomUUID
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (String(Date.now()) + '-' + Math.random().toString(16).slice(2))
      localStorage.setItem(KEY, id)
    }
    // also set cookie for redundancy (1 year)
    try{
      document.cookie = `device_id=${encodeURIComponent(id)}; Max-Age=${60*60*24*365}; Path=/; SameSite=Lax`
    } catch {}
    return id
  }catch{ return '' }
}

const DEVICE_ID = getOrCreateDeviceId()
const calibPanel = byId('calibPanel')
const btnCalibCopy = byId('btnCalibCopy')
const btnCalibDownload = byId('btnCalibDownload')

// test panel
const testPanel = byId('testPanel')
const btnExportAll12 = byId('btnExportAll12')
const exportAllHint = byId('exportAllHint')

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

const shareCard = byId('shareCard')
const closedState = byId('closedState')
const openState = byId('openState')
const previewImg = byId('previewImg')

// export (unscaled) target (single source of truth)
const exportCard = byId('exportCard')
const exportPosterImg = byId('exportPosterImg')
const exportNameText = byId('exportNameText')
const exportNoText = byId('exportNoText')
const debugInfo = byId('debugInfo')
const statusBar = byId('statusBar')
const modalMask = byId('modalMask')
const modalBox = byId('modalBox')
const modalTitle = byId('modalTitle')
const modalText = byId('modalText')
const modalOk = byId('modalOk')
const modalCancel = byId('modalCancel')
const modalClose = byId('modalClose')
const modalIcon = byId('modalIcon')
const modalHeader = byId('modalHeader')

function normalizeText(s){
  return (s ?? '').toString().trim().slice(0, 16)
}

function setStatus(msg, kind='info'){
  if(!statusBar) return
  statusBar.style.display = msg ? 'block' : 'none'
  statusBar.textContent = msg || ''
  const colors = {
    info:  'rgba(255,255,255,.06)',
    ok:    'rgba(159,214,255,.10)',
    warn:  'rgba(255,200,120,.10)',
    error: 'rgba(255,120,120,.10)',
  }
  statusBar.style.background = colors[kind] || colors.info
}

function showModal(title, text, opts={}){
  if(!modalMask || !modalBox) return alert(text || title || '')
  const { type='info', okText='知道了', cancelText='', showCancel=false } = opts || {}

  if(modalTitle) modalTitle.textContent = title || '提示'
  if(modalText) modalText.textContent = text || ''

  // style by type
  const styles = {
    info:  { dot:'rgba(159,214,255,.85)', glow:'rgba(159,214,255,.10)' },
    ok:    { dot:'rgba(159,214,255,.95)', glow:'rgba(159,214,255,.14)' },
    warn:  { dot:'rgba(255,200,120,.95)', glow:'rgba(255,200,120,.12)' },
    error: { dot:'rgba(255,120,120,.95)', glow:'rgba(255,120,120,.12)' },
  }
  const st = styles[type] || styles.info
  if(modalIcon){
    modalIcon.style.background = st.dot
    modalIcon.style.boxShadow = `0 0 0 6px ${st.glow}`
  }

  if(modalOk) modalOk.textContent = okText

  if(modalCancel){
    modalCancel.style.display = (showCancel ? 'inline-flex' : 'none')
    modalCancel.textContent = cancelText || '取消'
  }

  modalMask.style.display = 'block'
  modalBox.style.display = 'block'
}

function hideModal(){
  try{ modalMask.style.display = 'none' }catch{}
  try{ modalBox.style.display = 'none' }catch{}
}

function isIOS(){
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/i.test(ua)
}

if(modalMask) modalMask.addEventListener('click', hideModal)
if(modalOk) modalOk.addEventListener('click', hideModal)
if(modalCancel) modalCancel.addEventListener('click', hideModal)
if(modalClose) modalClose.addEventListener('click', hideModal)



function setNameTextOnly(){
  const name = normalizeText(nameInput.value) || '川网GO地铁'
  if (exportNameText) exportNameText.textContent = name
}

function fontFromCalibH(hNatural, sy){
  // In calib.html we stored h ≈ fontSize * 1.2 (in export px) then converted to natural via /sy.
  // So here: fontPx ≈ (hNatural * sy) / 1.2
  return Math.round((hNatural * sy) / 1.2)
}

function normalizePhone(s){
  return (s ?? '').toString().replace(/\s+/g,'').trim()
}

function getTurnstileToken(){
  // Turnstile puts token into a hidden input named 'cf-turnstile-response'
  const el = document.querySelector('input[name="cf-turnstile-response"]')
  return (el && el.value) ? el.value : ''
}

let cardConfigs = null

async function loadCardConfigs(){
  if (cardConfigs) return cardConfigs
  const r = await fetch('/configs/cards.json?v=' + Date.now(), {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  })
  const t = await r.text()
  try { cardConfigs = JSON.parse(t) } catch { cardConfigs = null }
  return cardConfigs
}

let currentCardTypeId = 1

function applyOverlayLayoutTo(cardTypeId, imgEl, nameEl, noEl, cardEl){
  if (!cardConfigs) return
  const cfg = cardConfigs[String(cardTypeId)]
  if (!cfg) return

  const cw = cardEl.clientWidth || 1
  const ch = cardEl.clientHeight || 1

  // Preferred: new schema from calib-hd.html (export-space coords)
  if (cfg.name && cfg.no) {
    nameEl.style.left = cfg.name.left + 'px'
    nameEl.style.top = cfg.name.top + 'px'
    nameEl.style.fontSize = cfg.name.font + 'px'

    // No global tweak in v2 (HD) coordinates
    const GLOBAL_NO_Y = 0
    noEl.style.left = cfg.no.left + 'px'
    noEl.style.top = (cfg.no.top + GLOBAL_NO_Y) + 'px'
    noEl.style.fontSize = cfg.no.font + 'px'

    if (debugInfo && isDebugMode()) {
      debugInfo.style.display = 'block'
      debugInfo.textContent = `card=${cardTypeId} name=(${cfg.name.left},${cfg.name.top},${cfg.name.font}) no=(${cfg.no.left},${cfg.no.top},${cfg.no.font})`
    }
  } else {
    // Back-compat: old schema (natural-image coords)
    const iw = imgEl.naturalWidth || 1
    const ih = imgEl.naturalHeight || 1
    const scale = Math.max(cw / iw, ch / ih)
    const dw = iw * scale
    const dh = ih * scale
    const ox = (cw - dw) / 2
    const oy = (ch - dh) / 2

    const nb = cfg.nameBox
    const xb = cfg.noBox

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

    let nameLeft = nb.x * scale + ox
    let nameTop  = nb.y * scale + oy
    let noLeft   = xb.x * scale + ox
    let noTop    = xb.y * scale + oy

    nameLeft = clamp(nameLeft, -220, cw + 220)
    nameTop  = clamp(nameTop, -220, ch + 220)
    noLeft   = clamp(noLeft, -220, cw + 220)
    noTop    = clamp(noTop, -220, ch + 220)

    const GLOBAL_NO_Y = 0

    nameEl.style.left = Math.round(nameLeft) + 'px'
    nameEl.style.top  = Math.round(nameTop) + 'px'
    noEl.style.left   = Math.round(noLeft) + 'px'
    noEl.style.top    = Math.round(noTop + GLOBAL_NO_Y) + 'px'

    const nameFont = Math.max(10, Math.min(120, Math.round((nb.h || 420) * scale / 1.2)))
    const noFont = Math.max(10, Math.min(80, Math.round((xb.h || 200) * scale / 1.2)))
    nameEl.style.fontSize = nameFont + 'px'
    noEl.style.fontSize = noFont + 'px'
  }

  nameEl.style.display = 'block'
  noEl.style.display = 'block'
  nameEl.style.visibility = 'visible'
  noEl.style.visibility = 'visible'
  nameEl.style.opacity = '1'
  noEl.style.opacity = '1'
}

function applyOverlayLayout(cardTypeId){
  currentCardTypeId = Number(cardTypeId) || currentCardTypeId
  // Only apply layout to exportCard (single source of truth)
  if (exportCard && exportPosterImg) {
    applyOverlayLayoutTo(cardTypeId, exportPosterImg, exportNameText, exportNoText, exportCard)
  }
}

async function claimCard(name){
  const phone = normalizePhone(phoneInput?.value)
  const deviceId = DEVICE_ID
  const cfTurnstileToken = getTurnstileToken()

  const qs = isTestMode() ? `?test=1${getForcedCard()?`&card=${encodeURIComponent(getForcedCard())}`:''}` : ''
  const r = await fetch('/api/claim' + qs, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, phone, deviceId, cfTurnstileToken }),
  })

  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!data) throw new Error('服务器返回异常，请稍后重试')
  if (!data?.ok) throw new Error(data?.error || 'claim failed')
  return data
}

async function claimTestCard(name, cardTypeId){
  const r = await fetch(`/api/claim?test=1&card=${encodeURIComponent(cardTypeId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, phone: '', cfTurnstileToken: '' }),
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

function isDebugMode(){
  const u = new URL(location.href)
  return u.searchParams.get('debug') === '1' || isTestMode()
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
    showModal('还差一步', '先填一个昵称，再抽取自由卡。', { type:'info', okText:'去填写昵称' })
    nameInput.focus()
    return
  }

  if (!isTestMode()) {
    const phone = normalizePhone(phoneInput?.value)
    if (!/^1\d{10}$/.test(phone || '')) {
      showModal('手机号不正确', '请输入 11 位手机号，用于找回卡片。', { type:'error', okText:'去修改' })
      phoneInput?.focus()
      return
    }

    if (!getTurnstileToken()) {
      showModal('还差一步', '请先完成下方的人机验证，再领取自由卡。', { type:'info', okText:'去验证' })
      return
    }
  }

  btnDownload.disabled = true
  btnDownload.textContent = '抽取中...'
  setStatus('正在验证并领取中…', 'info')

  try{
    const res = await claimCard(name)

    if (res?.alreadyClaimed) {
      if (res.reason === 'device') {
        setStatus('你已在本设备领取过：已为你重新生成并下载同一张卡（编号不变）。', 'warn')
        showModal('你已领取过', '本设备已领取过自由卡，本次将为你重新生成并下载同一张卡（编号不变）。', { type:'warn', okText:'重新下载' })
      } else if (res.reason === 'phone') {
        setStatus('该手机号已领取过：已为你找回并重新生成下载（编号不变）。', 'warn')
        showModal('已为你找回', '该手机号已领取过自由卡，本次将为你找回并重新生成下载（编号不变）。', { type:'warn', okText:'找回并下载' })
      } else {
        setStatus('你已领取过：已为你重新生成下载（编号不变）。', 'warn')
        showModal('你已领取过', '本次将为你重新生成并下载同一张卡（编号不变）。')
      }
    } else {
      setStatus('领取成功！正在生成图片…', 'ok')
      showModal('领取成功', '正在为你生成图片，请稍等…', { type:'ok', okText:'好的' })
    }

    // Update preview to the assigned card
    // Update export target (single source of truth)
    if (exportPosterImg) exportPosterImg.src = res.image
    if (exportNameText) exportNameText.textContent = res.name
    if (exportNoText) exportNoText.textContent = res.cardNoDisplay || `（编号${res.cardNo}）`

    await loadCardConfigs().catch(()=>{})
    if (exportPosterImg) await ensureImageLoaded(exportPosterImg)
    applyOverlayLayout(res.cardTypeId)

    // Render exportCard to canvas once, then:
    // 1) show preview as dataURL
    // 2) download from same canvas => preview == saved
    if (document.fonts?.ready) {
      try { await document.fonts.ready } catch {}
    }
    const canvas = await html2canvas(exportCard, {
      backgroundColor: null,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
    })

    if (previewImg) {
      try { previewImg.src = canvas.toDataURL('image/png') } catch {}
      if (closedState) closedState.style.display = 'none'
      if (openState) openState.style.display = 'block'
    }

    setStatus('图片已生成，开始下载…', 'ok')

    canvas.toBlob(async (blob)=>{
      if(!blob){
        setStatus('导出失败，请重试', 'error')
        showModal('导出失败', '图片生成失败了，请再试一次。', { type:'error', okText:'重试' })
        return
      }

      const safeName = res.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_')
      const filename = `card-${safeName}-${res.cardNo.replace('#','')}.png`

      // iOS: prefer native share sheet if available
      try {
        if (isIOS() && navigator.share && window.File) {
          const file = new File([blob], filename, { type: 'image/png' })
          await navigator.share({ files: [file], title: '自由卡', text: '保存到相册或分享给朋友' })
          setStatus('已打开系统分享面板，可选择「存储图像/存储到文件」。', 'ok')
          showModal('保存提示', '已打开系统分享面板。建议选择「存储图像」保存到相册。', { type:'ok', okText:'知道了' })
          return
        }
      } catch (e) {
        // user cancelled or share failed -> fall back
      }

      // fallback: normal download
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(()=>URL.revokeObjectURL(url), 3000)

      if (isIOS()) {
        // On iOS downloads are confusing; guide user to long-press-save
        const dataUrl = canvas.toDataURL('image/png')
        window.open(dataUrl, '_blank')
        setStatus('iPhone：已打开图片页，长按图片即可「添加到照片」。', 'ok')
        showModal('iPhone 保存方式', '已为你打开图片页。长按图片 → 「添加到照片」。', { type:'info', okText:'我知道了' })
      } else {
        setStatus('下载已开始（如被浏览器拦截，请允许下载）。', 'ok')
        showModal('已开始下载', '如果浏览器拦截了下载，请选择“允许”。', { type:'ok', okText:'知道了' })
      }
    }, 'image/png')

  } catch(e){
    console.error(e)
    const msg = '领取失败：' + (e?.message || 'unknown')
    setStatus(msg, 'error')
    showModal('领取失败', msg, { type:'error', okText:'知道了' })
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
})
btnDownload.addEventListener('click', downloadPNG)
btnCopy.addEventListener('click', copyCopyText)

async function exportAll12(){
  const name = normalizeText(nameInput.value) || '章人丹'
  if (!isTestMode()) {
    showModal('仅测试模式可用', '这个功能只在测试模式开启：请在网址后加 ?test=1。', { type:'info', okText:'知道了' })
    return
  }
  if (!window.JSZip) {
    showModal('组件未加载', 'JSZip 未加载成功，请刷新页面后再试。', { type:'error', okText:'刷新再试' })
    return
  }

  btnExportAll12.disabled = true
  if (exportAllHint) { exportAllHint.style.display = 'block'; exportAllHint.textContent = '开始打包...'; }

  try{
    await loadCardConfigs().catch(()=>{})
    const zip = new JSZip()

    for (let i=1; i<=12; i++){
      if (exportAllHint) exportAllHint.textContent = `生成中：${i}/12`
      const res = await claimTestCard(name, i)

      exportPosterImg.src = res.image
      exportNameText.textContent = res.name
      exportNoText.textContent = res.cardNoDisplay || `（编号${res.cardNo}）`
      await ensureImageLoaded(exportPosterImg)
      applyOverlayLayout(i)

      if (document.fonts?.ready) {
        try { await document.fonts.ready } catch {}
      }
      const canvas = await html2canvas(exportCard, {
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })

      const blob = await new Promise((resolve)=>canvas.toBlob(resolve, 'image/png'))
      if (!blob) continue
      zip.file(`card-${String(i).padStart(2,'0')}.png`, blob)
    }

    if (exportAllHint) exportAllHint.textContent = '压缩中...'
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

    const a = document.createElement('a')
    const url = URL.createObjectURL(zipBlob)
    a.href = url
    a.download = `cards-12-${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(()=>URL.revokeObjectURL(url), 4000)

    if (exportAllHint) exportAllHint.textContent = '完成：已生成 ZIP 下载。'
  } catch(e){
    console.error(e)
    if (exportAllHint) exportAllHint.textContent = '失败：' + (e?.message || 'unknown')
  } finally {
    btnExportAll12.disabled = false
  }
}

if (btnExportAll12) btnExportAll12.addEventListener('click', exportAll12)

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
  showModal(ok ? '已复制' : '复制失败', ok ? '内容已复制到剪贴板（直接发我即可）。' : '复制失败了，请手动复制这段内容。', { type: ok ? 'ok' : 'error', okText: ok ? '好的' : '知道了' })
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

  // Test panel
  if (isTestMode() && testPanel) {
    testPanel.style.display = 'block'
  }
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

// show test utilities in test mode
try{
  if (isTestMode() && testPanel) testPanel.style.display = 'block'
} catch {}
