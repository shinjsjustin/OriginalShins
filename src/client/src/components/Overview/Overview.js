import React, { useCallback, useMemo } from 'react';
import Navbar from '../Navbar';
import ScriptureAxis from './ScriptureAxis';
import TierRails from './TierRails';
import TierStems from './TierStems';
import TierArcs from './TierArcs';
import TierToggles from './TierToggles';
import OverviewSearch from './OverviewSearch';
import ZoomBand from './ZoomBand';
import ArcTooltip from './ArcTooltip';
import TierDrawer from './TierDrawer';
import useBooks from '../Analyze/useBooks';
import useOverviewParams from './useOverviewParams';
import useOverviewData from './useOverviewData';
import usePanZoom from './usePanZoom';
import useArcInteraction from './useArcInteraction';
import useArcSearch from './useArcSearch';
import useZoomRegion, { isRegionGesture } from './useZoomRegion';
import { buildMatches } from './arcSearch';
import { buildAxisModel, indexForY } from './axisModel';
import { buildStems } from './stemModel';
import { buildArcs } from './arcModel';
import { buildLabels, nearestReference } from './tierLabels';
import { RAIL_X, TIER_KEYS, WORLD } from './overviewLayout';
import '../Styling/Overview.css';

// /overview — the whole canon on one axis.
//
// ── What is here, and what is deliberately not ─────────────────────────────
//
// 6a built the axis: a vertical scale from verse_index 1 to the last verse,
// book ticks with labels, chapter ticks that appear on zoom, and three empty
// rails. 6b added one horizontal stem per note reference. 6c chained each
// note's anchors into one arc on the notes rail, with a tooltip on hover and a
// drawer on click. 6d gives the ideas and topics rails the same two things —
// the same components, the same models, the same interaction, over the same
// references grouped by idea and by topic — plus the toggles that choose which
// rails are drawn and the ?topicId= filter that narrows all of them at once.
// 6e closes the phase with the plan's last two interactions: a box that dims
// every arc whose group is not called what the reader typed, and a shift-drag
// that flies the view to the stretch of canon it encloses.
//
// ── The two filters, and why there are two ─────────────────────────────────
//
// ?topicId= is structural and served: it asks the database what falls under
// one topic and every rail is restricted to that. ?q= is textual and local: it
// asks which groups the reader called something, over a payload already in
// hand. They compose because they narrow along different axes — "everything
// filed under Faith" and "everything I named covenant" are different questions
// and a reader may well want the intersection — and neither removes an arc
// from the drawing, because on a page whose entire content is WHERE things
// fall, a filtered-out arc takes the answer with it. See arcSearch.js.
//
// ── One renderer, three rails ──────────────────────────────────────────────
//
// Nothing below is written three times. The payload ships three tiers of the
// same shape, so the loop over `tiers` is the whole of what 6d added to the
// drawing: each rail gets a TierStems and a TierArcs, parameterised by its key
// — which chooses the x from RAIL_X and the colour from a CSS custom property
// keyed on `data-rail`. The one thing that must stay true across them is that
// a verse is at the same y on every rail, and it is true by construction: all
// three go through anchorPoints.js and the axis's own yForIndex.
//
// A note therefore appears three times over — once as itself, once under each
// idea it is linked to, once under each of those ideas' topics. That is the
// plan's table and the point of the picture, not duplication to be removed.
//
// ── Two requests, and what happens when one of them fails ──────────────────
//
// GET /api/books is the canon: the same response the Analyze page's picker
// grids use, static and cached for a year. buildAxisModel re-derives
// verse_index from the chapter verse counts it carries, so the axis needs no
// endpoint of its own. It is also what turns a reference tuple into "Romans
// 5:1–5" for the tooltip and the drawer.
//
// GET /api/overview is the reader's own anchors, precomputed and cached
// server-side. The two are not equal partners: without the canon there is no
// axis and therefore no page, but without the anchors there is an axis with
// nothing on it — which is also what a reader who has written no notes yet
// sees. So a failure to load the canon replaces the drawing, and a failure to
// load the anchors is reported beside a drawing that still works.
//
// A third request exists but is not the page's: the drawer fetches the one
// group it opens, because a body is the one field with no bound on its length
// and the payload above carries a few thousand groups. See useTierDetail.
//
// ── Why the <svg> has no width or height ───────────────────────────────────
//
// The diagram is drawn in a fixed 560 x 1000 world and the viewBox fits that
// world to whatever room the browser gives it. Resizing the window therefore
// changes nothing in the tree: no measurement, no re-render, no re-layout of
// 1,255 ticks. Pan and zoom sit on top of the same idea — see usePanZoom.
//
// ── What a pointer is allowed to cost ──────────────────────────────────────
//
// The highlight — one group's arcs and stems lit, everything else dimmed — is
// written onto the DOM by useArcInteraction and resolved in CSS, so it never
// reaches this component. Hovering does commit React once per group entered,
// for the tooltip's text, but every child below is memoised on props a pointer
// does not change, so that commit reaches the tooltip and nothing else.

