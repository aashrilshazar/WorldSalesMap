const NEWS_ENDPOINT = '/api/news';
const NEWS_REFRESH_MS = 15 * 60 * 1000;
const NEWS_LOADING_MESSAGE = 'Loading latest firm headlines...';
const NEWS_ERROR_INITIAL = 'Unable to load news headlines. Try again soon.';
const NEWS_ERROR_REFRESH = 'Unable to refresh news feed. Showing cached results.';
const NEWS_MIN_HEIGHT = 160;
const NEWS_MAX_HEIGHT_RATIO = 0.7;
const NEWS_SAFE_MARGIN = 180;
const TOUCH_MOVE_OPTIONS = { passive: false };

let newsFetchPromise = null;

function initNewsBar() {
    const searchInput = $('news-search');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', handleNewsSearch);
        searchInput.dataset.bound = 'true';
    }

    const toggleButton = $('news-toggle');
    if (toggleButton && !toggleButton.dataset.bound) {
        toggleButton.addEventListener('click', handleNewsToggle);
        toggleButton.dataset.bound = 'true';
    }

    const listEl = $('news-list');
    if (listEl && !listEl.dataset.actionsBound) {
        listEl.addEventListener('click', handleNewsListClick);
        listEl.dataset.actionsBound = 'true';
    }

    setupNewsResizer();
    requestAnimationFrame(captureInitialNewsBarHeight);

    state.newsItems = Array.isArray(state.newsItems) ? state.newsItems : [];
    state.newsLoading = true;
    renderNewsBar();

    loadNewsFromServer();

    if (!state.newsRefreshInterval) {
        state.newsRefreshInterval = setInterval(() => {
            loadNewsFromServer();
        }, NEWS_REFRESH_MS);
    }
}

function handleNewsSearch(event) {
    state.newsFilter = (event.target.value || '').trim().toLowerCase();
    renderNewsBar();
}

function handleNewsToggle() {
    state.newsCollapsed = !state.newsCollapsed;
    renderNewsBar();
}

function handleNewsListClick(event) {
    const deleteButton = event.target.closest('[data-action="delete"]');
    if (!deleteButton) return;

    const { newsId } = deleteButton.dataset;
    if (!newsId) return;

    state.dismissedNewsIds.add(newsId);
    state.newsItems = state.newsItems.filter(item => item.id !== newsId);
    renderNewsBar();
}

function getVisibleNews() {
    const items = Array.isArray(state.newsItems) ? state.newsItems : [];
    const filtered = items.filter(item => !state.dismissedNewsIds.has(item.id));
    if (!state.newsFilter) return filtered;

    return filtered.filter(item => {
        const haystack = [
            item.firm,
            item.headline,
            item.summary,
            (item.tags || []).join(' '),
            item.source
        ]
            .join(' ')
            .toLowerCase();

        return haystack.includes(state.newsFilter);
    });
}

function renderNewsBar() {
    const bar = $('news-bar');
    if (!bar) return;

    applyNewsBarHeight(bar);

    const toggleButton = $('news-toggle');
    const listEl = $('news-list');
    const countEl = $('news-count');

    if (state.newsCollapsed) {
        bar.classList.add('news-bar--collapsed');
        if (toggleButton) {
            toggleButton.textContent = 'Maximize';
            toggleButton.setAttribute('aria-expanded', 'false');
        }
    } else {
        bar.classList.remove('news-bar--collapsed');
        if (toggleButton) {
            toggleButton.textContent = 'Minimize';
            toggleButton.setAttribute('aria-expanded', 'true');
        }
    }

    if (!listEl || !countEl) return;

    const visibleNews = getVisibleNews();

    if (state.newsLoading && !state.newsItems.length) {
        countEl.textContent = 'Loading...';
        listEl.innerHTML = renderNewsStatus(NEWS_LOADING_MESSAGE, 'loading');
        return;
    }

    if (state.newsFilter && !visibleNews.length) {
        countEl.textContent = 'No matches';
    } else {
        const count = visibleNews.length;
        let label = count ? `${count} article${count === 1 ? '' : 's'}` : 'No articles';

        if (state.newsLoading && state.newsItems.length) {
            label += ' • refreshing...';
        } else if (state.newsLastUpdated) {
            const updated = formatRelativeTime(state.newsLastUpdated);
            if (updated) {
                label += ` • updated ${updated}`;
            }
        }

        if (state.newsError && state.newsItems.length) {
            label += ' • refresh failed';
        }

        countEl.textContent = label;
    }

    if (state.newsError && !visibleNews.length) {
        listEl.innerHTML = renderNewsStatus(state.newsError, 'error');
        return;
    }

    if (!visibleNews.length) {
        const message = state.newsFilter
            ? 'No articles match your search yet.'
            : 'No recent headlines for the configured firms yet.';
        listEl.innerHTML = `<div class="news-empty">${message}</div>`;
        return;
    }

    const errorBanner = state.newsError ? renderNewsStatus(state.newsError, 'error') : '';
    const cards = visibleNews.map(renderNewsCard).join('');
    listEl.innerHTML = errorBanner + cards;
}

