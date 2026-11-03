// Screenshot lightbox, gallery tabs and "Copy" buttons. Nothing else runs on this page.
const box = document.querySelector('.lightbox')
const boxImg = box.querySelector('img')
const close = () => {
  box.hidden = true
  boxImg.removeAttribute('src')
}
document.querySelectorAll('.zoom').forEach((b) =>
  b.addEventListener('click', () => {
    boxImg.src = b.dataset.src
    boxImg.alt = b.querySelector('img')?.alt ?? ''
    box.hidden = false
  }),
)
box.addEventListener('click', close)
document.addEventListener('keydown', (e) => e.key === 'Escape' && close())

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => {
      x.classList.toggle('is-on', x === t)
      x.setAttribute('aria-selected', String(x === t))
    })
    document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab))
  }),
)

document.querySelectorAll('.copy').forEach((b) =>
  b.addEventListener('click', async () => {
    const text = b.parentElement.querySelector('code').innerText
    try {
      await navigator.clipboard.writeText(text)
      b.textContent = 'Copied'
      setTimeout(() => (b.textContent = 'Copy'), 1500)
    } catch {
      /* clipboard blocked */
    }
  }),
)
