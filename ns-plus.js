// ==UserScript==
// @name         NodeSeek - 综合增强助手
// @namespace    https://www.nodeseek.com/
// @version      2.0.0
// @description  UID精准拉黑、头像替换
// @author       andyccc
// @match        https://www.nodeseek.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // 0. 持久化存储与配置系统
    // ==========================================
    const CONFIG = {
        get avatarStyle() { return GM_getValue('ns_avatar_style', 'dark_balanced'); },
        set avatarStyle(v) { GM_setValue('ns_avatar_style', v); },

        get blacklistEnabled() { return GM_getValue('ns_blacklist_enabled', true); },
        set blacklistEnabled(v) { GM_setValue('ns_blacklist_enabled', v); },

        get blacklist() { return GM_getValue('ns_blacklist_uids', []); },
        set blacklist(v) { GM_setValue('ns_blacklist_uids', v); },

        get floatPos() { return GM_getValue('ns_float_pos', { side: 'right', top: 220 }); },
        set floatPos(v) { GM_setValue('ns_float_pos', v); }
    };

    // ==========================================
    // 1. 全局样式注入 (防闪烁 + 排版 + 纯GPU贴边悬浮球)
    // ==========================================
    GM_addStyle(`
        /* 仅在启用了头像替换时底层遮蔽 */
        body[data-ns-style="active"] img[src*="/avatar/"],
        body[data-ns-style="active"] .head-container img,
        body[data-ns-style="active"] a[href*="/space/"] img.avatar,
        body[data-ns-style="active"] .content-item img.avatar {
            visibility: hidden !important;
            transition: none !important;
        }
        body[data-ns-style="active"] img[src^="data:image/svg+xml"] {
            visibility: visible !important;
        }

        /* --- 弹窗名片按钮组单行紧凑排版 --- */
        .hover-user-card .usercard-button-group,
        .user-card .usercard-button-group {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 6px !important;
            padding: 8px 10px !important;
            box-sizing: border-box !important;
        }
        .hover-user-card .usercard-button-group .btn,
        .user-card .usercard-button-group .btn {
            flex: 1 1 0% !important;
            min-width: 0 !important;
            padding: 5px 0 !important;
            text-align: center !important;
            font-size: 12px !important;
            margin: 0 !important;
            border-radius: 4px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            box-sizing: border-box !important;
            line-height: 1.2 !important;
        }

        /* 注入的拉黑按钮具体样式 */
        .ns-injected-block-btn {
            cursor: pointer !important;
            user-select: none !important;
            transition: background-color 0.2s ease, opacity 0.2s ease !important;
            text-decoration: none !important;
        }
        .usercard-button-group .ns-injected-block-btn {
            background-color: #ef4444 !important;
            color: #ffffff !important;
        }
        .usercard-button-group .ns-injected-block-btn:hover {
            opacity: 0.9 !important;
        }
        .usercard-button-group .ns-injected-block-btn.is-blocked {
            background-color: #64748b !important;
            color: #ffffff !important;
        }

        /* 个人空间主页标题栏里的按钮 */
        h1.username .ns-injected-block-btn {
            margin-left: 10px !important;
            float: right !important;
            background-color: #ef4444 !important;
            color: #ffffff !important;
            padding: 4px 10px !important;
            border-radius: 4px !important;
            font-size: 13px !important;
        }
        h1.username .ns-injected-block-btn.is-blocked {
            background-color: #64748b !important;
        }

        /* --- 固定贴边胶囊形态 --- */
        #ns-helper-fab {
            position: fixed;
            z-index: 999999;
            width: 36px;
            height: 38px;
            background: #1e293b;
            color: #f8fafc;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            user-select: none;
            touch-action: none;
            border: 2px solid rgba(255, 255, 255, 0.16);
            box-sizing: border-box;
            transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
            will-change: transform, opacity;
        }
        #ns-helper-fab:active {
            cursor: grabbing;
        }

        #ns-helper-fab.side-right {
            border-radius: 12px 0 0 12px !important;
            border-right: none !important;
        }
        #ns-helper-fab.side-left {
            border-radius: 0 12px 12px 0 !important;
            border-left: none !important;
        }

        #ns-helper-fab svg {
            width: 17px;
            height: 17px;
            fill: currentColor;
            pointer-events: none;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
        }

        /* 贴边收进态 */
        #ns-helper-fab.is-collapsed {
            transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease;
            opacity: 0.38;
        }
        #ns-helper-fab.is-collapsed.side-right {
            transform: translate3d(18px, 0, 0);
        }
        #ns-helper-fab.is-collapsed.side-left {
            transform: translate3d(-18px, 0, 0);
        }
        #ns-helper-fab.is-collapsed svg {
            opacity: 0.8;
            transform: scale(0.9);
        }

        /* 展开状态 */
        #ns-helper-fab:hover,
        #ns-helper-fab.is-dragging {
            transform: translate3d(0, 0, 0) !important;
            opacity: 1 !important;
            background: #0f172a;
        }
        #ns-helper-fab:hover svg {
            transform: scale(1.08) rotate(18deg);
            opacity: 1;
        }

        /* 悬浮配置弹窗 */
        #ns-helper-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.45);
            backdrop-filter: blur(4px);
            z-index: 1000000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
        }
        #ns-helper-modal-overlay.active {
            opacity: 1;
            pointer-events: auto;
        }
        #ns-helper-modal {
            width: 380px;
            max-width: 90vw;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 20px 30px rgba(0, 0, 0, 0.2);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1e293b;
        }
        .dark-layout #ns-helper-modal {
            background: #1e293b;
            color: #f1f5f9;
            box-shadow: 0 20px 30px rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ns-modal-header {
            padding: 14px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
            font-size: 15px;
            font-weight: 600;
        }
        .dark-layout .ns-modal-header {
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ns-modal-close {
            cursor: pointer;
            padding: 4px;
            font-size: 18px;
            line-height: 1;
            opacity: 0.6;
        }
        .ns-modal-close:hover { opacity: 1; }
        .ns-modal-body {
            padding: 16px 18px;
            max-height: 70vh;
            overflow-y: auto;
            font-size: 13px;
        }
        .ns-section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .ns-section-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
        }
        .ns-text-btn-danger {
            font-size: 11px;
            color: #ef4444;
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
        }
        .ns-text-btn-danger:hover { text-decoration: underline; }

        .ns-select {
            width: 100%;
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
            background: transparent;
            color: inherit;
            font-size: 13px;
            outline: none;
            margin-bottom: 16px;
            cursor: pointer;
        }
        .dark-layout .ns-select {
            border-color: #475569;
            background: #0f172a;
        }

        .ns-switch-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 2px 0 10px 0;
        }
        .ns-tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            max-height: 120px;
            overflow-y: auto;
            padding: 4px 0;
            margin-bottom: 12px;
        }
        .ns-tag {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 6px;
            background: rgba(239, 68, 68, 0.12);
            color: #ef4444;
            font-size: 12px;
        }
        .dark-layout .ns-tag {
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
        }
        .ns-tag-del { cursor: pointer; font-weight: bold; }
        .ns-tag-del:hover { opacity: 0.7; }

        .ns-input-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .ns-input {
            flex: 1;
            padding: 6px 10px;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
            background: transparent;
            color: inherit;
            font-size: 12px;
        }
        .dark-layout .ns-input { border-color: #475569; }
        .ns-btn {
            padding: 6px 12px;
            border-radius: 6px;
            border: none;
            background: #2563eb;
            color: #fff;
            cursor: pointer;
            font-size: 12px;
        }
        .ns-btn:hover { background: #1d4ed8; }

        .ns-footer-actions {
            display: flex;
            gap: 8px;
            border-top: 1px solid rgba(0, 0, 0, 0.08);
            padding-top: 14px;
        }
        .dark-layout .ns-footer-actions {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ns-btn-secondary {
            flex: 1;
            padding: 7px 0;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: 12px;
            text-align: center;
        }
        .dark-layout .ns-btn-secondary { border-color: #475569; }
        .ns-btn-secondary:hover { background: rgba(0, 0, 0, 0.04); }
        .dark-layout .ns-btn-secondary:hover { background: rgba(255, 255, 255, 0.05); }

        /* 黑名单屏蔽表现 */
        .ns-blocked-item { display: none !important; }
        .ns-blocked-floor-bar {
            padding: 8px 12px;
            margin: 6px 0;
            background: rgba(148, 163, 184, 0.12);
            border-radius: 6px;
            font-size: 12px;
            color: #64748b;
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .ns-blocked-floor-bar:hover { background: rgba(148, 163, 184, 0.2); }
    `);

    function updateStyleState() {
        if (CONFIG.avatarStyle !== 'none') {
            document.body?.setAttribute('data-ns-style', 'active');
            document.documentElement.setAttribute('data-ns-style', 'active');
        } else {
            document.body?.removeAttribute('data-ns-style');
            document.documentElement.removeAttribute('data-ns-style');
        }
    }
    updateStyleState();

    // ==========================================
    // 2. SVG 头像生成器
    // ==========================================
    const PALETTE_430 = [
        '#1E40AF', '#0369A1', '#0F766E', '#047857',
        '#B45309', '#C2410C', '#B91C1C', '#BE185D',
        '#6D28D9', '#4338CA', '#334155'
    ];

    function getBalancedColor(name) {
        let hash = 0;
        const str = String(name || '');
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return PALETTE_430[Math.abs(hash) % PALETTE_430.length];
    }

    function formatAvatarText(name) {
        if (!name) return '?';
        const clean = String(name).trim();
        if (/[\u4e00-\u9fa5]/.test(clean)) return clean.slice(0, 2);
        return clean.slice(0, 2).toUpperCase();
    }

    function generateAvatarSvg(name) {
        const text = formatAvatarText(name);
        if (CONFIG.avatarStyle === 'minimal_outline') {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100%" height="100%" fill="#64748b" fill-opacity="0.08"/>
                <rect width="94%" height="94%" x="3%" y="3%" fill="none" stroke="#94a3b8" stroke-width="3" stroke-opacity="0.45" rx="6" ry="6"/>
                <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-size="38" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${text}</text>
            </svg>`.trim();
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        } else {
            const bg = getBalancedColor(name);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
                <rect width="100%" height="100%" fill="${bg}"/>
                <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" fill-opacity="0.9" font-size="38" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${text}</text>
            </svg>`.trim();
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        }
    }

    // ==========================================
    // 3. 用户名与 UID 深度提取逻辑
    // ==========================================
    function parseUserIdFromHref(href) {
        if (!href) return null;
        const match = href.match(/\/space\/(\d+)/);
        return match ? match[1] : null;
    }

    function resolveUsername(img) {
        const headContainer = img.closest('.head-container');
        if (headContainer) {
            const userEl = headContainer.querySelector('.username, h1, h2');
            if (userEl && userEl.textContent.trim()) {
                const name = userEl.textContent.trim().split('\n')[0].trim();
                if (name && name !== 'Loading') return name;
            }
        }
        const alt = img.getAttribute('alt') || '';
        const title = img.getAttribute('title') || '';
        if (alt && !alt.startsWith('avatar of user') && !alt.startsWith('avatar of')) return alt.trim();
        if (title) return title.trim();

        const card = img.closest('.post-list-item, .post-item, .content-item, tr, li, .topic-detail, .user-card') || img.parentElement;
        if (card) {
            const spaceLinks = Array.from(card.querySelectorAll('a[href*="/space/"]')).filter(a => !a.querySelector('img'));
            if (spaceLinks.length > 0) {
                const txt = spaceLinks[0].textContent.trim();
                if (txt && !txt.includes('\n')) return txt;
            }
        }
        return '';
    }

    // ==========================================
    // 4. 头像热替换引擎
    // ==========================================
    function processImage(img, forceUpdate = false) {
        if (CONFIG.avatarStyle === 'none') {
            if (img.dataset.nsReplaced === 'true' && img.dataset.nsRawSrc) {
                img.src = img.dataset.nsRawSrc;
                img.dataset.nsReplaced = 'false';
            }
            return;
        }

        const src = img.getAttribute('src') || '';
        if (!forceUpdate && (src.startsWith('data:image/svg+xml') || img.dataset.nsReplaced === 'true')) {
            return;
        }

        if (src.includes('/loading/') || src.includes('favicon') || src.includes('telegram') || src.includes('email') || src.includes('logo')) {
            return;
        }

        const isAvatar = src.includes('/avatar/') ||
                         img.classList.contains('avatar') ||
                         img.closest('.head-container') ||
                         img.closest('a[href*="/space/"]');
        if (!isAvatar) return;

        const username = img.dataset.nsOriginalUser || resolveUsername(img);
        if (!username) return;

        if (!img.dataset.nsRawSrc && !src.startsWith('data:image/svg+xml')) {
            img.dataset.nsRawSrc = src;
        }
        img.dataset.nsOriginalUser = username;
        img.src = generateAvatarSvg(username);
        img.srcset = '';
        img.title = username;
        img.dataset.nsReplaced = 'true';
    }

    function reprocessAllAvatars() {
        updateStyleState();
        const imgs = document.querySelectorAll('img[src*="/avatar/"], img.avatar, .head-container img, a[href*="/space/"] img, img[data-ns-replaced="true"]');
        imgs.forEach(img => processImage(img, true));
    }

    // ==========================================
    // 5. 黑名单基础操作
    // ==========================================
    function isUidBlocked(uid) {
        if (!CONFIG.blacklistEnabled || !uid) return false;
        return CONFIG.blacklist.some(item => String(item.id) === String(uid));
    }

    function blockUid(uid, name = '') {
        if (!uid) return;
        const list = CONFIG.blacklist;
        const exist = list.find(item => String(item.id) === String(uid));
        if (!exist) {
            list.push({ id: String(uid), name: name || `UID: ${uid}` });
            CONFIG.blacklist = list;
            refreshUI();
            updateModalBlacklistUI();
        }
    }

    function unblockUid(uid) {
        const list = CONFIG.blacklist.filter(item => String(item.id) !== String(uid));
        CONFIG.blacklist = list;
        refreshUI();
        updateModalBlacklistUI();
    }

    function clearBlacklist() {
        if (confirm('确定要清空全部黑名单吗？此操作无法撤销。')) {
            CONFIG.blacklist = [];
            refreshUI();
            updateModalBlacklistUI();
        }
    }

    function triggerOfficialClose(card) {
        if (!card) return;
        const officialCloseBtn = card.querySelector('.closeBtn');
        if (officialCloseBtn) {
            officialCloseBtn.click();
        }
    }

    // ==========================================
    // 6. 精准注入拉黑按钮（全局捕获委托，彻底避免绑定丢失）
    // ==========================================
    function injectActionButtons() {
        // 场景 A：点击头像弹出的悬浮名片 (.hover-user-card / .user-card)
        const hoverCards = document.querySelectorAll('.hover-user-card, .user-card');
        hoverCards.forEach(card => {
            if (card.style.display === 'none') return;

            const btnGroup = card.querySelector('.usercard-button-group');
            const spaceLink = card.querySelector('a[href*="/space/"]');
            if (!btnGroup || !spaceLink) return;

            const uid = parseUserIdFromHref(spaceLink.getAttribute('href'));
            if (!uid) return;

            let blockBtn = btnGroup.querySelector('.ns-injected-block-btn');
            if (!blockBtn) {
                blockBtn = document.createElement('a');
                blockBtn.className = 'btn ns-injected-block-btn';
                blockBtn.href = 'javascript:void(0)';
                btnGroup.appendChild(blockBtn);
            }

            const blocked = isUidBlocked(uid);
            const expectedText = blocked ? '解除' : '拉黑';

            if (blockBtn.textContent !== expectedText) {
                blockBtn.textContent = expectedText;
            }
            blockBtn.title = blocked ? '解除此用户拉黑' : '拉黑此用户';
            blockBtn.classList.toggle('is-blocked', blocked);
            blockBtn.dataset.targetUid = uid;
        });

        // 场景 B：个人空间页面 (.head-container)
        const spaceHead = document.querySelector('.head-container .word h1.username');
        if (spaceHead) {
            const uid = parseUserIdFromHref(location.pathname);
            if (uid) {
                let blockBtn = spaceHead.querySelector('.ns-injected-block-btn');
                if (!blockBtn) {
                    blockBtn = document.createElement('a');
                    blockBtn.className = 'btn ns-injected-block-btn';
                    blockBtn.href = 'javascript:void(0)';
                    spaceHead.appendChild(blockBtn);
                }

                const blocked = isUidBlocked(uid);
                const expectedText = blocked ? '解除拉黑' : '拉黑';
                if (blockBtn.textContent !== expectedText) {
                    blockBtn.textContent = expectedText;
                }
                blockBtn.classList.toggle('is-blocked', blocked);
                blockBtn.dataset.targetUid = uid;
            }
        }
    }

    // 全局捕获事件委托：彻底解决 DOM 动态刷新导致 onclick 丢失或 UID 延迟就绪问题
    document.addEventListener('click', (e) => {
        const blockBtn = e.target.closest('.ns-injected-block-btn');
        if (!blockBtn) return;

        e.preventDefault();
        e.stopPropagation();

        let uid = blockBtn.dataset.targetUid;
        const card = blockBtn.closest('.hover-user-card, .user-card');
        let name = '';

        if (card) {
            const spaceLink = card.querySelector('a[href*="/space/"]');
            if (!uid && spaceLink) uid = parseUserIdFromHref(spaceLink.getAttribute('href'));
            name = card.querySelector('.Username, .username')?.textContent.trim() || spaceLink?.getAttribute('title') || '';
        } else {
            if (!uid) uid = parseUserIdFromHref(location.pathname);
            const spaceHead = document.querySelector('.head-container .word h1.username');
            name = spaceHead?.textContent.trim().split('\n')[0].trim() || '';
        }

        if (!uid) {
            alert('未能识别到用户 UID，请稍候再试');
            return;
        }

        if (isUidBlocked(uid)) {
            unblockUid(uid);
            blockBtn.textContent = card ? '拉黑' : '拉黑';
            blockBtn.classList.remove('is-blocked');
        } else {
            if (confirm(`确定要拉黑用户「${name || uid}」(UID: ${uid}) 吗？拉黑后将屏蔽其所有发帖和评论。`)) {
                blockUid(uid, name);
                blockBtn.textContent = card ? '解除' : '解除拉黑';
                blockBtn.classList.add('is-blocked');
                if (card) triggerOfficialClose(card);
            }
        }
    }, true);

    // ==========================================
    // 7. 页面元素过滤屏蔽
    // ==========================================
    function processBlacklistDOM() {
        if (!CONFIG.blacklistEnabled) {
            document.querySelectorAll('.ns-blocked-item').forEach(el => el.classList.remove('ns-blocked-item'));
            document.querySelectorAll('.ns-blocked-floor-bar').forEach(el => el.remove());
            document.querySelectorAll('.ns-floor-hidden').forEach(el => el.style.display = '');
            return;
        }

        // 1. 评论楼层屏蔽
        const comments = document.querySelectorAll('.content-item');
        comments.forEach(card => {
            const userLink = card.querySelector('a[href*="/space/"]');
            const uid = parseUserIdFromHref(userLink?.getAttribute('href'));
            const username = card.querySelector('a[href*="/space/"]:not(:has(img))')?.textContent.trim() || uid;
            if (!uid) return;

            if (isUidBlocked(uid)) {
                if (card.previousElementSibling?.classList.contains('ns-blocked-floor-bar')) return;
                card.style.display = 'none';
                card.classList.add('ns-floor-hidden');

                const bar = document.createElement('div');
                bar.className = 'ns-blocked-floor-bar';
                bar.innerHTML = `<span>🚫 已屏蔽来自 <b>${username}</b> (UID:${uid}) 的发言</span><span style="font-size:11px;opacity:0.8;">点击展开</span>`;
                bar.addEventListener('click', () => {
                    const isHidden = card.style.display === 'none';
                    card.style.display = isHidden ? '' : 'none';
                    bar.querySelector('span:last-child').textContent = isHidden ? '点击收起' : '点击展开';
                });
                card.parentNode.insertBefore(bar, card);
            }
        });

        // 2. 首页及列表帖子屏蔽
        const listItems = document.querySelectorAll('.post-list-item, .post-item, tr');
        listItems.forEach(item => {
            const authorLink = item.querySelector('a[href*="/space/"]');
            const uid = parseUserIdFromHref(authorLink?.getAttribute('href'));
            if (uid && isUidBlocked(uid)) {
                item.classList.add('ns-blocked-item');
            } else {
                item.classList.remove('ns-blocked-item');
            }
        });
    }

    // ==========================================
    // 8. 导入与导出实用工具
    // ==========================================
    function exportConfigData() {
        const data = {
            version: '2.2.0',
            exportedAt: new Date().toISOString(),
            avatarStyle: CONFIG.avatarStyle,
            blacklistEnabled: CONFIG.blacklistEnabled,
            blacklist: CONFIG.blacklist,
            floatPos: CONFIG.floatPos
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nodeseek_helper_config_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importConfigData(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.blacklist && Array.isArray(data.blacklist)) {
                    CONFIG.blacklist = data.blacklist;
                }
                if (data.avatarStyle) {
                    CONFIG.avatarStyle = data.avatarStyle;
                }
                if (typeof data.blacklistEnabled === 'boolean') {
                    CONFIG.blacklistEnabled = data.blacklistEnabled;
                }
                if (data.floatPos) {
                    CONFIG.floatPos = data.floatPos;
                }

                alert('配置与黑名单已成功导入！');
                location.reload();
            } catch (err) {
                alert('导入失败：不是有效的 JSON 配置文件！');
            }
        };
        reader.readAsText(file);
    }

    // ==========================================
    // 9. 纯GPU贴边悬浮球与拖拽核心
    // ==========================================
    function createUI() {
        if (document.getElementById('ns-helper-fab')) return;

        const fab = document.createElement('div');
        fab.id = 'ns-helper-fab';
        fab.title = 'NodeSeek 控制台 (按住拖拽 / 点击打开)';
        fab.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-.97 0-.32-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49-.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .32.03.66.07.97l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.31.61.22l2.49-1c.52.39 1.06.73 1.69.98l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.25 1.17-.59 1.69-.98l2.49 1c.22.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65Z"/>
            </svg>
        `;

        const pos = CONFIG.floatPos;
        fab.style.top = `${pos.top}px`;
        if (pos.side === 'left') {
            fab.style.left = '0px';
            fab.style.right = 'auto';
            fab.classList.add('side-left');
        } else {
            fab.style.left = 'auto';
            fab.style.right = '0px';
            fab.classList.add('side-right');
        }

        const overlay = document.createElement('div');
        overlay.id = 'ns-helper-modal-overlay';
        overlay.innerHTML = `
            <div id="ns-helper-modal">
                <div class="ns-modal-header">
                    <span>NodeSeek 增强配置</span>
                    <span class="ns-modal-close">&times;</span>
                </div>
                <div class="ns-modal-body">
                    <div class="ns-section-header">
                        <span class="ns-section-title">头像显示风格</span>
                    </div>
                    <select id="ns-avatar-select" class="ns-select">
                        <option value="none" ${CONFIG.avatarStyle === 'none' ? 'selected' : ''}>无（保持网站原生头像）</option>
                        <option value="dark_balanced" ${CONFIG.avatarStyle === 'dark_balanced' ? 'selected' : ''}>方案 A：彩色文字</option>
                        <option value="minimal_outline" ${CONFIG.avatarStyle === 'minimal_outline' ? 'selected' : ''}>方案 B：极简轮廓</option>
                    </select>

                    <div class="ns-section-header">
                        <span class="ns-section-title">UID 黑名单管理</span>
                        <button id="ns-btn-clear-blacklist" class="ns-text-btn-danger">清空名单</button>
                    </div>
                    <div class="ns-switch-row">
                        <span>启用黑名单过滤</span>
                        <input type="checkbox" id="ns-toggle-blacklist" ${CONFIG.blacklistEnabled ? 'checked' : ''}>
                    </div>

                    <div class="ns-tag-list" id="ns-blacklist-tags"></div>

                    <div class="ns-input-row">
                        <input type="text" id="ns-block-input" class="ns-input" placeholder="输入 UID 或空间链接 (如 41514)">
                        <button id="ns-block-add-btn" class="ns-btn">添加</button>
                    </div>

                    <div class="ns-footer-actions">
                        <button id="ns-btn-export" class="ns-btn-secondary">导出配置 (JSON)</button>
                        <button id="ns-btn-import-trigger" class="ns-btn-secondary">导入配置</button>
                        <input type="file" id="ns-file-import" accept=".json" style="display:none;">
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(fab);
        document.body.appendChild(overlay);

        setupFabInteraction(fab, overlay);
        setupModalEvents(overlay);
        updateModalBlacklistUI();
    }

    function setupFabInteraction(fab, overlay) {
        let isDragging = false;
        let startClientX = 0, startClientY = 0;
        let grabOffsetX = 0, grabOffsetY = 0;
        let hasMoved = false;

        let collapseTimer = null;

        function triggerCollapse() {
            if (isDragging || overlay.classList.contains('active')) return;
            fab.classList.add('is-collapsed');
        }

        function restartCollapseTimer() {
            clearTimeout(collapseTimer);
            fab.classList.remove('is-collapsed');
            if (overlay.classList.contains('active') || isDragging) return;
            collapseTimer = setTimeout(triggerCollapse, 2000);
        }

        fab.addEventListener('mouseenter', () => {
            clearTimeout(collapseTimer);
            fab.classList.remove('is-collapsed');
        });
        fab.addEventListener('mouseleave', () => {
            restartCollapseTimer();
        });
        fab.addEventListener('mousemove', () => {
            if (fab.classList.contains('is-collapsed')) {
                fab.classList.remove('is-collapsed');
            }
            restartCollapseTimer();
        });

        restartCollapseTimer();

        fab.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            hasMoved = false;
            startClientX = e.clientX;
            startClientY = e.clientY;

            const rect = fab.getBoundingClientRect();
            grabOffsetX = e.clientX - rect.left;
            grabOffsetY = e.clientY - rect.top;

            fab.setPointerCapture(e.pointerId);
            clearTimeout(collapseTimer);
            fab.classList.remove('is-collapsed');
            fab.classList.add('is-dragging');
            fab.style.transition = 'none';
        });

        window.addEventListener('pointermove', (e) => {
            if (!isDragging) return;

            const deltaX = Math.abs(e.clientX - startClientX);
            const deltaY = Math.abs(e.clientY - startClientY);
            if (deltaX > 6 || deltaY > 6) {
                hasMoved = true;
            }

            let targetX = e.clientX - grabOffsetX;
            let targetY = e.clientY - grabOffsetY;

            const maxX = window.innerWidth - fab.offsetWidth;
            const maxY = window.innerHeight - fab.offsetHeight;
            targetX = Math.max(0, Math.min(maxX, targetX));
            targetY = Math.max(10, Math.min(maxY - 10, targetY));

            fab.style.left = `${targetX}px`;
            fab.style.top = `${targetY}px`;
            fab.style.right = 'auto';
        });

        window.addEventListener('pointerup', () => {
            if (!isDragging) return;
            isDragging = false;
            fab.classList.remove('is-dragging');
            fab.style.transition = '';

            if (!hasMoved) {
                overlay.classList.add('active');
                clearTimeout(collapseTimer);
                return;
            }

            const winWidth = window.innerWidth;
            const currentLeft = fab.getBoundingClientRect().left;
            const finalTop = Math.max(20, Math.min(window.innerHeight - 60, parseInt(fab.style.top, 10)));

            if (currentLeft + (fab.offsetWidth / 2) < winWidth / 2) {
                fab.style.left = '0px';
                fab.style.right = 'auto';
                fab.classList.remove('side-right');
                fab.classList.add('side-left');
                CONFIG.floatPos = { side: 'left', top: finalTop };
            } else {
                fab.style.left = 'auto';
                fab.style.right = '0px';
                fab.classList.remove('side-left');
                fab.classList.add('side-right');
                CONFIG.floatPos = { side: 'right', top: finalTop };
            }

            restartCollapseTimer();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('ns-modal-close')) {
                restartCollapseTimer();
            }
        });
    }

    function setupModalEvents(overlay) {
        overlay.querySelector('.ns-modal-close').addEventListener('click', () => overlay.classList.remove('active'));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });

        const select = overlay.querySelector('#ns-avatar-select');
        select.addEventListener('change', (e) => {
            CONFIG.avatarStyle = e.target.value;
            reprocessAllAvatars();
        });

        const toggle = overlay.querySelector('#ns-toggle-blacklist');
        toggle.addEventListener('change', (e) => {
            CONFIG.blacklistEnabled = e.target.checked;
            refreshUI();
        });

        overlay.querySelector('#ns-btn-clear-blacklist').addEventListener('click', clearBlacklist);

        const addBtn = overlay.querySelector('#ns-block-add-btn');
        const input = overlay.querySelector('#ns-block-input');
        const handleAdd = () => {
            const raw = input.value.trim();
            if (!raw) return;
            const match = raw.match(/\d+/);
            if (match) {
                blockUid(match[0]);
                input.value = '';
            } else {
                alert('请输入有效的用户 ID 或空间链接');
            }
        };
        addBtn.addEventListener('click', handleAdd);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd(); });

        overlay.querySelector('#ns-btn-export').addEventListener('click', exportConfigData);

        const fileInput = overlay.querySelector('#ns-file-import');
        overlay.querySelector('#ns-btn-import-trigger').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                importConfigData(e.target.files[0]);
            }
        });
    }

    function updateModalBlacklistUI() {
        const container = document.getElementById('ns-blacklist-tags');
        if (!container) return;
        const list = CONFIG.blacklist;
        if (list.length === 0) {
            container.innerHTML = '<span style="color:#94a3b8;font-size:12px;">暂无拉黑用户</span>';
            return;
        }

        container.innerHTML = '';
        list.forEach(item => {
            const tag = document.createElement('span');
            tag.className = 'ns-tag';
            const label = item.name && item.name !== `UID: ${item.id}` ? `${item.name} (${item.id})` : `UID: ${item.id}`;
            tag.innerHTML = `<span>${label}</span><span class="ns-tag-del" title="解除屏蔽">&times;</span>`;
            tag.querySelector('.ns-tag-del').addEventListener('click', () => unblockUid(item.id));
            container.appendChild(tag);
        });
    }

    // ==========================================
    // 10. 刷新调度与节流监听
    // ==========================================
    function refreshUI() {
        if (CONFIG.avatarStyle !== 'none') {
            const imgs = document.querySelectorAll('img[src*="/avatar/"], img.avatar, .head-container img, a[href*="/space/"] img');
            for (let i = 0; i < imgs.length; i++) {
                processImage(imgs[i]);
            }
        }
        injectActionButtons();
        processBlacklistDOM();
    }

    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => {
            refreshUI();
            debounceTimer = null;
        }, 50);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    document.addEventListener('DOMContentLoaded', () => {
        updateStyleState();
        refreshUI();
        createUI();
    });
    window.addEventListener('load', () => {
        updateStyleState();
        refreshUI();
        createUI();
    });
    window.addEventListener('hashchange', () => setTimeout(refreshUI, 40));
    window.addEventListener('popstate', () => setTimeout(refreshUI, 40));
})();
