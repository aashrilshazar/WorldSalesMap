const NEWS_ENDPOINT = '/api/news';
const NEWS_REFRESH_MS = 15 * 60 * 1000;
const NEWS_LOADING_MESSAGE = 'Loading latest firm headlines…';
const NEWS_ERROR_INITIAL = 'Unable to load news headlines. Try again soon.';
const NEWS_ERROR_REFRESH = 'Unable to refresh news feed. Showing cached results.';

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
        countEl.textContent = 'Loading…';
        listEl.innerHTML = renderNewsStatus(NEWS_LOADING_MESSAGE, 'loading');
        return;
    }

    if (state.newsFilter && !visibleNews.length) {
        countEl.textContent = 'No matches';
    } else {
        const count = visibleNews.length;
        let label = count ? `${count} article${count === 1 ? '' : 's'}` : 'No articles';

        if (state.newsLoading && state.newsItems.length) {
            label += ' • refreshing…';
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
