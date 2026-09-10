export const PROBE_NAME = "looperFrame";

export const PROBE: string = String.raw`
(() => {
  const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "BASE", "NOSCRIPT"]);
  const GEOMETRY = "path,rect,circle,ellipse,line,polyline,polygon,text,tspan,image,use";
  const PAINTED = new Set(["IMG", "CANVAS", "VIDEO", "OBJECT", "EMBED", "IFRAME"]);
  const round = (n) => Math.round(n * 100) / 100;
  const ruler = document.createElement("canvas").getContext("2d");

  function rgba(text) {
    if (!text || text === "transparent") return [0, 0, 0, 0];
    const said = text.trim();
    const held = /^rgba?\(([^)]+)\)$/.exec(said);
    if (held) {
      const parts = held[1].split(/[\s,\/]+/).filter((p) => p.length > 0).map(Number);
      if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    }
    const wide = /^color\(srgb ([^)]+)\)$/.exec(said);
    if (wide) {
      const parts = wide[1].split(/[\s\/]+/).filter((p) => p.length > 0).map(Number);
      if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
      return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts.length > 3 ? parts[3] : 1];
    }
    return null;
  }

  function over(top, bottom) {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    const mix = (i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  }

  function backdropOf(el) {
    const stack = [];
    for (let node = el.parentElement; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return null;
      const colour = rgba(style.backgroundColor);
      if (colour === null) return null;
      if (colour[3] > 0) stack.push(colour);
      if (colour[3] >= 1) break;
    }
    let ground = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i -= 1) ground = over(stack[i], ground);
    return ground;
  }

  function apart(one, two) {
    return Math.abs(one[0] - two[0]) + Math.abs(one[1] - two[1]) + Math.abs(one[2] - two[2]) > 6;
  }

  function paintsABox(el, style) {
    if (style.backgroundImage !== "none") return true;
    if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) return true;
    if (style.boxShadow !== "none") return true;
    const own = rgba(style.backgroundColor);
    if (own === null) return true;
    if (own[3] === 0) return false;
    const ground = backdropOf(el);
    if (ground === null) return true;
    return apart(over(own, ground), ground);
  }

  function paintedSides(el, style) {
    if (paintsABox(el, style)) return ["left", "top", "right", "bottom"];
    const found = [];
    for (const side of ["left", "top", "right", "bottom"]) {
      const kind = style.getPropertyValue("border-" + side + "-style");
      if (kind === "none" || kind === "hidden") continue;
      if (parseFloat(style.getPropertyValue("border-" + side + "-width")) <= 0) continue;
      const colour = rgba(style.getPropertyValue("border-" + side + "-color"));
      if (colour !== null && colour[3] === 0) continue;
      found.push(side);
    }
    return found;
  }

  function boxOf(rect) {
    return {
      left: round(rect.left),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
    };
  }

  function grown(box, rect) {
    if (box === null) return boxOf(rect);
    return {
      left: Math.min(box.left, round(rect.left)),
      top: Math.min(box.top, round(rect.top)),
      right: Math.max(box.right, round(rect.right)),
      bottom: Math.max(box.bottom, round(rect.bottom)),
    };
  }

  function glyphInk(node, style) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) return null;
    let box = null;
    for (const rect of rects) box = grown(box, rect);
    ruler.font = style.font.length > 0 ? style.font : style.fontSize + " " + style.fontFamily;
    const size = ruler.measureText(node.data.trim());
    const first = rects[0];
    const last = rects[rects.length - 1];
    const leading = first.height - (size.fontBoundingBoxAscent + size.fontBoundingBoxDescent);
    if (!Number.isFinite(leading)) return { box, baseline: null };
    const half = leading / 2;
    const sitsOn = first.top + half + size.fontBoundingBoxAscent;
    const top = sitsOn - size.actualBoundingBoxAscent;
    const bottom = last.bottom - half - (size.fontBoundingBoxDescent - size.actualBoundingBoxDescent);
    const baseline = round(sitsOn);
    if (!(bottom > top)) return { box, baseline };
    return {
      box: { left: box.left, top: round(top), right: box.right, bottom: round(bottom) },
      baseline,
    };
  }

  function vectorInk(el) {
    let box = null;
    for (const drawn of el.querySelectorAll(GEOMETRY)) {
      const rect = drawn.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      box = grown(box, rect);
    }
    return box;
  }

  function insideOf(rect, style, withPadding) {
    const inset = (side) => {
      const border = parseFloat(style.getPropertyValue("border-" + side + "-width"));
      if (!withPadding) return border;
      return border + parseFloat(style.getPropertyValue("padding-" + side));
    };
    const box = {
      left: round(rect.left + inset("left")),
      top: round(rect.top + inset("top")),
      right: round(rect.right - inset("right")),
      bottom: round(rect.bottom - inset("bottom")),
    };
    if (box.right < box.left || box.bottom < box.top) return null;
    return box;
  }

  function contentInk(el, style, rect) {
    const inset = (side) =>
      parseFloat(style.getPropertyValue("border-" + side + "-width")) +
      parseFloat(style.getPropertyValue("padding-" + side));
    const box = {
      left: round(rect.left + inset("left")),
      top: round(rect.top + inset("top")),
      right: round(rect.right - inset("right")),
      bottom: round(rect.bottom - inset("bottom")),
    };
    if (box.right <= box.left || box.bottom <= box.top) return null;
    return box;
  }

  const CONTENT_DECIDES = new Set([
    "width", "height", "inline-size", "block-size", "min-width", "min-height",
    "max-width", "max-height", "min-inline-size", "min-block-size",
    "max-inline-size", "max-block-size", "top", "right", "bottom", "left",
    "inset-block-start", "inset-block-end", "inset-inline-start", "inset-inline-end",
    "perspective-origin", "transform-origin", "x", "y", "cx", "cy", "r", "rx", "ry", "d",
    "grid-template-columns", "grid-template-rows", "grid-template-areas", "flex-basis",
  ]);

  const initial = (() => {
    const el = document.createElement("div");
    el.setAttribute("style", "all:initial;position:absolute;left:-9999px;top:-9999px");
    document.body.append(el);
    const style = getComputedStyle(el);
    const held = new Map();
    for (const property of style) held.set(property, style.getPropertyValue(property));
    el.remove();
    return held;
  })();

  const A_LOGICAL_EDGE = /(^|-)(inline|block)-(start|end)(-|$)|^border-(start|end)-(start|end)-/;

  function whatIsWorn(style, ground) {
    const worn = {};
    const ink = style.getPropertyValue("color");
    const sideways = style.direction === "ltr" && style.writingMode === "horizontal-tb";
    for (const property of style) {
      if (property.startsWith("-webkit-") || property.startsWith("-moz-")) continue;
      if (property.startsWith("-ms-") || property.startsWith("--")) continue;
      if (CONTENT_DECIDES.has(property)) continue;
      if (sideways && A_LOGICAL_EDGE.test(property)) continue;
      const value = style.getPropertyValue(property);
      if (value === initial.get(property)) continue;
      if (property !== "color" && property.endsWith("-color") && value === ink) continue;
      worn[property] = value;
    }
    if (ground !== null) worn["-looper-behind"] = "rgb(" + ground.map(Math.round).join(", ") + ")";
    return worn;
  }

  const CASE_TELLING = /\p{L}/u;

  function caseOf(text) {
    const said = text.trim();
    if (!CASE_TELLING.test(said)) return "no letters";
    if (said === said.toUpperCase()) return "UPPER";
    if (said === said.toLowerCase()) return "lower";
    const words = said.split(/\s+/).filter((one) => CASE_TELLING.test(one));
    const capped = words.filter((one) => one[0] === one[0].toUpperCase());
    if (capped.length === words.length && words.length > 1) return "Title Case";
    return "Sentence case";
  }

  function withCase(worn, said) {
    if (said === "no letters") return worn;
    return { ...worn, "-looper-text-case": said };
  }

  const STATEFUL = ["aria-expanded", "aria-selected", "aria-checked", "aria-pressed",
    "aria-current", "aria-disabled", "data-state", "disabled", "open", "readonly"];

  function kindOf(el) {
    const parts = [el.tagName.toLowerCase()];
    const classes = typeof el.className === "string" ? el.className.trim().split(/\s+/) : [];
    for (const one of classes.filter((c) => c.length > 0).sort()) parts.push("." + one);
    for (const name of STATEFUL) {
      const held = el.getAttribute(name);
      if (held !== null) parts.push("[" + name + "=" + held + "]");
    }
    return parts.join("");
  }

  function groundUnder(el, style) {
    const behind = backdropOf(el);
    if (behind === null) return null;
    if (style.backgroundImage !== "none") return null;
    const own = rgba(style.backgroundColor);
    if (own === null) return null;
    return over(own, behind).slice(0, 3);
  }

  function nameOf(el) {
    let said = el.tagName.toLowerCase();
    if (el.id.length > 0) return said + "#" + el.id;
    const classes = typeof el.className === "string" ? el.className.trim().split(/\s+/) : [];
    if (classes.length > 0 && classes[0].length > 0) said += "." + classes[0];
    return said;
  }

  function pathTo(el) {
    const parts = [];
    for (let node = el; node !== null && parts.length < 3; node = node.parentElement) {
      if (node.tagName === "BODY" || node.tagName === "HTML") break;
      parts.unshift(nameOf(node));
    }
    return parts.join(" > ");
  }

  function said(text) {
    const held = text.trim().replace(/\s+/g, " ");
    return held.length > 32 ? held.slice(0, 32) + "…" : held;
  }

  function looperFrame(page, state) {
    const marks = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (SKIP.has(el.tagName)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (parseFloat(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;

      const ground = groundUnder(el, style);
      const worn = whatIsWorn(style, ground);
      if (el.getAnimations !== undefined && el.getAnimations().length > 0) {
        worn["-looper-moving"] = "yes";
      }
      const sides = paintedSides(el, style);
      let ink = null;
      if (el.namespaceURI === "http://www.w3.org/2000/svg" && el.tagName.toLowerCase() === "svg") {
        ink = vectorInk(el);
      } else if (PAINTED.has(el.tagName)) {
        ink = contentInk(el, style, rect);
      }
      if (sides.length > 0 || ink !== null) {
        const bordered = sides.some(
          (side) => parseFloat(style.getPropertyValue("border-" + side + "-width")) > 0,
        );
        marks.push({
          at: pathTo(el),
          kind: kindOf(el),
          look: worn,
          box: boxOf(rect),
          sides,
          ink,
          inner: bordered ? insideOf(rect, style, false) : null,
          baseline: null,
        });
      }

      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || node.data.trim().length === 0) continue;
        const drawn = glyphInk(node, style);
        if (drawn === null) continue;
        marks.push({
          at: pathTo(el) + ' "' + said(node.data) + '"',
          kind: kindOf(el) + " (text)",
          look: withCase(worn, caseOf(node.data)),
          box: boxOf(rect),
          sides: [],
          ink: drawn.box,
          inner: null,
          baseline: drawn.baseline,
        });
      }
    }

    const switches = [];
    const DECLARED = [
      ["aria-expanded", "[aria-expanded]"],
      ["aria-selected", "[aria-selected]"],
      ["aria-checked", "[aria-checked]"],
      ["aria-pressed", "[aria-pressed]"],
      ["data-state", "[data-state]"],
    ];
    for (const [kind, selector] of DECLARED) {
      for (const el of document.body.querySelectorAll(selector)) {
        switches.push({ at: pathTo(el), kind, value: el.getAttribute(kind) });
      }
    }
    for (const el of document.body.querySelectorAll("details")) {
      switches.push({ at: pathTo(el), kind: "open", value: el.open ? "true" : "false" });
    }
    for (const el of document.body.querySelectorAll("input[type=checkbox],input[type=radio]")) {
      switches.push({ at: pathTo(el), kind: "checked", value: el.checked ? "true" : "false" });
    }

    const asShipped = {};
    for (const [property, value] of initial) {
      if (property.startsWith("-") || CONTENT_DECIDES.has(property)) continue;
      asShipped[property] = value;
    }

    return JSON.stringify({
      page,
      state,
      captured: new Date().toISOString(),
      width: window.innerWidth,
      height: window.innerHeight,
      initial: asShipped,
      marks,
      switches,
    });
  }

  globalThis.looperFrame = looperFrame;
  return "looperFrame(page, state) is ready";
})()
`.trim();
