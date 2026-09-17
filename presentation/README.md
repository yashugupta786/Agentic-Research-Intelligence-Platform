# Demand Sensing Intelligence

The presentation folder is the delivery bundle.

- **Demand-Sensing-Executive.pptx**: editable PowerPoint with speaker notes.
- **Demand-Sensing-Executive.pdf**: 22 fixed 16:9 pages with bookmarks, using the same slide renders as the app.
- **Speaker-Notes.md**: explanations, calculation details and implementation references for rehearsal.
- **slides/** and **manifest.json**: the reviewed slide images and navigation metadata.

In the app, choose **Slides** at the top right. Use the outline, arrow keys or slide selector. Fullscreen keeps the page proportions. **PowerPoint** and **Download PDF** download actual files without opening browser print settings.

Slides 1–18 form the complete presentation. Slides 19–22 provide dictionary mappings, centroids and the second LLM call, state contracts, and scoring edge cases. The viewer's **Presentation depth** selector also offers an 11-slide **Executive overview**. Downloads contain all 22 slides.

The main presentation now shows the attention, freshness, usable-weight, coverage and gap equations with substituted values. It follows one illustrative governance topic: 5 articles from 4 domains, newest article 4 days ago, and two accepted research notes that are 500 days old. Attention is 0.6767, coverage is 0.145, gap is 0.5786, and the rule recommends refresh. The Topic Analyst slides separately explain the illustrative 12-article mapping example.

The worked scoring example is explicitly illustrative. Recorded run #9 is separate evidence: 23 articles, 9 topics and approximately 64 seconds with cached search results. The deck does not claim measured business impact or production accuracy.

## Updating the presentation

Authoring source: `scripts/build_executive_deck.mjs`. Use a new versioned PPTX output name when rebuilding, as validation preserves existing finals. Then render the finalized PPTX with `scripts/render_executive_deck.mjs` and package the app/PDF with `scripts/package_executive_deck.py`. The packaging script synchronizes `frontend/public/presentation/`.

The PDF and in-app images preserve the presentation layout. Edit text, tables and diagrams in PowerPoint or the authoring source, then regenerate the rendered assets together. Editing the PPTX alone does not automatically update the app.