const EMPTY_TIER = Object.freeze([]);

// The geometry and the labels for every rail asked for, in one memo per half.
//
// Keyed by rail and computed once per payload: the arcs of a few thousand
// groups are the most expensive thing this page does, and re-deriving them on
// a hover is precisely what the whole arrangement below exists to prevent.
const buildDrawing = (tiers, payload, totalVerses) => tiers.map(rail => ({
    rail,
    stems: buildStems(payload[rail] || EMPTY_TIER, totalVerses),
    arcs: buildArcs(payload[rail] || EMPTY_TIER, totalVerses, RAIL_X[rail]),
}));

const Overview = () => {
    const { tiers, topicId, query, toggleTier, clearTopic, setQuery } = useOverviewParams();
    const { books, isLoading, error } = useBooks();
    const { data, error: anchorsError } = useOverviewData(tiers, topicId);

    const model = useMemo(() => buildAxisModel(books), [books]);
    const totalVerses = model ? model.totalVerses : 0;

    // Every memo here is keyed on data that changes when a response lands or a
    // rail is toggled — never during a gesture. Pan and zoom do not re-render
    // this component at all, so none of them runs while the reader is moving.
    const drawing = useMemo(
        () => buildDrawing(tiers, data.tiers, totalVerses),
        [tiers, data.tiers, totalVerses]
    );

    const labels = useMemo(() => new Map(TIER_KEYS.map(rail =>
        [rail, buildLabels(data.labels[rail] || EMPTY_TIER, books, rail)]
    )), [data.labels, books]);

    // Which groups the reader's term names, per rail. Derived from the labels
    // the payload already carries, so a keystroke costs a substring test per
    // group and nothing on the wire — the request path is built from `tiers`
    // and `topicId` alone and does not move when this does.
    const matches = useMemo(() => buildMatches(labels, query), [labels, query]);

    const {
        attachSvg,
        attachScene,
        areChapterMarksVisible,
        reset,
        toFittedY,
        toWorldY,
        zoomToRange,
        panHandlers,
    } = usePanZoom();

    const {
        hover,
        selection,
        clearSelection,
        attachSvg: attachArcSvg,
        svgHandlers,
    } = useArcInteraction({ toWorldY });

    const { attachSvg: attachSearchSvg } = useArcSearch({ matches, drawing });

    const {
        attachSvg: attachRegionSvg,
        attachBand,
        regionHandlers,
    } = useZoomRegion({ toFittedY, toWorldY, onZoomToRange: zoomToRange });

    // Four hooks want the <svg> node — to listen for wheels and publish the
    // zoom, to scope the highlight queries to the drawing, to scope the search
    // marks to it, and to say a marquee is in progress — and an element takes
    // one ref, so they are composed here rather than any of them owning the
    // others.
    const attachOverviewSvg = useCallback((node) => {
        attachSvg(node);
        attachArcSvg(node);
        attachSearchSvg(node);
        attachRegionSvg(node);
    }, [attachSvg, attachArcSvg, attachSearchSvg, attachRegionSvg]);

    // ── Routing one pointerdown between three gestures ─────────────────────
    //
    // A press is a marquee, or the start of a pan and possibly of a click, and
    // it is exactly one of those. Deciding here rather than in the hooks is
    // what lets none of them know the others exist: usePanZoom has no idea a
    // region gesture is a thing, and useZoomRegion has no idea what a drawer
    // is. The modifier test lives with the gesture that owns it.
    //
    // A shift-press deliberately does not reach the arc hook either. A short
    // shift-drag would otherwise land inside the click slop and open a drawer
    // on top of the view it had just flown to.
    const { onPointerDown: startPan } = panHandlers;
    const { onPointerDown: recordPress } = svgHandlers;

    const handlePointerDown = useCallback((event) => {
        if (isRegionGesture(event)) {
            regionHandlers.start(event);
            return;
        }

        startPan(event);
        recordPress(event);
    }, [regionHandlers, startPan, recordPress]);

    // Move and release go to both: each hook already ignores a pointer it did
    // not claim, so there is nothing to decide a second time.
    const handlePointerMove = useCallback((event) => {
        regionHandlers.move(event);
        panHandlers.onPointerMove(event);
    }, [regionHandlers, panHandlers]);

    const handlePointerUp = useCallback((event) => {
        regionHandlers.end(event);
        panHandlers.onPointerUp(event);
    }, [regionHandlers, panHandlers]);

    // A cancelled pointer is not a released one: the band goes away and nothing
    // is flown to, because the reader never let go and so never said where.
    const handlePointerCancel = useCallback((event) => {
        regionHandlers.cancel(event);
        panHandlers.onPointerCancel(event);
    }, [regionHandlers, panHandlers]);

    // A group is (rail, id), so its label comes from that rail's own map: note
    // 7 and topic 7 are different things and one map keyed by id alone would
    // print the wrong one's title.
    const labelFor = (group) => {
        const byRail = group ? labels.get(group.rail) : null;
        return byRail ? byRail.get(group.groupId) || null : null;
    };

    const hoveredLabel = labelFor(hover);
    const selectedLabel = labelFor(selection);

    // Where on the chain the reader clicked, as a place in the canon, so the
    // drawer's link opens Analyze at the passage nearest the point pressed
    // rather than at whichever reference happens to be first. It earns most on
    // the upper rails, where a topic's chain can run the height of the canon.
    const selectedReference = selection && selection.worldY !== null
        ? nearestReference(selectedLabel, indexForY(selection.worldY, totalVerses))
        : nearestReference(selectedLabel, NaN);

    const anchorCount = drawing.reduce((total, tier) => total + tier.stems.length, 0);
    const chainCount = drawing.reduce((total, tier) => total + tier.arcs.length, 0);

    return (
        <div className="overview-page">
            <Navbar />

            <main className="overview-main">
                <header className="overview-header">
                    <h1 className="overview-title">Overview</h1>
                    <div className="overview-controls">
                        <TierToggles tiers={tiers} onToggle={toggleTier} />
                        <OverviewSearch
                            query={query}
                            matches={matches}
                            onQueryChange={setQuery}
                        />
                        {/* A modifier is invisible until someone says it is
                            there, so the hint is the whole of this gesture's
                            discoverability. */}
                        <p className="overview-hint">
                            Scroll to zoom · drag to pan · shift-drag to zoom to a range ·
                            hover an arc for what it gathers
                        </p>
                        {/* Fit all: the way back from any zoom, including one
                            a region drag flew to. Immediate rather than
                            animated — see usePanZoom. */}
                        <button type="button" className="overview-reset" onClick={reset}>
                            Reset view
                        </button>
                    </div>
                </header>

                {topicId !== null && (
                    <p className="overview-filter">
                        Showing one topic only.{' '}
                        <button type="button" className="overview-filter-clear" onClick={clearTopic}>
                            Show every topic
                        </button>
                    </p>
                )}

                {isLoading && <p className="overview-message">Loading the canon…</p>}

                {error && (
                    <p className="overview-message overview-message--error" role="alert">{error}</p>
                )}

                {!error && anchorsError && (
                    <p className="overview-message overview-message--error" role="alert">
                        {anchorsError} Your notes are not on the axis below.
                    </p>
                )}

                {!isLoading && !error && !model && (
                    <p className="overview-message" role="alert">
                        There is no scripture to plot yet.
                    </p>
                )}

                {model && (
                    <figure className="overview-figure">
                        <svg
                            ref={attachOverviewSvg}
                            data-testid="overview-svg"
                            className="overview-svg"
                            viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
                            preserveAspectRatio="xMidYMid meet"
                            role="img"
                            aria-label={
                                `The whole Bible on one axis: ${model.books.length} books over `
                                + `${model.totalVerses} verses, with ${anchorCount} anchors `
                                + `marked across the ${tiers.join(', ') || 'hidden'} `
                                + `${tiers.length === 1 ? 'rail' : 'rails'} and ${chainCount} `
                                + 'chains drawn between them.'
                            }
                            onPointerOver={svgHandlers.onPointerOver}
                            onPointerLeave={svgHandlers.onPointerLeave}
                            onClick={svgHandlers.onClick}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                        >
                            {/* The single transformed group. Its transform is
                                written by usePanZoom and is not a React prop —
                                that is what keeps a wheel gesture off the
                                render path entirely. */}
                            <g ref={attachScene} data-testid="overview-scene">
                                <ScriptureAxis
                                    model={model}
                                    areChapterMarksVisible={areChapterMarksVisible}
                                />
                                <TierRails tiers={tiers} />
                                {/* After the rails, so a stem is drawn over
                                    the rail it lands on rather than under it.
                                    Every rail's stems before any rail's arcs,
                                    so an arc is never buried under the stems
                                    of the tier outside it: the arcs are what
                                    the reader points at. */}
                                {drawing.map(tier => (
                                    <TierStems key={tier.rail} rail={tier.rail} stems={tier.stems} />
                                ))}
                                {drawing.map(tier => (
                                    <TierArcs key={tier.rail} rail={tier.rail} arcs={tier.arcs} />
                                ))}
                            </g>

                            {/* Outside the scene on purpose: the band reports
                                where the pointer has been, so it belongs in
                                the coordinates the pointer is in rather than
                                in the ones the diagram is drawn in. */}
                            <ZoomBand attach={attachBand} />
                        </svg>

                        <ArcTooltip hover={hover} label={hoveredLabel} />
                    </figure>
                )}
            </main>

            {selection && (
                <TierDrawer
                    rail={selection.rail}
                    groupId={selection.groupId}
                    label={selectedLabel}
                    nearestReference={selectedReference}
                    books={books}
                    onClose={clearSelection}
                />
            )}
        </div>
    );
};

export default Overview;
