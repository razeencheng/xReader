import { computeAnchor } from './highlightAnchor';

test('computes offsets relative to paragraph text', () => {
  const p = document.createElement('p');
  p.setAttribute('data-paragraph-index', '3');
  p.textContent = 'Hello world friend';
  document.body.appendChild(p);

  const range = document.createRange();
  range.setStart(p.firstChild!, 6);
  range.setEnd(p.firstChild!, 11);

  const anchor = computeAnchor(range);
  expect(anchor).toEqual({
    layer: 'original',
    paragraph_index: 3,
    text_start_offset: 6,
    text_end_offset: 11,
    quoted_text: 'world',
  });

  document.body.removeChild(p);
});

test('returns null for empty selection', () => {
  const p = document.createElement('p');
  p.setAttribute('data-paragraph-index', '0');
  p.textContent = 'Hello';
  document.body.appendChild(p);

  const range = document.createRange();
  range.setStart(p.firstChild!, 3);
  range.setEnd(p.firstChild!, 3);

  expect(computeAnchor(range)).toBeNull();

  document.body.removeChild(p);
});

test('returns null when no paragraph element found', () => {
  const div = document.createElement('div');
  div.textContent = 'No paragraph';
  document.body.appendChild(div);

  const range = document.createRange();
  range.setStart(div.firstChild!, 0);
  range.setEnd(div.firstChild!, 2);

  expect(computeAnchor(range)).toBeNull();

  document.body.removeChild(div);
});
