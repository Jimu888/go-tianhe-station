function byId(id){return document.getElementById(id)}

const nameInput = byId('nameInput')
const btnDownload = byId('btnDownload')
const btnCopy = byId('btnCopy')
const copyText = byId('copyText')

const nameText = byId('nameText')
const posterImg = byId('posterImg')
const shareCard = byId('shareCard')

function normalizeText(s){
  return (s ?? '').toString().trim()
}

// Available posters (note: 9.jpg not present)
const POSTERS = ['1','2','3','4','5','6','7','8','10','11']
const STORAGE_KEY = 'noname.posterKey.v1'

function posterPath(key){
  return `./assets/noname/${key}.jpg`
}

function cryptoRandomInt(max){
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] % max
}

function pickRandomPoster(){
  return POSTERS[cryptoRandomInt(POSTERS.length)]
}

function getAssignedPoster(){
  const cached = localStorage.getItem(STORAGE_KEY)
  if (cached && POSTERS.includes(cached)) return cached
  const key = pickRandomPoster()
  localStorage.setItem(STORAGE_KEY, key)
  return key
}

function setAssignedPoster(key){
  const k = POSTERS.includes(key) ? key : pickRandomPoster()
  localStorage.setItem(STORAGE_KEY, k)
  posterImg.src = posterPath(k)
}

function fitName(){
  const name = normalizeText(nameInput.value) || '章人丹'
  nameText.textContent = name

  // Auto fit for long names
  const len = name.length
  let size = 64
  if (len >= 10) size = 44
  else if (len >= 8) size = 50
  else if (len >= 6) size = 56
  nameText.style.fontSize = size + 'px'
}

function setPreview(){
  const key = getAssignedPoster()
  posterImg.src = posterPath(key)
  fitName()
}

async function downloadPNG(){
  setPreview()

  await new Promise((resolve)=>{
    if (posterImg.complete) return resolve()
    const done = ()=>resolve()
    posterImg.onload = done
    posterImg.onerror = done
    setTimeout(done, 1500)
  })
  await new Promise(r=>setTimeout(r, 50))

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

    const safeName = (normalizeText(nameInput.value) || 'unnamed')
      .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g,'_')

    a.href = url
    a.download = `poster-${safeName}-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(()=>URL.revokeObjectURL(url), 3000)
  }, 'image/png')
}

// reroll removed (no UI button)

async function copyCopyText(){
  const text = copyText.value
  try {
    await navigator.clipboard.writeText(text)
    btnCopy.textContent = '已复制'
    setTimeout(()=>btnCopy.textContent='复制', 900)
  } catch {
    // fallback
    copyText.select()
    document.execCommand('copy')
    btnCopy.textContent = '已复制'
    setTimeout(()=>btnCopy.textContent='复制', 900)
  }
}

nameInput.addEventListener('input', fitName)
btnDownload.addEventListener('click', downloadPNG)
btnCopy.addEventListener('click', copyCopyText)

setPreview()
