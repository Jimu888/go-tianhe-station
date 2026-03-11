function byId(id){return document.getElementById(id)}

const nameInput = byId('nameInput')
const btnDownload = byId('btnDownload')
const btnCopy = byId('btnCopy')
const copyText = byId('copyText')

const nameText = byId('nameText')
const noText = byId('noText')
const posterImg = byId('posterImg')
const shareCard = byId('shareCard')
const closedState = byId('closedState')
const openState = byId('openState')

function normalizeText(s){
  return (s ?? '').toString().trim().slice(0, 16)
}

function fitNamePreview(){
  const name = normalizeText(nameInput.value) || '章人丹'
  nameText.textContent = name

  const len = name.length
  let size = 64
  if (len >= 10) size = 44
  else if (len >= 8) size = 50
  else if (len >= 6) size = 56
  nameText.style.fontSize = size + 'px'
}

function getTurnstileToken(){
  // Turnstile puts token into a hidden input named 'cf-turnstile-response'
  const el = document.querySelector('input[name="cf-turnstile-response"]')
  return (el && el.value) ? el.value : ''
}

async function claimCard(name){
  const cfTurnstileToken = getTurnstileToken()
  const r = await fetch('/api/claim', {
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

async function downloadPNG(){
  const name = normalizeText(nameInput.value)
  if(!name){
    alert('请先输入名字')
    nameInput.focus()
    return
  }

  // must have turnstile token
  if (!getTurnstileToken()) {
    alert('请先完成验证（人机校验）')
    return
  }

  btnDownload.disabled = true
  btnDownload.textContent = '开启中...'

  try{
    const res = await claimCard(name)

    // Update preview to the assigned card
    posterImg.src = res.image
    nameText.textContent = res.name
    noText.textContent = res.cardNo
    fitNamePreview()

    await ensureImageLoaded(posterImg)

    // Reveal animation: start opening the box first, then show the card
    shareCard.classList.add('revealing')
    await new Promise(r=>setTimeout(r, 220))
    openState.style.display = 'block'

    // wait for animation to finish before capturing
    await new Promise(r=>setTimeout(r, 900))

    const canvas = await html2canvas(shareCard, {
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
    btnDownload.textContent = '保存卡片'
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

nameInput.addEventListener('input', fitNamePreview)
btnDownload.addEventListener('click', downloadPNG)
btnCopy.addEventListener('click', copyCopyText)

// init
fitNamePreview()

// start in "closed" state
try{
  if (openState) openState.style.display = 'none'
  if (closedState) closedState.style.display = 'flex'
} catch {}
