/**
 * face-dots.js  v5
 * Three-layer interactive face card with real 3D wireframe rotation.
 *
 * Layers (bottom → top):
 *  1. Background  (18-back.webp)  — purple gradient, perimeter text, icons
 *  2. Face mesh   (3D wireframe)  — MediaPipe 468-vertex face, projected with perspective
 *  3. Text overlay (18-text.svg)  — "$3,232" + "Visa *4819", static on top
 *
 * Requires face-model-data.js loaded before this script (FACE_V, FACE_I globals).
 */
(function () {
    'use strict';

    if (typeof FACE_V === 'undefined' || typeof FACE_I === 'undefined') {
        console.warn('face-dots: FACE_V / FACE_I not found — load face-model-data.js first');
        return;
    }

    var W = 203, H = 318;
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var CX = W / 2, CY = H / 2;

    /* ── Tunables ── */
    var MAX_YAW   = 18 * Math.PI / 180;
    var MAX_PITCH  = 12 * Math.PI / 180;
    var LERP       = 0.07;
    var FOV        = 28;

    /* Wireframe style */
    var LINE_WIDTH  = 0.35;
    var LINE_ALPHA  = 0.28;
    var DOT_RADIUS  = 0.85;
    var DOT_ALPHA   = 0.6;
    var WIRE_COLOR  = '210,200,255';

    /* Face placement within card */
    var FACE_SCALE  = 9.2;
    var FACE_OX     = CX;
    var FACE_OY     = CY + 2;

    /* Model center offset (from OBJ bounding box analysis) */
    var MODEL_CY = -0.57;
    var MODEL_CZ = 2.58;

    /* Text placement */
    var TEXT_W, TEXT_H, TEXT_X, TEXT_Y;

    /* Mobile wander */
    var WANDER_MIN = 2000, WANDER_MAX = 4000;

    /* ── State ── */
    var gazeTarget  = { x: 0, y: 0 };
    var gazeCurrent = { x: 0, y: 0 };
    var isVisible = false, rafId = null, wanderTimer = null;
    var isMobile = matchMedia('(pointer: coarse)').matches;

    var containers = [];
    var imgBack = null, imgText = null;
    var bgOffscreen = null;

    /* ── Pre-allocated projection arrays ── */
    var N_VERTS = FACE_V.length / 3;
    var N_TRIS  = FACE_I.length / 3;
    var projX = new Float32Array(N_VERTS);
    var projY = new Float32Array(N_VERTS);
    var projZ = new Float32Array(N_VERTS);

    /* ── Build edge list + detect boundary vertices ── */
    var edges = [];
    var isBoundary = new Uint8Array(N_VERTS); /* 1 = outermost contour vertex */
    (function () {
        var edgeCount = {};  /* how many triangles share each edge */
        var edgeSet = {};
        for (var t = 0; t < N_TRIS; t++) {
            var i0 = FACE_I[t * 3], i1 = FACE_I[t * 3 + 1], i2 = FACE_I[t * 3 + 2];
            countEdge(i0, i1); countEdge(i1, i2); countEdge(i2, i0);
        }
        function edgeKey(a, b) { return a < b ? a * 1000 + b : b * 1000 + a; }
        function countEdge(a, b) {
            var key = edgeKey(a, b);
            edgeCount[key] = (edgeCount[key] || 0) + 1;
            if (!edgeSet[key]) { edgeSet[key] = 1; edges.push(a, b); }
        }
        /* Boundary edges = shared by exactly 1 triangle */
        for (var k in edgeCount) {
            if (edgeCount[k] === 1) {
                /* find the two vertices from the edges array */
                for (var e = 0; e < edges.length; e += 2) {
                    var ek = edgeKey(edges[e], edges[e + 1]);
                    if (ek === +k) {
                        isBoundary[edges[e]] = 1;
                        isBoundary[edges[e + 1]] = 1;
                        break;
                    }
                }
            }
        }
    })();
    var N_EDGES = edges.length / 2;

    /* ── Load images then init ── */
    var loaded = 0;
    function onLoad() { if (++loaded === 2) init(); }

    imgBack = new Image(); imgBack.onload = onLoad; imgBack.src = './img/18-back.webp';
    imgText = new Image(); imgText.onload = onLoad; imgText.src = './img/18-text.svg';

    function init() {
        var textAR = imgText.naturalWidth / imgText.naturalHeight;
        TEXT_W = W * 0.56;
        TEXT_H = TEXT_W / textAR;
        TEXT_X = (W - TEXT_W) / 2;
        TEXT_Y = H * 0.20;

        bgOffscreen = document.createElement('canvas');
        bgOffscreen.width = W * DPR; bgOffscreen.height = H * DPR;
        var bgCtx = bgOffscreen.getContext('2d');
        bgCtx.scale(DPR, DPR);
        bgCtx.drawImage(imgBack, 0, 0, W, H);

        var wraps = document.querySelectorAll('.face-canvas-wrap');
        if (!wraps.length) return;
        for (var i = 0; i < wraps.length; i++) {
            var wrap = wraps[i];
            var cv = document.createElement('canvas');
            cv.width = W * DPR; cv.height = H * DPR;
            cv.style.cssText = 'width:100%;height:100%;display:block;';
            wrap.appendChild(cv);
            var ctx = cv.getContext('2d');
            ctx.scale(DPR, DPR);
            containers.push({ wrap: wrap, ctx: ctx });
        }

        drawAll();

        var io = new IntersectionObserver(function (entries) {
            var vis = entries.some(function (e) { return e.isIntersecting; });
            if (vis && !isVisible) { isVisible = true; startLoop(); if (isMobile) startWander(); }
            else if (!vis && isVisible) { isVisible = false; stopLoop(); stopWander(); }
        }, { threshold: 0.1 });
        containers.forEach(function (c) { io.observe(c.wrap); });

        if (!isMobile) {
            var lastMX = -1, lastMY = -1;

            function updateGaze() {
                if (lastMX < 0) return;
                for (var ci = 0; ci < containers.length; ci++) {
                    var wrap = containers[ci].wrap;
                    if (!wrap.offsetParent) continue;
                    var rect = wrap.getBoundingClientRect();
                    var cx = rect.left + rect.width / 2;
                    var cy = rect.top + rect.height / 2;
                    gazeTarget.x = Math.max(-1, Math.min(1, (lastMX - cx) / (window.innerWidth * 0.5)));
                    gazeTarget.y = Math.max(-1, Math.min(1, (lastMY - cy) / (window.innerHeight * 0.5)));
                    break;
                }
            }

            document.addEventListener('mousemove', function (e) {
                lastMX = e.clientX; lastMY = e.clientY;
                updateGaze();
            }, { passive: true });

            window.addEventListener('scroll', updateGaze, { passive: true });
        }

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stopLoop(); stopWander(); }
            else if (isVisible) { startLoop(); if (isMobile) startWander(); }
        });
    }

    /* ============================================================
     *  3D PROJECTION
     * ============================================================ */

    function projectVertices(yaw, pitch) {
        var cy = Math.cos(yaw),  sy = Math.sin(yaw);
        var cp = Math.cos(pitch), sp = Math.sin(pitch);

        var m00 = cy,       m01 = 0,   m02 = sy;
        var m10 = sp * sy,  m11 = cp,  m12 = -sp * cy;
        var m20 = -cp * sy, m21 = sp,  m22 = cp * cy;

        for (var i = 0; i < N_VERTS; i++) {
            var ox = FACE_V[i * 3];
            var oy = -(FACE_V[i * 3 + 1] - MODEL_CY);
            var oz = FACE_V[i * 3 + 2] - MODEL_CZ;

            /* Concave X: pinch boundary contour inward */
            var nx = ox / 7.8;                     /* normalize to ~-1..1 */
            if (isBoundary[i]) {
                ox *= 1.0 - 0.35 * nx * nx;        /* strong pinch on outer contour */
            }

            var rx = m00 * ox + m01 * oy + m02 * oz;
            var ry = m10 * ox + m11 * oy + m12 * oz;
            var rz = m20 * ox + m21 * oy + m22 * oz;

            var scale = FOV / (FOV + rz);
            projX[i] = FACE_OX + rx * FACE_SCALE * scale;
            projY[i] = FACE_OY + ry * FACE_SCALE * scale;
            projZ[i] = rz;
        }
    }

    /* ============================================================
     *  WIREFRAME RENDERING
     * ============================================================ */

    function drawWireframe(ctx, gx, gy) {
        var yaw   = gx * MAX_YAW;
        var pitch = -gy * MAX_PITCH;

        projectVertices(yaw, pitch);

        ctx.save();
        pillPath(ctx);
        ctx.clip();

        /* Draw edges */
        ctx.strokeStyle = 'rgba(' + WIRE_COLOR + ',' + LINE_ALPHA + ')';
        ctx.lineWidth = LINE_WIDTH;
        ctx.beginPath();

        for (var e = 0; e < N_EDGES; e++) {
            var a = edges[e * 2], b = edges[e * 2 + 1];
            ctx.moveTo(projX[a], projY[a]);
            ctx.lineTo(projX[b], projY[b]);
        }

        ctx.stroke();

        /* Draw vertex dots */
        ctx.fillStyle = 'rgba(' + WIRE_COLOR + ',' + DOT_ALPHA + ')';
        for (var i = 0; i < N_VERTS; i++) {
            var depthScale = FOV / (FOV + projZ[i]);
            var r = DOT_RADIUS * depthScale;
            ctx.beginPath();
            ctx.arc(projX[i], projY[i], r, 0, 6.2832);
            ctx.fill();
        }

        ctx.restore();
    }

    /* ============================================================
     *  DRAW LOOP
     * ============================================================ */

    function startLoop() { if (!rafId) rafId = requestAnimationFrame(tick); }
    function stopLoop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function tick() {
        gazeCurrent.x += (gazeTarget.x - gazeCurrent.x) * LERP;
        gazeCurrent.y += (gazeTarget.y - gazeCurrent.y) * LERP;
        drawAll();
        rafId = requestAnimationFrame(tick);
    }

    function drawAll() {
        var gx = gazeCurrent.x;
        var gy = gazeCurrent.y;

        for (var i = 0; i < containers.length; i++) {
            var ctx = containers[i].ctx;

            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.clearRect(0, 0, W, H);

            /* Fill background behind the webp image */
            ctx.fillStyle = '#EBE5EF';
            ctx.fillRect(0, 0, W, H);

            ctx.drawImage(bgOffscreen, 0, 0, W * DPR, H * DPR, 0, 0, W, H);
            drawWireframe(ctx, gx, gy);

            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.drawImage(imgText, TEXT_X, TEXT_Y, TEXT_W, TEXT_H);
        }
    }

    function pillPath(ctx) {
        var r = W / 2;
        ctx.beginPath();
        ctx.arc(CX, r, r, Math.PI, 0);
        ctx.lineTo(W, H - r);
        ctx.arc(CX, H - r, r, 0, Math.PI);
        ctx.closePath();
    }

    /* ── Mobile wander ── */
    function startWander() { if (!wanderTimer) pickTarget(); }
    function stopWander()  { if (wanderTimer) { clearTimeout(wanderTimer); wanderTimer = null; } }
    function pickTarget() {
        gazeTarget.x = (Math.random() - 0.5) * 1.6;
        gazeTarget.y = (Math.random() - 0.5) * 1.0;
        wanderTimer = setTimeout(pickTarget, WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {});
    }
})();
