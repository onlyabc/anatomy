/** 在投屏弹窗内注入交互脚本（须在弹窗 document 内运行才能收到触摸/鼠标） */

const BRIDGE_ID = "holo-touch-bridge";
const CAL_KEY = "anatomy-holo-touch-calibration";

/** 向全息弹窗注入触摸/鼠标/滚轮控制（读取 opener 上的 __holoDisplayConfig） */
export function injectHoloPopupTouchBridge(
  popup: Window | null,
  options?: { force?: boolean },
): void {
  if (!popup || popup.closed) return;
  const doc = popup.document;
  const existing = doc.getElementById(BRIDGE_ID);
  if (existing) {
    if (!options?.force) {
      console.log("[HoloTouch] bridge 已存在，跳过重复注入", { href: popup.location.href });
      return;
    }
    existing.remove();
    console.log("[HoloTouch] 强制重新注入 bridge", { href: popup.location.href });
  }

  const script = doc.createElement("script");
  script.id = BRIDGE_ID;
  script.textContent = `
(function () {
  var LOG = "[HoloTouch:popup]";
  var GAMMA = 1.1;
  var ROT = 0.012;
  var TAP_SLOP = 14;
  var CAL_STORAGE = ${JSON.stringify(CAL_KEY)};

  function cfg() {
    try { return window.opener && window.opener.__holoDisplayConfig; } catch (e) { return null; }
  }

  function log() {
    console.log.apply(console, arguments);
    try { if (window.opener && window.opener.console) window.opener.console.log.apply(window.opener.console, arguments); } catch (e) {}
  }

  function warn() {
    console.warn.apply(console, arguments);
    try { if (window.opener && window.opener.console) window.opener.console.warn.apply(window.opener.console, arguments); } catch (e) {}
  }

  function setDebug(patch) {
    try {
      if (window.opener) window.opener.__holoTouchDebug = Object.assign({ at: new Date().toISOString() }, patch);
    } catch (e) {}
  }

  var moveLogCounter = 0;
  function logTouch(kind, detail) {
    log(LOG, kind, detail);
    setDebug(Object.assign({ lastEvent: kind }, detail || {}));
  }

  function describeCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    return {
      size: canvas.width + "x" + canvas.height,
      css: Math.round(rect.width) + "x" + Math.round(rect.height),
      connected: canvas.isConnected,
      owner: canvas.ownerDocument === document ? "popup" : "other",
    };
  }

  function describeEnv() {
    var c = cfg();
    var canvas = getCanvas();
    var openerOk = false;
    try { openerOk = Boolean(window.opener); } catch (e) { openerOk = false; }
    return {
      href: location.href,
      opener: openerOk,
      cfg: Boolean(c),
      vcCanvas: Boolean(c && c.vcCanvas),
      canvas: describeCanvas(canvas),
      pickNorm: Boolean(window.opener && window.opener.__holoPickAtNormalized),
      pickPx: Boolean(window.opener && window.opener.__holoPickAt),
      onInteract: Boolean(window.opener && window.opener.__holoTouchOnInteract),
      fullscreen: Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      cal: loadCal(),
    };
  }

  function loadCal() {
    try {
      if (window.opener && window.opener.__holoTouchCalibration) return window.opener.__holoTouchCalibration;
      var raw = window.opener && window.opener.localStorage.getItem(CAL_STORAGE);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
  }

  function saveCal(cal) {
    try {
      if (window.opener) {
        window.opener.__holoTouchCalibration = cal;
        window.opener.localStorage.setItem(CAL_STORAGE, JSON.stringify(cal));
      }
    } catch (e) {}
    log(LOG, "校准已保存", cal);
  }

  function getCanvas() {
    var c = cfg();
    return (c && c.vcCanvas) || document.querySelector("canvas");
  }

  /** 浏览器坐标 → vcCanvas 像素（含校准偏移） */
  function mapPoint(clientX, clientY) {
    var canvas = getCanvas();
    if (!canvas) return { x: clientX, y: clientY };
    var cal = loadCal();
    var rect = canvas.getBoundingClientRect();
    var nx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    var ny = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    return {
      x: nx * canvas.width * cal.scaleX - cal.offsetX,
      y: ny * canvas.height * cal.scaleY - cal.offsetY
    };
  }

  function removeFsOverlay() {
    document.querySelectorAll("button").forEach(function (btn) {
      if ((btn.textContent || "").indexOf("全屏") >= 0) btn.remove();
    });
  }

  function showCalibration() {
    var canvas = getCanvas();
    if (!canvas || document.getElementById("holo-touch-cal")) return;
    var layer = document.createElement("div");
    layer.id = "holo-touch-cal";
    layer.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.78);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;cursor:crosshair";
    layer.innerHTML = '<p style="margin:0 0 24px;font:600 22px/1.4 system-ui,sans-serif;text-align:center">请点击您看见的<br><span style="color:#ffb347">橙色十字</span> 的正中心</p>'
      + '<div style="position:relative;width:140px;height:140px">'
      + '<div style="position:absolute;left:50%;top:0;bottom:0;width:4px;margin-left:-2px;background:#ffb347;box-shadow:0 0 12px rgba(255,179,71,.8)"></div>'
      + '<div style="position:absolute;top:50%;left:0;right:0;height:4px;margin-top:-2px;background:#ffb347;box-shadow:0 0 12px rgba(255,179,71,.8)"></div>'
      + '</div><p style="margin:20px 0 0;font:500 14px/1.5 system-ui,sans-serif;opacity:.8">只需校准一次，之后点击会对准</p>';
    function finishCal(ev) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      var cx = ev.clientX;
      var cy = ev.clientY;
      if (ev.changedTouches && ev.changedTouches[0]) {
        cx = ev.changedTouches[0].clientX;
        cy = ev.changedTouches[0].clientY;
      }
      var cal = loadCal();
      var rect = canvas.getBoundingClientRect();
      var nx = (cx - rect.left) / rect.width;
      var ny = (cy - rect.top) / rect.height;
      cal.offsetX = nx * canvas.width * cal.scaleX - canvas.width / 2;
      cal.offsetY = ny * canvas.height * cal.scaleY - canvas.height / 2;
      saveCal(cal);
      layer.remove();
      log(LOG, "触摸校准完成", cal);
      setDebug({ calibrated: true, cal: cal });
    }
    layer.addEventListener("touchstart", finishCal, { capture: true, passive: false });
    layer.addEventListener("mousedown", finishCal, true);
    document.body.appendChild(layer);
    log(LOG, "显示触摸校准层，请点击看见的十字中心");
  }

  function maybeShowCalibration() {
    var need = true;
    try {
      if (window.opener && window.opener.localStorage.getItem(CAL_STORAGE)) need = false;
      if (window.opener && window.opener.location.search.indexOf("touchCal=1") >= 0) need = true;
    } catch (e) {}
    if (need) setTimeout(showCalibration, 900);
  }

  /** 投屏面板像素 → 3D 视图归一化坐标 (0–1)，按 letterbox 反算画幅差 */
  function mapPanelToViewNormalized(panelX, panelY, panelW, panelH, viewAspect) {
    if (panelW <= 0 || panelH <= 0 || viewAspect <= 0) return { nx: 0.5, ny: 0.5, inside: false };
    var panelAspect = panelW / panelH;
    var u = panelX / panelW;
    var v = panelY / panelH;
    if (panelAspect > viewAspect) {
      var contentWidth = viewAspect / panelAspect;
      var offsetX = (1 - contentWidth) / 2;
      var nx = (u - offsetX) / contentWidth;
      var ny = v;
      return { nx: nx, ny: ny, inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
    }
    var contentHeight = panelAspect / viewAspect;
    var offsetY = (1 - contentHeight) / 2;
    var nx = u;
    var ny = (v - offsetY) / contentHeight;
    return { nx: nx, ny: ny, inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
  }

  function tryPick(clientX, clientY) {
    var canvas = getCanvas();
    if (!canvas) {
      warn(LOG, "点击选点失败：未找到 vcCanvas", describeEnv());
      setDebug({ last: "pickNoCanvas" });
      return;
    }
    if (!window.opener) {
      warn(LOG, "点击选点失败：window.opener 不可用", describeEnv());
      setDebug({ last: "pickNoOpener" });
      return;
    }
    var mapped = mapPoint(clientX, clientY);
    var viewAspect = window.opener.__holoViewAspect;
    if (!viewAspect) {
      var sz = window.opener.__holoMainCanvasSize;
      viewAspect = sz && sz.h > 0 ? sz.w / sz.h : canvas.width / canvas.height;
    }
    var view = mapPanelToViewNormalized(mapped.x, mapped.y, canvas.width, canvas.height, viewAspect);
    if (!view.inside) {
      log(LOG, "点击在黑边区域，忽略", { mapped: mapped, viewAspect: viewAspect });
      setDebug({ last: "pickOutside", mapped: mapped, viewAspect: viewAspect });
      return;
    }
    if (window.opener.__holoPickAtNormalized) {
      log(LOG, "点击选点(归一化)", { clientX: clientX, clientY: clientY, mapped: mapped, view: view, viewAspect: viewAspect, cal: loadCal() });
      setDebug({ last: "pickNorm", mapped: mapped, view: view, viewAspect: viewAspect });
      window.opener.__holoPickAtNormalized(view.nx, view.ny);
      return;
    }
    if (!window.opener.__holoPickAt) {
      warn(LOG, "点击选点失败：主页面未注册 __holoPickAt", describeEnv());
      setDebug({ last: "pickNoHandler" });
      return;
    }
    var size = window.opener.__holoMainCanvasSize || { w: canvas.width, h: canvas.height };
    var pickX = (mapped.x / canvas.width) * size.w;
    var pickY = (mapped.y / canvas.height) * size.h;
    log(LOG, "点击选点(像素回退)", { mapped: mapped, pickX: pickX, pickY: pickY });
    window.opener.__holoPickAt(pickX, pickY);
  }

  var fsDone = false;
  function tryFullscreen(reason) {
    if (fsDone || document.fullscreenElement || document.webkitFullscreenElement) {
      fsDone = true;
      removeFsOverlay();
      return;
    }
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    req.call(el, { navigationUI: "hide" }).then(function () {
      fsDone = true;
      removeFsOverlay();
      log(LOG, "全屏成功", reason);
    }).catch(function (err) { warn(LOG, "全屏失败", reason, err); });
  }

  ["pointerdown", "touchstart", "mousedown"].forEach(function (type) {
    document.addEventListener(type, function () { tryFullscreen(type); }, { capture: true, passive: true });
  });

  document.documentElement.style.touchAction = "none";
  document.body.style.touchAction = "none";

  var lastMapped = { x: 0, y: 0 };
  var dragging = false;
  var tapStart = null;

  function onPress(clientX, clientY) {
    tapStart = { x: clientX, y: clientY };
    lastMapped = mapPoint(clientX, clientY);
    dragging = true;
    var c = cfg();
    logTouch("press", {
      client: { x: clientX, y: clientY },
      mapped: lastMapped,
      hasCfg: Boolean(c),
      trackball: c ? { x: c.trackballX, y: c.trackballY } : null,
    });
    if (!c) warn(LOG, "按下时 __holoDisplayConfig 不可用，旋转/缩放不会生效");
  }

  function onRelease(clientX, clientY) {
    var dist = tapStart ? Math.hypot(clientX - tapStart.x, clientY - tapStart.y) : 0;
    logTouch("release", { client: { x: clientX, y: clientY }, moveDist: dist, willPick: dist < TAP_SLOP });
    if (tapStart && dist < TAP_SLOP) {
      tryPick(clientX, clientY);
    }
    dragging = false;
    tapStart = null;
  }

  function onDrag(clientX, clientY) {
    if (!dragging) return;
    var c = cfg();
    if (!c) {
      if (moveLogCounter % 60 === 0) warn(LOG, "拖动时 cfg 为空，无法旋转");
      return;
    }
    var mapped = mapPoint(clientX, clientY);
    var mx = mapped.x - lastMapped.x;
    var my = -(mapped.y - lastMapped.y);
    lastMapped = mapped;
    if (!mx && !my) return;
    c.trackballX -= mx * ROT * 0.15;
    c.trackballY -= my * ROT * 0.15;
    moveLogCounter += 1;
    if (moveLogCounter % 20 === 1) {
      logTouch("drag", {
        mx: mx,
        my: my,
        trackballX: c.trackballX,
        trackballY: c.trackballY,
        targetDiam: c.targetDiam,
      });
    } else {
      setDebug({ last: "rotate", mx: mx, my: my, trackballX: c.trackballX, trackballY: c.trackballY });
    }
    if (window.opener && window.opener.__holoTouchOnInteract) window.opener.__holoTouchOnInteract();
  }

  document.body.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || document.getElementById("holo-touch-cal")) return;
    onPress(e.clientX, e.clientY);
  }, true);

  document.body.addEventListener("mousemove", function (e) {
    if (!dragging && !(e.buttons & 1)) return;
    onDrag(e.clientX, e.clientY);
  }, true);

  document.body.addEventListener("mouseup", function (e) {
    if (e.button !== 0) return;
    onRelease(e.clientX, e.clientY);
  }, true);

  var touchMap = {};
  var pinchBase = 0;
  var pinchDiam = 0;

  function pinchDist(map) {
    var ids = Object.keys(map);
    if (ids.length < 2) return 0;
    var a = map[ids[0]], b = map[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  document.body.addEventListener("touchstart", function (e) {
    if (document.getElementById("holo-touch-cal")) return;
    logTouch("touchstart", {
      touchCount: e.touches.length,
      changed: e.changedTouches.length,
      target: e.target && e.target.tagName,
    });
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      touchMap[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    if (e.touches.length === 1) onPress(e.touches[0].clientX, e.touches[0].clientY);
    if (Object.keys(touchMap).length >= 2) {
      pinchBase = pinchDist(touchMap);
      pinchDiam = cfg() ? cfg().targetDiam : 0;
      dragging = false;
    }
  }, { capture: true, passive: false });

  document.body.addEventListener("touchmove", function (e) {
    if (document.getElementById("holo-touch-cal")) return;
    e.preventDefault();
    if (moveLogCounter % 30 === 0) {
      logTouch("touchmove", { touchCount: e.touches.length, dragging: dragging, pinchBase: pinchBase });
    }
    if (e.touches.length === 1 && dragging) {
      onDrag(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if (e.touches.length >= 2 && pinchBase > 0) {
      var c = cfg();
      if (!c) return;
      for (var j = 0; j < e.touches.length; j++) {
        var tt = e.touches[j];
        touchMap[tt.identifier] = { x: tt.clientX, y: tt.clientY };
      }
      var dist = pinchDist(touchMap);
      var ratio = dist / pinchBase;
      if (ratio > 0 && isFinite(ratio)) {
        var logOld = Math.log(pinchDiam) / Math.log(GAMMA);
        c.targetDiam = Math.pow(GAMMA, logOld + Math.log(ratio) * 1.6);
        logTouch("pinch", { ratio: ratio, targetDiam: c.targetDiam });
        if (window.opener && window.opener.__holoTouchOnInteract) window.opener.__holoTouchOnInteract();
      }
    }
  }, { capture: true, passive: false });

  document.body.addEventListener("touchend", function (e) {
    logTouch("touchend", { remaining: e.touches.length, changed: e.changedTouches.length });
    if (e.touches.length === 0 && e.changedTouches[0]) {
      onRelease(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    for (var i = 0; i < e.changedTouches.length; i++) {
      delete touchMap[e.changedTouches[i].identifier];
    }
    if (Object.keys(touchMap).length < 2) pinchBase = 0;
  }, { capture: true, passive: false });

  document.body.addEventListener("wheel", function (e) {
    var c = cfg();
    if (!c) return;
    e.preventDefault();
    var logOld = Math.log(c.targetDiam) / Math.log(GAMMA);
    c.targetDiam = Math.pow(GAMMA, logOld + e.deltaY * 0.01);
    logTouch("wheel", { deltaY: e.deltaY, targetDiam: c.targetDiam });
    if (window.opener && window.opener.__holoTouchOnInteract) window.opener.__holoTouchOnInteract();
  }, { capture: true, passive: false });

  document.body.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch" || document.getElementById("holo-touch-cal")) return;
    logTouch("pointerdown", { type: e.pointerType, x: e.clientX, y: e.clientY });
  }, true);

  if (window.opener) {
    window.opener.__holoShowTouchCalibration = function () { showCalibration(); };
    window.opener.__holoTouchDescribeEnv = function () { return describeEnv(); };
  }

  maybeShowCalibration();
  removeFsOverlay();
  log(LOG, "bridge 已注入", describeEnv());
  log(LOG, "排查：主页面执行 window.__holoTouchDebug / window.__holoTouchDescribeEnv?.()");

  function bindVcCanvas(canvas) {
    if (!canvas || canvas.__holoTouchBound) return;
    canvas.__holoTouchBound = true;
    canvas.style.touchAction = "none";
    logTouch("bindVcCanvas", describeCanvas(canvas));
    canvas.addEventListener("touchstart", function (e) {
      if (document.getElementById("holo-touch-cal")) return;
      logTouch("vc-touchstart", { touchCount: e.touches.length });
      if (e.touches.length === 1) onPress(e.touches[0].clientX, e.touches[0].clientY);
    }, { capture: true, passive: false });
    canvas.addEventListener("touchmove", function (e) {
      if (document.getElementById("holo-touch-cal")) return;
      e.preventDefault();
      if (e.touches.length === 1 && dragging) onDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { capture: true, passive: false });
    canvas.addEventListener("touchend", function (e) {
      if (e.changedTouches[0]) onRelease(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { capture: true, passive: false });
  }

  var watchAttempts = 0;
  function watchVcCanvas() {
    watchAttempts += 1;
    removeFsOverlay();
    var canvas = getCanvas();
    if (canvas) bindVcCanvas(canvas);
    if (watchAttempts < 600) requestAnimationFrame(watchVcCanvas);
    else if (!getCanvas()) warn(LOG, "watchVcCanvas 超时：始终未找到 vcCanvas");
  }
  watchVcCanvas();
  log(LOG, "重新校准：window.__holoShowTouchCalibration?.()");
})();
  `;

  (doc.body || doc.documentElement).appendChild(script);
  console.log("[HoloTouch] 已向弹窗注入 touch bridge（含坐标校准）");
}
