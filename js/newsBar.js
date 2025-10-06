const DUMMY_NEWS_ITEMS = [
    {
        id: 'news-1',
        firm: 'Apollo Global Management',
        headline: 'Apollo closes $12B global infrastructure fund for energy transition bets',
        summary: 'Latest flagship vehicle surpasses target with heavy appetite from sovereign LPs focused on renewables and data infrastructure.',
        source: 'Bloomberg',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        tags: ['Fund close', 'Deal activity'],
        url: '#'
    },
    {
        id: 'news-2',
        firm: 'KKR',
        headline: 'KKR-backed portfolio company finalizes $1.3B carve-out acquisition',
        summary: 'Buyout giant doubles down on software roll-up, integrating European engineering assets under unified platform.',
        source: 'Financial Times',
        publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
        tags: ['Add-on deal'],
        url: '#'
    },
    {
        id: 'news-3',
        firm: 'Silver Lake',
        headline: 'Silver Lake appoints co-head of value creation to lead global operating team',
        summary: 'Veteran operator steps into newly created role focused on driving cross-portfolio transformation initiatives.',
        source: 'PE Hub',
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['Leadership', 'Promotion'],
        url: '#'
    }
];

function initNewsBar() {
    state.newsItems = DUMMY_NEWS_ITEMS.map(item => ({ ...item }));
    const searchInput = $('news-search');
    if (searchInput) {
        searchInput.addEventListener('input', handleNewsSearch);
    }

    const toggleButton = $('news-toggle');
    if (toggleButton) {
        toggleButton.addEventListener('click', handleNewsToggle);
    }

    const listEl = $('news-list');
    if (listEl) {
        listEl.addEventListener('click', handleNewsListClick);
    }

    renderNewsBar();
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

    state.newsItems = state.newsItems.filter(item => item.id !== newsId);
    renderNewsBar();
}

function getVisibleNews() {
    if (!state.newsFilter) return state.newsItems;

    return state.newsItems.filter(item => {
        const haystack = [
            item.firm,
            item.headline,
            item.summary,
            (item.tags || []).join(' '),
            item.source
        ].join(' ').toLowerCase();

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
        toggleButton && (toggleButton.textContent = 'Maximize');
        toggleButton && toggleButton.setAttribute('aria-expanded', 'false');
    } else {
        bar.classList.remove('news-bar--collapsed');
        toggleButton && (toggleButton.textContent = 'Minimize');
        toggleButton && toggleButton.setAttribute('aria-expanded', 'true');
    }

    const visibleNews = getVisibleNews();

    if (countEl) {
        const count = visibleNews.length;
        countEl.textContent = count ? `${count} article${count === 1 ? '' : 's'}` : 'No articles';
    }

    if (!listEl) return;

    if (!visibleNews.length) {
        listEl.innerHTML = '<div class="news-empty">No articles match your search yet.</div>';
        return;
    }

    listEl.innerHTML = visibleNews
        .map(item => {
            const tagsLine = (item.tags || []).join(', ');
            const metaParts = [item.source, formatRelativeTime(item.publishedAt), tagsLine].filter(Boolean);
            const metaHtml = metaParts
                .map(part => `<span>${part}</span>`)
                .join('');

            return `
                <article class="news-card" data-news-id="${item.id}">
                    <div class="news-card__content">
                        <div class="news-card__firm">${item.firm}</div>
                        <div class="news-card__headline">${item.headline}</div>
                        <div class="news-card__summary">${item.summary}</div>
                        ${metaHtml ? `<div class="news-card__meta">${metaHtml}</div>` : ''}
                    </div>
                    <button class="news-card__delete" type="button" data-action="delete" data-news-id="${item.id}">Delete</button>
                </article>
            `;
        })
        .join('');
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

    if (diffMs < hour) {
        const minutes = Math.max(1, Math.round(diffMs / minute));
        return `${minutes}m ago`;
    }

    if (diffMs < day) {
        const hours = Math.round(diffMs / hour);
        return `${hours}h ago`;
    }

    const days = Math.round(diffMs / day);
    return `${days}d ago`;
}
