/**
 * pill-physics.js
 * Loaded dynamically after Matter.js — via IntersectionObserver in index.html.
 *
 * Behaviour:
 *  - On page load: icons shown in settled (resting) position, no animation.
 *  - Scroll DOWN to section: icons reset to top and fall — physics runs ~2 s then pauses.
 *  - Scroll UP to section: icons already at rest, no fall animation.
 *  - Mouse hover / touch: physics resumes for repulsion; pauses 1.5 s after interaction ends.
 *  - Tab hidden: animation paused; resumes only on next interaction or fall trigger.
 */
(function () {
    'use strict';

    var cv = document.getElementById('pill-physics');
    if (!cv) return;

    var _m = window.Matter;
    if (!_m) { console.warn('pill-physics: Matter.js not loaded'); return; }

    var Engine = _m.Engine, Bodies = _m.Bodies, Body = _m.Body, Composite = _m.Composite;

    var W = 185, H = 331, CR = W / 2, SH = H - CR * 2;
    var DPR = Math.min(window.devicePixelRatio || 1, 2);

    /* ── canvas setup ── */
    cv.width  = W * DPR;
    cv.height = H * DPR;
    var ctx = cv.getContext('2d');
    ctx.scale(DPR, DPR);

    var cvM  = document.getElementById('pill-physics-mobile');
    var ctxM = null;
    if (cvM) {
        cvM.width  = W * DPR;
        cvM.height = H * DPR;
        ctxM = cvM.getContext('2d');
        ctxM.scale(DPR, DPR);
    }

    /* ── preload all SVG icons before starting the loop ── */
    var SVG_FILES = [
        './img/Group 54.svg',  './img/Group 55.svg',
        './img/Group 58.svg',  './img/Group 59.svg',
        './img/Group 60.svg',  './img/Group 61.svg',
        './img/Group 65.svg',  './img/Group 66.svg',
        './img/Group 67.svg',  './img/Group 68.svg',
        './img/Group 87.svg',  './img/Group 88.svg',
    ];

    Promise.all(SVG_FILES.map(function (src) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload  = function () { resolve(img); };
            img.onerror = function () { resolve(img); };
            img.src = src;
        });
    })).then(startPhysics);

    /* ── physics engine ── */
    function startPhysics(imgs) {
        var N = imgs.length;
        var IMG_R = 22.5;

        var engine = Engine.create({ gravity: { x: 0, y: 2.2 } });

        /* walls */
        var GAP = 3, WT = 20, SEGS = 32;
        var innerR = CR - GAP, arcR = innerR + WT / 2;
        var step = Math.PI / SEGS;
        var sLen = 2 * arcR * Math.sin(step / 2) + 2;
        var wOpt = { isStatic: true, friction: 0.05, restitution: 0.65 };

        var walls = [
            Bodies.rectangle(GAP - WT / 2,      H / 2, WT, SH + WT, wOpt),
            Bodies.rectangle(W - GAP + WT / 2,  H / 2, WT, SH + WT, wOpt),
        ];
        for (var i = 0; i < SEGS; i++) {
            var at = Math.PI + step * (i + 0.5);
            walls.push(Bodies.rectangle(
                W / 2 + arcR * Math.cos(at), CR + arcR * Math.sin(at),
                sLen, WT, Object.assign({}, wOpt, { angle: at + Math.PI / 2 })
            ));
            var ab = step * (i + 0.5);
            walls.push(Bodies.rectangle(
                W / 2 + arcR * Math.cos(ab), (H - CR) + arcR * Math.sin(ab),
                sLen, WT, Object.assign({}, wOpt, { angle: ab + Math.PI / 2 })
            ));
        }
        Composite.add(engine.world, walls);

        /* icon bodies — initial grid positions at top */
        var bodies = Array.from({ length: N }, function (_, i) {
            var col = i % 3, row = Math.floor(i / 3);
            var x = W * 0.18 + col * (W * 0.32) + (Math.random() - 0.5) * 8;
            var y = CR * 0.5  + row * (IMG_R * 2.8) + (Math.random() - 0.5) * 6;
            return Bodies.circle(x, y, IMG_R, {
                restitution: 0.45, friction: 0.05, frictionAir: 0.035, density: 0.003,
            });
        });
        Composite.add(engine.world, bodies);

        /* store initial (top) positions for fall reset */
        var topPositions = bodies.map(function (b) {
            return { x: b.position.x, y: b.position.y };
        });

        /* ── pre-settle silently so first draw shows icons at rest ── */
        for (var ps = 0; ps < 300; ps++) Engine.update(engine, 16);

        /* ── tick / stop helpers ── */
        var rafId    = null;
        var stopTimer = null;
        var lastT    = performance.now();
        var mx = -9999, my = -9999;
        var REPEL_R = 75, REPEL_K = 0.06, MAX_V = 8;

        function tick(now) {
            // Fixed timestep — prevents force/velocity spikes on slow frames
            lastT = now;

            for (var j = 0; j < bodies.length; j++) {
                var b  = bodies[j];
                var dx = b.position.x - mx;
                var dy = b.position.y - my;
                var d  = Math.hypot(dx, dy);
                if (d < REPEL_R && d > 0.5) {
                    var t = 1 - d / REPEL_R;
                    var s = REPEL_K * t * t;
                    Body.applyForce(b, b.position, { x: (dx / d) * s, y: (dy / d) * s });
                }
            }

            Engine.update(engine, 16);

            var j2, b2, spd;
            for (j2 = 0; j2 < bodies.length; j2++) {
                b2 = bodies[j2];
                spd = Math.hypot(b2.velocity.x, b2.velocity.y);
                if (spd > MAX_V) {
                    Body.setVelocity(b2, { x: b2.velocity.x / spd * MAX_V, y: b2.velocity.y / spd * MAX_V });
                }
                if (b2.position.x < -IMG_R || b2.position.x > W + IMG_R ||
                    b2.position.y < -IMG_R || b2.position.y > H + IMG_R) {
                    Body.setPosition(b2, { x: W / 2, y: H * 0.35 });
                    Body.setVelocity(b2, { x: (Math.random() - 0.5) * 2, y: 1 });
                }
            }

            drawTo(ctx);
            if (ctxM) drawTo(ctxM);

            rafId = requestAnimationFrame(tick);
        }

        function startTick() {
            if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
            if (rafId) return;
            lastT = performance.now();
            rafId = requestAnimationFrame(tick);
        }

        function stopTick() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            drawTo(ctx);
            if (ctxM) drawTo(ctxM);
        }

        function scheduleStop(ms) {
            if (stopTimer) clearTimeout(stopTimer);
            stopTimer = setTimeout(stopTick, ms || 1500);
        }

        /* reset bodies to top for fall animation */
        function resetToTop() {
            for (var i = 0; i < bodies.length; i++) {
                var p = topPositions[i];
                Body.setPosition(bodies[i], {
                    x: p.x + (Math.random() - 0.5) * 8,
                    y: p.y + (Math.random() - 0.5) * 6,
                });
                Body.setVelocity(bodies[i], { x: (Math.random() - 0.5) * 1.5, y: Math.random() * 2 });
                Body.setAngularVelocity(bodies[i], 0);
            }
        }

        /* ── scroll direction tracking ── */
        var scrollDir = 'down';
        var lastScrollY = window.scrollY;
        window.addEventListener('scroll', function () {
            var y = window.scrollY;
            scrollDir = (y >= lastScrollY) ? 'down' : 'up';
            lastScrollY = y;
        }, { passive: true });

        /* ── IntersectionObserver — fall on scroll-down entry only ── */
        var wasVisible = false;
        var triggers = cvM ? [cv, cvM] : [cv];

        var visIO = new IntersectionObserver(function (entries) {
            var isVisible = entries.some(function (e) { return e.isIntersecting; });

            if (isVisible && !wasVisible) {
                if (scrollDir === 'down') {
                    /* entered by scrolling down — play fall animation */
                    resetToTop();
                    startTick();
                    scheduleStop(2000);
                }
                /* scrolled up to section — icons already settled, no animation */
            } else if (!isVisible && wasVisible) {
                /* left viewport — stop physics */
                if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
                stopTick();
            }

            wasVisible = isVisible;
        }, { threshold: 0.1 });

        triggers.forEach(function (t) { visIO.observe(t); });

        /* ── mouse interaction ── */
        cv.addEventListener('mouseenter', function () {
            if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
            startTick();
        });
        cv.addEventListener('mouseleave', function () {
            mx = -9999; my = -9999;
            scheduleStop(1500);
        });
        cv.addEventListener('mousemove', function (e) {
            var r = cv.getBoundingClientRect();
            mx = (e.clientX - r.left) * (W / r.width);
            my = (e.clientY - r.top)  * (H / r.height);
        });

        /* ── touch interaction (mobile) ── */
        if (cvM) {
            function touchPos(e) {
                var r = cvM.getBoundingClientRect();
                var t = e.touches[0] || e.changedTouches[0];
                return {
                    x: (t.clientX - r.left) * (W / r.width),
                    y: (t.clientY - r.top)  * (H / r.height),
                };
            }
            cvM.addEventListener('touchstart', function (e) {
                e.preventDefault();
                if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
                startTick();
                var p = touchPos(e); mx = p.x; my = p.y;
            }, { passive: false });
            cvM.addEventListener('touchmove', function (e) {
                e.preventDefault();
                var p = touchPos(e); mx = p.x; my = p.y;
            }, { passive: false });
            cvM.addEventListener('touchend', function () {
                mx = -9999; my = -9999;
                scheduleStop(1500);
            });
        }

        /* ── pause on tab hidden ── */
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
                stopTick();
            }
            /* on tab return: no auto-resume — user re-triggers by hovering/scrolling */
        });

        /* ── initial static draw (settled icons, no movement) ── */
        drawTo(ctx);
        if (ctxM) drawTo(ctxM);

        /* ── draw helpers ── */
        function drawTo(c) {
            c.clearRect(0, 0, W, H);
            c.save();
            pillPath(c);
            c.fillStyle = '#ebebeb';
            c.fill();
            c.clip();
            for (var k = 0; k < imgs.length; k++) {
                var img = imgs[k];
                if (!img.complete || !img.naturalWidth) continue;
                var bk = bodies[k];
                c.save();
                c.translate(bk.position.x, bk.position.y);
                c.rotate(bk.angle);
                c.drawImage(img, -IMG_R, -IMG_R, IMG_R * 2, IMG_R * 2);
                c.restore();
            }
            c.restore();
        }

        function pillPath(c) {
            c.beginPath();
            c.arc(W / 2, CR,       CR, Math.PI, 0);
            c.lineTo(W, H - CR);
            c.arc(W / 2, H - CR,   CR, 0, Math.PI);
            c.closePath();
        }
    }
})();
