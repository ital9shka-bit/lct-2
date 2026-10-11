'use strict';
(async () => {
  const image = document.getElementById('document-page');
  const viewport = document.getElementById('page-viewport');
  const canvas = document.getElementById('page-canvas');
  const input = document.getElementById('page-number');
  const previous = document.getElementById('previous-page');
  const next = document.getElementById('next-page');
  const zoom = document.getElementById('page-zoom');
  const status = document.getElementById('reader-status');
  const error = document.getElementById('reader-error');
  try {
    const response = await fetch('/docs/pages.json');
    if (!response.ok) throw new Error('Preview unavailable');
    const { pages } = await response.json();
    if (!Array.isArray(pages) || !pages.length) throw new Error('No preview pages');
    let current = 1;
    input.max = pages.length;
    document.getElementById('page-total').textContent = '/ ' + pages.length;
    input.disabled = false;
    zoom.disabled = false;
    const show = (number) => {
      current = Math.min(pages.length, Math.max(1, Math.round(number) || 1));
      input.value = current;
      image.alt = `Страница ${current} технической документации ООП`;
      image.src = pages[current - 1];
      previous.disabled = current === 1;
      next.disabled = current === pages.length;
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
      error.hidden = true;
      status.textContent = `Страница ${current} из ${pages.length}`;
    };
    previous.addEventListener('click', () => show(current - 1));
    next.addEventListener('click', () => show(current + 1));
    input.addEventListener('change', () => show(Number(input.value)));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { show(Number(input.value)); viewport.focus(); }
    });
    zoom.addEventListener('change', () => { canvas.style.width = Number(zoom.value) * 100 + '%'; });
    image.addEventListener('load', () => { error.hidden = true; });
    image.addEventListener('error', () => { error.hidden = false; });
    show(1);
  } catch {
    error.hidden = false;
  }
})();
