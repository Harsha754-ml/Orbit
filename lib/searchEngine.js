/**
 * Orbit Search Engine
 * Provides fuzzy-like scoring for command palette.
 */
class SearchEngine {
    score(query, target) {
        if (!query) return 1;
        query = query.toLowerCase();
        target = target.toLowerCase();

        if (query === target) return 2;
        if (target.startsWith(query)) return 1.5;
        if (target.includes(query)) return 1.0;

        // Simple fuzzy: check if chars appear in order
        let score = 0;
        let queryIdx = 0;
        for (let i = 0; i < target.length && queryIdx < query.length; i++) {
            if (target[i] === query[queryIdx]) {
                queryIdx++;
                score += (1 / (i + 1)); // Prefer earlier matches
            }
        }

        return queryIdx === query.length ? score : 0;
    }

    search(query, actions) {
        const results = actions.map(action => ({
            action,
            score: this.score(query, action.label)
        }))
        .filter(res => res.score > 0)
        .sort((a, b) => b.score - a.score);

        return results.map(res => res.action);
    }
}

module.exports = new SearchEngine();
