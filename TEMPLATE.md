# File map

| File | Purpose |
| --- | --- |
| `site/index.html` | Page content, links, citation and footer |
| `site/styles.css` | Layout and styling |
| `site/demo-player.js`, `site/demo-player.css` | YouTube player |
| `site/abstract-highlight.js` | Highlight player |
| `site/app.js` | Navigation and section interactions |
| `site/deployment.js` | Comparison players |
| `site/research-data.json`, `site/research.js`, `site/research.css` | Charts and expandable sections |
| `site/gap-study.js`, `site/gap-study.css` | Interactive illustration |
| `site/media-bootstrap.js`, `site/media-range-sw.js` | Media loading |
| `site/media/` | Media and manifests |
| `site/affiliations/`, `site/fonts/` | Logos and fonts |
| `.github/workflows/pages.yml` | GitHub Pages deployment |

Update `data-youtube-id` and both YouTube links in `site/index.html` together. Keep media paths relative and update manifests when replacing assets. Preview over HTTP and check desktop/mobile layouts before publishing.

Replace example text, data, media and branding with content you are authorized to publish. See [LICENSE](LICENSE) for scope.
