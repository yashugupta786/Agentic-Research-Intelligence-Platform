# Demand Sensing Intelligence

The presentation folder is the delivery bundle.

- **Demand-Sensing-Executive.pptx**: editable PowerPoint with speaker notes.
- **Demand-Sensing-Executive.pdf**: 26 fixed 16:9 pages with bookmarks, using the same slide renders as the app.
- **Speaker-Notes.md**: explanations, calculation details and implementation references for rehearsal.
- **slides/** and **manifest.json**: the reviewed slide images and navigation metadata.

In the app, choose **Slides** at the top right. Use the outline, arrow keys or slide selector. Fullscreen keeps the page proportions. **PowerPoint** and **Download PDF** download actual files without opening browser print settings.

Slides 1–20 form the main presentation. Slides 21–26 provide agent contracts, topic mappings, centroids, coverage mathematics and failure behavior. For a shorter executive discussion, use 1–5, 10–13 and 16–20, then use the appendix for questions.

The worked scoring example is explicitly illustrative. Recorded run #9 is separate evidence: 23 articles, 9 topics and approximately 64 seconds with cached search results. The deck does not claim measured business impact or production accuracy.

## Updating the presentation

Authoring source: `scripts/build_executive_deck.mjs`. Use a new versioned PPTX output name when rebuilding, as validation preserves existing finals. Then render the finalized PPTX with `scripts/render_executive_deck.mjs` and package the app/PDF with `scripts/package_executive_deck.py`. The packaging script synchronizes `frontend/public/presentation/`.

The PDF and in-app images preserve the presentation layout. Edit text, tables and diagrams in PowerPoint or the authoring source, then regenerate the rendered assets together. Editing the PPTX alone does not automatically update the app.
