/**
 * Hybrid Math & LaTeX Renderer for Fuel Cell Simulator
 * 
 * Supports:
 * 1. KaTeX automatic typesetting if KaTeX library is loaded.
 * 2. High-quality Offline HTML Math typesetting fallback that parses LaTeX 
 *    fractions (\frac{a}{b}), subscripts (_x), superscripts (^y), Greek letters,
 *    and mathematical operators into semantic HTML/CSS math.
 */

class MathRenderer {
  static renderAll(element = document.body) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(element, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
        return;
      } catch (e) {
        console.warn('KaTeX render error, falling back to built-in formatter:', e);
      }
    }

    // Offline / Standalone Fallback Parser
    this.fallbackRender(element);
  }

  static fallbackRender(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && ['SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'CANVAS'].includes(node.parentElement.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.nodeValue.includes('$') || node.nodeValue.includes('\\frac')) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const nodesToReplace = [];
    while (walker.nextNode()) {
      nodesToReplace.push(walker.currentNode);
    }

    nodesToReplace.forEach(node => {
      const text = node.nodeValue;
      if (!text.includes('$') && !text.includes('\\')) return;

      const span = document.createElement('span');
      span.innerHTML = this.parseLatex(text);
      if (node.parentNode) {
        node.parentNode.replaceChild(span, node);
      }
    });
  }

  static parseLatex(str) {
    // 1. Display math $$ ... $$
    str = str.replace(/\$\$([^$]+)\$\$/g, (m, expr) => {
      return `<div class="math-display">${this.formatExpr(expr)}</div>`;
    });

    // 2. Inline math $ ... $
    str = str.replace(/\$([^$]+)\$/g, (m, expr) => {
      return `<span class="math-inline">${this.formatExpr(expr)}</span>`;
    });

    return str;
  }

  static formatExpr(expr) {
    let s = expr;

    // Greek letters & symbols
    s = s.replace(/\\Omega/g, 'Ω')
         .replace(/\\omega/g, 'ω')
         .replace(/\\tau/g, 'τ')
         .replace(/\\alpha/g, 'α')
         .replace(/\\theta/g, 'θ')
         .replace(/\\pi/g, 'π')
         .replace(/\\Delta/g, 'Δ')
         .replace(/\\approx/g, '≈')
         .replace(/\\rightarrow/g, '→')
         .replace(/\\times/g, '×')
         .replace(/\\parallel/g, '∥')
         .replace(/\\quad/g, '&nbsp;&nbsp;')
         .replace(/\\,/g, '&nbsp;')
         .replace(/\\text\{([^}]+)\}/g, '$1');

    // Fractions \frac{num}{denom}
    s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (m, num, denom) => {
      return `<span class="math-frac"><span class="math-num">${this.formatExpr(num)}</span><span class="math-denom">${this.formatExpr(denom)}</span></span>`;
    });

    // Nested functions
    s = s.replace(/\\tanh\\left\(([^)]+)\\right\)/g, 'tanh($1)')
         .replace(/\\tanh/g, 'tanh');

    // Superscripts and Subscripts
    s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>')
         .replace(/\^([0-9a-zA-Z+\-−]+)/g, '<sup>$1</sup>')
         .replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>')
         .replace(/_([0-9a-zA-Z+\-−Ωω]+)/g, '<sub>$1</sub>');

    return s;
  }
}

// Global export
window.MathRenderer = MathRenderer;
