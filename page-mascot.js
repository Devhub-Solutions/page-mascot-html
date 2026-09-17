/*!
 * page-mascot (vanilla)
 * A framework-free port of nilbuild/page-mascot.
 * An interactive character that watches the cursor and blinks when you poke it.
 *
 * Author: ported by Super Z (original React component by Kamran Ahmed)
 * License: MIT
 *
 * Original:  https://github.com/nilbuild/page-mascot
 * This port keeps the same sprite-sheet contract, the same nine directions
 * and nine reactions, the same hysteresis, dead-zone, squash, dizzy and
 * reduced-motion behaviour. Inline styles are used so the file drops into
 * any project without a CSS framework.
 */
(function (root, factory) {
  'use strict';

  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PageMascot = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants — kept identical to src/mascot.tsx
   * ------------------------------------------------------------------ */

  var DIRECTIONS = [
    'up-left',
    'up',
    'up-right',
    'left',
    'center',
    'right',
    'down-left',
    'down',
    'down-right'
  ];

  var REACTIONS = [
    'blink',
    'heart',
    'sparkle',
    'surprised',
    'wink',
    'bashful',
    'sleepy',
    'dizzy',
    'delighted'
  ];

  // Clockwise from the right, matching atan2 with y pointing down.
  var CLOCKWISE = [
    'right',
    'down-right',
    'down',
    'down-left',
    'left',
    'up-left',
    'up',
    'up-right'
  ];

  var SECTOR = (Math.PI * 2) / CLOCKWISE.length;
  var HYSTERESIS = 0.12;
  var DEAD_ZONE = 70;

  var PAYOFFS = ['heart', 'sparkle', 'delighted'];
  var BOOP_PAYOFF = 120;
  var BOOP_END = 560;
  var SQUASH_MS = 420;
  var DIZZY_AFTER = 4;
  var DIZZY_WINDOW = 1600;
  var DIZZY_END = 1100;

  // Per-keyframe easing; the effect itself is linear so the offsets are not
  // reinterpreted by a single easing on the whole bounce.
  var SQUASH_KEYFRAMES = [
    { transform: 'scale(1, 1)', easing: 'ease-in' },
    { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
    { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
    { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
    { transform: 'scale(1, 1)' }
  ];

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  // background-size 300% makes each cell a clean 0/50/100% step on both axes.
  function cellBackgroundPosition(index) {
    return {
      backgroundPosition:
        (index % 3) * 50 + '% ' + Math.floor(index / 3) * 50 + '%'
    };
  }

  function wrap(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function hasFinePointer() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    );
  }

  function prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  // Shallow object merge (we only need one level).
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) {
          target[k] = src[k];
        }
      }
    }
    return target;
  }

  // Apply a plain object of CSS declarations to an element.
  function applyStyles(el, styles) {
    for (var key in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, key)) {
        el.style[key] = styles[key];
      }
    }
  }

  var LAYER_STYLE = {
    position: 'absolute',
    inset: '0',
    backgroundSize: '300% 300%',
    backgroundRepeat: 'no-repeat'
  };

  /* ------------------------------------------------------------------ *
   * Mascot
   * ------------------------------------------------------------------ */

  /**
   * Create a mascot and mount it into `host` (a DOM element).
   *
   * @param {Element} host        Element the mascot is rendered into.
   * @param {object}  options
   * @param {string}  options.directions  Path/URL to the 3x3 directions sheet.
   * @param {string}  options.reactions   Path/URL to the 3x3 reactions sheet.
   * @param {number}  [options.size=140]  Square size in px.
   * @param {string}  [options.label='mascot']  Screen-reader label.
   * @param {string}  [options.className]  Optional class on the root button.
   * @returns {MascotInstance}
   */
  function createMascot(host, options) {
    return new Mascot(host, options);
  }

  function Mascot(host, options) {
    if (!host) {
      throw new Error('page-mascot: host element is required');
    }
    if (!options || !options.directions || !options.reactions) {
      throw new Error(
        'page-mascot: options.directions and options.reactions are required'
      );
    }

    this.options = assign(
      {
        size: 140,
        label: 'mascot',
        className: ''
      },
      options
    );

    this._sector = -1;
    this._pointer = null;
    this._timers = [];
    this._boops = { count: 0, at: 0 };
    this._direction = 'center';
    this._reaction = null;
    this._destroyed = false;
    this._listeners = [];

    this._build(host);
    this._bind();
  }

  Mascot.prototype._build = function (host) {
    var opts = this.options;

    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Boop the ' + opts.label);
    if (opts.className) button.className = opts.className;

    applyStyles(
      button,
      {
        position: 'relative',
        display: 'block',
        flexShrink: '0',
        width: String(opts.size) + 'px',
        height: String(opts.size) + 'px',
        padding: '0',
        border: '0',
        background: 'transparent',
        appearance: 'none',
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'inherit',
        color: 'inherit'
      }
    );

    // Some browsers leave an outline ring on the button; leave it for
    // keyboard accessibility, but normalize webkit focus styling.
    // (Inline styles only — no CSS file required.)

    var squash = document.createElement('span');
    applyStyles(
      squash,
      {
        position: 'relative',
        display: 'block',
        width: '100%',
        height: '100%',
        transformOrigin: '50% 78%'
      }
    );

    var dirLayer = document.createElement('span');
    applyStyles(dirLayer, assign({}, LAYER_STYLE));
    dirLayer.style.backgroundImage = 'url(' + opts.directions + ')';

    var reactLayer = document.createElement('span');
    applyStyles(reactLayer, assign({}, LAYER_STYLE));
    reactLayer.style.backgroundImage = 'url(' + opts.reactions + ')';

    // Apply initial cell + opacity.
    applyStyles(
      dirLayer,
      cellBackgroundPosition(DIRECTIONS.indexOf(this._direction))
    );
    dirLayer.style.opacity = '1';

    applyStyles(
      reactLayer,
      cellBackgroundPosition(REACTIONS.indexOf(this._reaction || 'blink'))
    );
    reactLayer.style.opacity = '0';
    // Always mounted so the sheet is fetched up front, never on the first click.

    squash.appendChild(dirLayer);
    squash.appendChild(reactLayer);
    button.appendChild(squash);
    host.appendChild(button);

    this._button = button;
    this._squash = squash;
    this._dirLayer = dirLayer;
    this._reactLayer = reactLayer;
  };

  Mascot.prototype._bind = function () {
    if (!hasFinePointer()) {
      // Tracking switches off without a fine pointer.
      // We still keep the click handler so a tap produces a blink.
    }

    var self = this;

    this._onPointerMove = function (event) {
      self._pointer = { x: event.clientX, y: event.clientY };
      self._aim();
    };

    this._onScroll = function () {
      self._aim();
    };

    this._onClick = function (event) {
      // A button click would also trigger on Enter/Space — that's fine.
      event.preventDefault();
      self._boop();
    };

    this._add(window, 'pointermove', this._onPointerMove, { passive: true });
    this._add(window, 'scroll', this._onScroll, { passive: true });
    this._add(this._button, 'click', this._onClick);

    // Re-evaluate on resize, since the button may have moved.
    this._onResize = function () { self._aim(); };
    this._add(window, 'resize', this._onResize, { passive: true });
  };

  Mascot.prototype._add = function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts || false);
    this._listeners.push({ target: target, type: type, fn: fn, opts: opts });
  };

  Mascot.prototype._aim = function () {
    if (!hasFinePointer() || !this._pointer) return;

    var button = this._button;
    if (!button) return;

    var box = button.getBoundingClientRect();
    var dx = this._pointer.x - (box.left + box.width / 2);
    var dy = this._pointer.y - (box.top + box.height / 2);

    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      this._sector = -1;
      this._setDirection('center');
      return;
    }

    // Hold the current sector until the pointer is well past its edge.
    var angle = Math.atan2(dy, dx);
    if (
      this._sector !== -1 &&
      Math.abs(wrap(angle - this._sector * SECTOR)) <
        SECTOR / 2 + HYSTERESIS
    ) {
      return;
    }

    this._sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length;
    this._setDirection(CLOCKWISE[this._sector]);
  };

  Mascot.prototype._setDirection = function (dir) {
    if (this._direction === dir) return;
    this._direction = dir;
    if (this._reaction) return; // reaction layer is on top; no need to repaint.
    applyStyles(
      this._dirLayer,
      cellBackgroundPosition(DIRECTIONS.indexOf(dir))
    );
  };

  Mascot.prototype._setReaction = function (react) {
    var prev = this._reaction;
    this._reaction = react;
    if (prev === react) {
      // Even if the same reaction, make sure the right cell is shown.
      applyStyles(
        this._reactLayer,
        cellBackgroundPosition(REACTIONS.indexOf(react || 'blink'))
      );
      this._reactLayer.style.opacity = react ? '1' : '0';
      this._dirLayer.style.opacity = react ? '0' : '1';
      return;
    }
    applyStyles(
      this._reactLayer,
      cellBackgroundPosition(REACTIONS.indexOf(react || 'blink'))
    );
    this._reactLayer.style.opacity = react ? '1' : '0';
    this._dirLayer.style.opacity = react ? '0' : '1';
  };

  Mascot.prototype._boop = function () {
    var self = this;

    // Clear pending timers.
    this._timers.forEach(function (t) { window.clearTimeout(t); });
    this._timers = [];

    function later(ms, next) {
      self._timers.push(
        window.setTimeout(function () { self._setReaction(next); }, ms)
      );
    }

    var now = Date.now();
    var boops = this._boops;
    boops.count = now - boops.at < DIZZY_WINDOW ? boops.count + 1 : 1;
    boops.at = now;

    if (boops.count >= DIZZY_AFTER) {
      boops.count = 0;
      this._setReaction('dizzy');
      later(DIZZY_END, null);
    } else {
      this._setReaction('blink');
      later(BOOP_PAYOFF, PAYOFFS[(boops.count - 1) % PAYOFFS.length]);
      later(BOOP_END, null);
    }

    if (prefersReducedMotion()) return;

    // Per-keyframe easing with the effect itself linear.
    if (this._squash && typeof this._squash.animate === 'function') {
      this._squash.animate(SQUASH_KEYFRAMES, {
        duration: SQUASH_MS,
        easing: 'linear'
      });
    }
  };

  /**
   * Cleanly remove the mascot: unbinds listeners, cancels timers, removes DOM.
   */
  Mascot.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;

    this._listeners.forEach(function (l) {
      try {
        l.target.removeEventListener(l.type, l.fn, l.opts || false);
      } catch (_) { /* no-op */ }
    });
    this._listeners = [];

    this._timers.forEach(function (t) { window.clearTimeout(t); });
    this._timers = [];

    if (this._button && this._button.parentNode) {
      this._button.parentNode.removeChild(this._button);
    }
    this._button = null;
    this._squash = null;
    this._dirLayer = null;
    this._reactLayer = null;
  };

  /* ------------------------------------------------------------------ *
   * Declarative bootstrap — pick up [data-mascot] elements at load.
   * ------------------------------------------------------------------ */

  /**
   * Scan the document for elements marked with `data-mascot` and turn each
   * into a mascot. The `data-mascot-directions` and `data-mascot-reactions`
   * attributes provide the sheet paths; `data-mascot-size`, `data-mascot-label`
   * and `data-mascot-class` are optional.
   *
   * @param {object} [opts]
   * @param {string} [opts.root=document]  Scope the scan to a subtree.
   * @returns {Mascot[]}
   */
  function autoInit(opts) {
    opts = opts || {};
    var root = opts.root || document;
    var nodes = root.querySelectorAll('[data-mascot]');
    var instances = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // Skip if already initialized.
      if (el._pageMascot) continue;

      var directions = el.getAttribute('data-mascot-directions');
      var reactions = el.getAttribute('data-mascot-reactions');
      if (!directions || !reactions) continue;

      var sizeAttr = el.getAttribute('data-mascot-size');
      var size = sizeAttr ? parseInt(sizeAttr, 10) : 140;

      el._pageMascot = new Mascot(el, {
        directions: directions,
        reactions: reactions,
        size: isNaN(size) ? 140 : size,
        label: el.getAttribute('data-mascot-label') || 'mascot',
        className: el.getAttribute('data-mascot-class') || ''
      });
      instances.push(el._pageMascot);
    }
    return instances;
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  return {
    createMascot: createMascot,
    Mascot: Mascot,
    autoInit: autoInit,
    DIRECTIONS: DIRECTIONS.slice(),
    REACTIONS: REACTIONS.slice(),
    // Re-exported so consumers can rebuild the demo's mascot grid without
    // hard-coding the cell order anywhere else.
    CLOCKWISE: CLOCKWISE.slice()
  };
}));
