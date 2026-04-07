import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import './style.css'
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

function closeZoomOverlay() {
  const overlay = document.querySelector('.d2-zoom-overlay')
  if (!overlay) return
  document.body.style.overflow = ''
  overlay.remove()
  const tip = document.querySelector('.d2-tooltip') as HTMLElement | null
  if (tip) tip.style.display = 'none'
}

let tooltipEl: HTMLDivElement | null = null

function getTooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'd2-tooltip'
    document.body.appendChild(tooltipEl)
  }
  return tooltipEl
}

function bindTooltipListeners(root: Element) {
  root.querySelectorAll('.appendix-icon').forEach((icon) => {
    const el = icon as SVGGElement
    if (el.dataset.tooltipBound) return

    // Beim ersten Mal: title-Text in data-Attribut sichern
    if (!el.dataset.tooltip) {
      const title = el.querySelector('title')
      if (!title) return
      el.dataset.tooltip = title.textContent || ''
      title.remove()
    }

    el.dataset.tooltipBound = 'true'
    el.style.cursor = 'pointer'
    const text = el.dataset.tooltip

    el.addEventListener('mouseenter', () => {
      const tip = getTooltip()
      tip.textContent = text!
      tip.style.display = 'block'
      const rect = el.getBoundingClientRect()
      const tipHeight = tip.offsetHeight || 24
      tip.style.left = rect.left + rect.width / 2 + 'px'
      if (rect.top - tipHeight - 8 > 0) {
        tip.style.top = rect.top - 8 + 'px'
        tip.style.transform = 'translate(-50%, -100%)'
      } else {
        tip.style.top = rect.bottom + 8 + 'px'
        tip.style.transform = 'translate(-50%, 0)'
      }
    })

    el.addEventListener('mouseleave', () => {
      getTooltip().style.display = 'none'
    })
  })
}

function initD2Zoom() {
  document.querySelectorAll('.d2-diagram').forEach((wrapper) => {
    if ((wrapper as HTMLElement).dataset.zoomBound) return
    ;(wrapper as HTMLElement).dataset.zoomBound = 'true'
    ;(wrapper as HTMLElement).style.position = 'relative'

    const btn = document.createElement('button')
    btn.className = 'd2-zoom-btn'
    btn.setAttribute('aria-label', 'Diagramm vergrössern')
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`
    wrapper.appendChild(btn)

    btn.addEventListener('click', () => {
      if (document.querySelector('.d2-zoom-overlay')) return
      const svg = wrapper.querySelector(':scope > svg')
      if (!svg) return
      const overlay = document.createElement('div')
      overlay.className = 'd2-zoom-overlay'
      const clone = svg.cloneNode(true) as SVGElement
      clone.removeAttribute('width')
      clone.removeAttribute('height')
      // Reset tooltipBound auf Clone damit Listener neu gebunden werden
      clone.querySelectorAll('[data-tooltip-bound]').forEach((el) => {
        delete (el as HTMLElement).dataset.tooltipBound
      })
      overlay.appendChild(clone)
      // Tooltip-Listener auf geklonten SVG binden
      bindTooltipListeners(clone)
      overlay.addEventListener('click', (e) => {
        // Nicht schliessen wenn auf Info-Icon geklickt
        if ((e.target as Element).closest('.appendix-icon')) return
        closeZoomOverlay()
      })
      document.body.style.overflow = 'hidden'
      document.body.appendChild(overlay)
    })
  })
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') closeZoomOverlay()
}

function initAll() {
  initD2Zoom()
  bindTooltipListeners(document)
}

export default {
  ...DefaultTheme,
  Layout,
  setup() {
    const route = useRoute()
    onMounted(() => {
      document.addEventListener('keydown', onEsc)
      nextTick(initAll)
    })
    watch(() => route.path, () => nextTick(initAll))
  }
}
