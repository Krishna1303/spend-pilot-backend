'use strict';

const { toISODate } = require('../utils/dates');

/**
 * Canvas-free PDF text extraction using the pdf.js legacy build.
 *
 * The legacy build is designed for Node and ships its own DOM polyfills, and
 * text extraction (getTextContent) never touches a canvas — so this works in
 * serverless runtimes (Vercel) without the native @napi-rs/canvas binary that
 * used to crash the process on boot.
 *
 * pdf.js is ESM; we import it lazily via dynamic import() from CommonJS and
 * cache the module promise.
 */
/**
 * pdf.js reads a few browser globals (DOMMatrix, Path2D, ImageData) for text
 * positioning. In Node those come from @napi-rs/canvas (a native binary) — but
 * that binary often isn't bundled into serverless functions, which makes text
 * extraction throw "DOMMatrix is not defined". We install functional pure-JS
 * polyfills BEFORE importing pdf.js so extraction works without any native
 * canvas. DOMMatrix implements real matrix math (used for text transforms);
 * Path2D/ImageData are stubs (only needed for rendering, which we never do).
 */
function installDomPolyfills() {
  const g = globalThis;
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrix {
      constructor(init) {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
      multiply(o) {
        const r = new DOMMatrix();
        r.a = this.a * o.a + this.c * o.b;
        r.b = this.b * o.a + this.d * o.b;
        r.c = this.a * o.c + this.c * o.d;
        r.d = this.b * o.c + this.d * o.d;
        r.e = this.a * o.e + this.c * o.f + this.e;
        r.f = this.b * o.e + this.d * o.f + this.f;
        return r;
      }
      translate(x, y) { return this.multiply(new DOMMatrix([1, 0, 0, 1, x || 0, y || 0])); }
      scale(x, y) { return this.multiply(new DOMMatrix([x || 1, 0, 0, (y == null ? x : y) || 1, 0, 0])); }
      inverse() {
        const det = this.a * this.d - this.b * this.c || 1;
        return new DOMMatrix([
          this.d / det, -this.b / det, -this.c / det, this.a / det,
          (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det,
        ]);
      }
    };
  }
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class Path2D {
      addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {}
      quadraticCurveTo() {} arc() {} closePath() {} rect() {}
    };
  }
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width; this.height = height;
        this.data = new Uint8ClampedArray((width * height || 0) * 4);
      }
    };
  }
}

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    installDomPolyfills();
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

async function extractText(buffer) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0, // errors only; silences the standard-font warning
  }).promise;

  try {
    let text = '';
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str || '').join(' ') + '\n';
      page.cleanup();
    }
    return text;
  } finally {
    await doc.destroy();
  }
}

/**
 * Extract key fields from a text-based credit card statement PDF.
 * Returns a review payload; the frontend confirms/edits before use.
 */
async function parseStatement(buffer) {
  const rawText = await extractText(buffer);
  const normalized = rawText.replace(/[ \t]+/g, ' ').replace(/\r/g, '');

  const statementBalance = extractMoney(normalized, [
    'new balance',
    'statement balance',
    'current balance',
    'total balance',
  ]);

  const minimumPayment = extractMoney(normalized, [
    'minimum payment due',
    'minimum payment',
    'minimum amount due',
    'min payment due',
  ]);

  const dueDate = extractDate(normalized, ['payment due date', 'due date']);
  const apr = extractApr(normalized);

  return {
    extracted: {
      statementBalance,
      minimumPayment,
      dueDate,
      apr,
    },
    rawPreview: rawText.slice(0, 500).trim(),
    needsReview: true,
  };
}

/** Find the first money amount appearing after any of the given labels. */
function extractMoney(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`${escape(label)}[:\\s]*\\$?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})`, 'i');
    const m = text.match(re);
    if (m) {
      const value = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/** Find the first date appearing after any of the given labels. */
function extractDate(text, labels) {
  for (const label of labels) {
    const re = new RegExp(
      `${escape(label)}[:\\s]*([0-9]{1,2}\\/[0-9]{1,2}\\/[0-9]{2,4}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2})`,
      'i'
    );
    const m = text.match(re);
    if (m) {
      const iso = toISODate(m[1]);
      if (iso) return iso;
    }
  }
  return null;
}

/** Find an APR percentage if present (e.g. "Purchase APR 24.99%"). */
function extractApr(text) {
  const m = text.match(/apr[:\s]*([0-9]{1,2}\.?[0-9]{0,2})\s*%/i);
  if (m) {
    const value = parseFloat(m[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function escape(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseStatement };
