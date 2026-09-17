'use strict';

// Conserver la composition du widget et réduire l'ensemble à la largeur de l'Embed.
const viewport = document.querySelector('.widget-viewport');
const widget = viewport.querySelector('.widget');

function fitWidget() {
  const scale = Math.min(1, viewport.clientWidth / widget.offsetWidth);
  widget.style.transform = `scale(${scale})`;
  // Une transformation ne réduit pas la place réservée dans la page : la corriger.
  viewport.style.height = `${widget.offsetHeight * scale}px`;
}

fitWidget();
const layoutObserver = new ResizeObserver(fitWidget);
layoutObserver.observe(viewport);
layoutObserver.observe(widget);
window.addEventListener('pageshow', fitWidget);
