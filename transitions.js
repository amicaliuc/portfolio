(function () {
    // Only on devices with a real pointer (not touch)
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const dot = document.createElement('div');
    dot.classList.add('cursor-dot');
    document.body.appendChild(dot);

    document.addEventListener('mousemove', function (e) {
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
        dot.classList.add('visible');
    });

    document.addEventListener('mouseleave', function () {
        dot.classList.remove('visible');
    });

    function addHover(el) {
        el.addEventListener('mouseenter', function () { dot.classList.add('hovering'); });
        el.addEventListener('mouseleave', function () { dot.classList.remove('hovering'); });
    }

    document.querySelectorAll('a, button').forEach(addHover);

    // Watch for dynamically added elements
    new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            m.addedNodes.forEach(function (node) {
                if (node.nodeType === 1) {
                    if (node.matches('a, button')) addHover(node);
                    node.querySelectorAll && node.querySelectorAll('a, button').forEach(addHover);
                }
            });
        });
    }).observe(document.body, { childList: true, subtree: true });
})();