function renderNewsCard(item) {
    const tagsLine = (item.tags || []).filter(Boolean).join(', ');
    const metaParts = [
        item.source,
        formatRelativeTime(item.publishedAt),
        tagsLine
    ].filter(Boolean);

    const metaHtml = metaParts.map(part => `<span>${part}</span>`).join('');

    return `
        <article class="news-card" data-news-id="${item.id}">
            <a class="news-card__link" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                <div class="news-card__content">
                    <div class="news-card__firm">${item.firm}</div>
                    <div class="news-card__headline">${item.headline}</div>
                    <div class="news-card__summary">${item.summary || ''}</div>
                    ${metaHtml ? `<div class="news-card__meta">${metaHtml}</div>` : ''}
                </div>
            </a>
            <button class="news-card__delete" type="button" data-action="delete" data-news-id="${item.id}">Delete</button>
        </article>
    `;
}

function renderNewsStatus(message, variant = 'info') {
    const variantClass = variant ? ` news-status--${variant}` : '';
    return `<div class="news-status${variantClass}">${message}</div>`;
}

function updateNewsBarForView(mode) {
    const bar = $('news-bar');
    if (!bar) return;
    const shouldHide = mode === 'kanban';
    bar.classList.toggle('hidden', shouldHide);
    bar.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');
}

function formatRelativeTime(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const diffMs = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) {
        return 'just now';
    }

    if (diffMs < hour) {
        const minutes = Math.max(1, Math.round(diffMs / minute));
        return `${minutes}m ago`;
    }

    if (diffMs < day) {
        const hours = Math.round(diffMs / hour);
        return `${hours}h ago`;
    }

    const days = Math.round(diffMs / day);
    if (days < 7) {
        return `${days}d ago`;
    }

    const weeks = Math.round(days / 7);
    return `${weeks}w ago`;
}

function loadNewsFromServer() {
    if (newsFetchPromise) {
        return newsFetchPromise;
    }

    const previousItems = (state.newsItems || []).slice();
    state.newsLoading = true;
    renderNewsBar();

    newsFetchPromise = (async () => {
        try {
            const response = await fetch(NEWS_ENDPOINT, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const data = await response.json();
            const items = Array.isArray(data.items) ? data.items : [];
            const filtered = items.filter(item => item && !state.dismissedNewsIds.has(item.id));

            state.newsItems = filtered;
            state.newsLastUpdated = data.lastUpdated || null;
            state.newsError = null;
        } catch (error) {
            console.error('Failed to load news feed', error);
            state.newsItems = previousItems;
            state.newsError = previousItems.length ? NEWS_ERROR_REFRESH : NEWS_ERROR_INITIAL;
        }
    })()
        .finally(() => {
            state.newsLoading = false;
            renderNewsBar();
            newsFetchPromise = null;
        });

    return newsFetchPromise;
}

function setupNewsResizer() {
    const resizer = $('news-resizer');
    const bar = $('news-bar');
    if (!resizer || !bar || resizer.dataset.bound) return;

    resizer.dataset.bound = 'true';

    if (!state.newsResizeListenerBound) {
        state.newsResizeListenerBound = true;
        window.addEventListener('resize', handleWindowResize);
    }

    const startResize = event => {
        if (state.newsCollapsed) return;

        const startY = getClientYFromEvent(event);
        if (startY === null) return;

        if (event.cancelable) {
            event.preventDefault();
        }

        captureInitialNewsBarHeight();

        const startHeight = state.newsBarHeight ?? bar.getBoundingClientRect().height;
        const minHeight = NEWS_MIN_HEIGHT;
        const maxHeight = getNewsMaxHeight();
        const previousUserSelect = document.body.style.userSelect;

        state.newsResizeActive = true;
        bar.classList.add('news-bar--resizing');
        document.body.classList.add('news-bar-resize-active');
        document.body.style.userSelect = 'none';

        const handleMove = moveEvent => {
            if (!state.newsResizeActive) return;

            const currentY = getClientYFromEvent(moveEvent);
            if (currentY === null) return;
            if (moveEvent.cancelable) {
                moveEvent.preventDefault();
            }

            let nextHeight = startHeight + (startY - currentY);
            if (Number.isNaN(nextHeight)) return;
            nextHeight = Math.max(minHeight, Math.min(maxHeight, nextHeight));
            state.newsBarHeight = nextHeight;
            applyNewsBarHeight(bar);
        };

        const endResize = endEvent => {
            if (!state.newsResizeActive) return;
            if (endEvent?.cancelable) {
                endEvent.preventDefault();
            }

            state.newsResizeActive = false;
            bar.classList.remove('news-bar--resizing');
            document.body.classList.remove('news-bar-resize-active');
            document.body.style.userSelect = previousUserSelect || '';

            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', endResize);
            window.removeEventListener('touchmove', handleMove, TOUCH_MOVE_OPTIONS);
            window.removeEventListener('touchend', endResize);
            window.removeEventListener('touchcancel', endResize);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', endResize);
        window.addEventListener('touchmove', handleMove, TOUCH_MOVE_OPTIONS);
        window.addEventListener('touchend', endResize);
        window.addEventListener('touchcancel', endResize);
    };

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, TOUCH_MOVE_OPTIONS);
}

function captureInitialNewsBarHeight() {
    if (state.newsCollapsed) return;
    const bar = $('news-bar');
    if (!bar) return;

    if (!state.newsBarHeight) {
        const measured = bar.getBoundingClientRect().height;
        if (measured > 0) {
            state.newsBarHeight = measured;
        }
    }

    applyNewsBarHeight(bar);
}

function getNewsMaxHeight() {
    const ratioLimit = window.innerHeight * NEWS_MAX_HEIGHT_RATIO;
    const safeLimit = window.innerHeight - NEWS_SAFE_MARGIN;
    return Math.max(NEWS_MIN_HEIGHT, Math.min(ratioLimit, safeLimit));
}

function applyNewsBarHeight(bar = $('news-bar')) {
    if (!bar) return;

    if (state.newsCollapsed) {
        bar.style.removeProperty('--news-bar-height');
        return;
    }

    const maxHeight = getNewsMaxHeight();
    let height = state.newsBarHeight ?? bar.getBoundingClientRect().height || NEWS_MIN_HEIGHT;
    height = Math.max(NEWS_MIN_HEIGHT, Math.min(maxHeight, height));
    state.newsBarHeight = height;
    bar.style.setProperty('--news-bar-height', `${Math.round(height)}px`);
}

function handleWindowResize() {
    if (!state.newsBarHeight || state.newsCollapsed) return;
    const bar = $('news-bar');
    if (!bar) return;

    const maxHeight = getNewsMaxHeight();
    if (state.newsBarHeight > maxHeight) {
        state.newsBarHeight = maxHeight;
        applyNewsBarHeight(bar);
    }
}

function getClientYFromEvent(event) {
    if (event?.touches?.length) {
        return event.touches[0].clientY;
    }
    if (event?.changedTouches?.length) {
        return event.changedTouches[0].clientY;
    }
    if (typeof event?.clientY === 'number') {
        return event.clientY;
    }
    return null;
}
