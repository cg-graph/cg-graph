import {GraphView} from './view.js';
import {Snapshot} from "./snapshot.js";
import {DataSlice} from "./dataslice.js";
import {color_scheme, venue_filter} from "./config.js";
import Color from "https://colorjs.io/dist/color.js";
import statsWorker from './workerInstance.js';

const sWorker = statsWorker
const snapshot = new Snapshot(document.getElementById("loading-popup"));
await snapshot.Initialize();
const dataslice = new DataSlice(snapshot);
const view = new GraphView(document.getElementById("view-area"));


let t0 = null, t1 = null;

function debug_timer_stop(label = null) {
    if (t0 && label) {
        t1 = Date.now();
        console.debug(`${t1 - t0}ms for ${label}.`);
        t0 = t1;
    } else {
        t0 = Date.now();
    }
}

view.AddTopology = (dataset) => {
    switch (viewRelationSelector.selectedIndex) {
        case 0:
            return TopologyAuthorToAuthor(dataset);
        case 1:
            return TopologyAuthorToPaper(dataset);
        default:
            console.error("Unrecognized view relation", viewRelationSelector.selectedIndex);
    }
    return dataset;
}

function TopologyAuthorToAuthor(dataset) {
    dataset.nodes = Object.values(dataset.author).sort((a, b) => a.id === b.id ? 0 : (a.id > b.id ? 1 : -1));
    dataset.links = Object.values(dataset.coauthor);
    return dataset;
}

function TopologyAuthorToPaper(dataset) {
    dataset.nodes = Object.values(dataset.author).concat(Object.values(dataset.publication));
    dataset.links = Object.values(dataset.author_of);
    dataset.links.forEach(link => {
        link.is_directed = true
    });
    return dataset;
}

view.AddGeometry = (dataset) => {
    console.log("IN ADD GEOMETRY", dataset)
    for (const node of dataset.nodes) {
        switch (node.type ?? "") {
            case "author":
                node.color = preferredColor(color_scheme.author);
                node.size = Math.max(1, node.publications.length ** 0.6);
                break;
            case "publication":
                if (color_scheme.venue[node.venue]) {
                    node.color = preferredColor(color_scheme.venue[node.venue].publication);
                } else {
                    node.color = preferredColor(color_scheme.publication);
                }
                node.size = 1;
        }
        const decay = decayToggle.checked && !(dataslice.SearchQuery() && dataslice.MatchesQuery(node.id));
        if (componentToggle.checked) {
            node.color = hueShift(node.color, (node.component ?? 0) + 1);
        }
        if (cliqueToggle.checked){
            node.color = hueShift(node.color, (node.clique ?? 0) + 1)
        }
        if (decay) {
            node.color = decayColor(node.color, node.activityScore);
        }
    }
    for (const link of dataset.links) {
        const decay = decayToggle.checked && !(dataslice.SearchQuery() && dataslice.MatchesQuery(link.id));
        link.color = preferredColor(color_scheme[link.type]);
        if (decay) {
            link.color = decayColor(link.color, link.activityScore);
        }
        switch (link.type ?? "") {
            case "coauthor":
                link.size = Math.max(1, link.publications.length ** 0.6);
                break;
            case "author_of":
            default:
                link.size = 1;
        }
    }
    dataset.nodes.sort((a, b) => a.activityScore - b.activityScore);
    dataset.links.sort((a, b) => a.activityScore - b.activityScore);
}

export function InitializeInterface() {
    for (const filter_name in venue_filter) {
        const option = document.createElement("option");
        option.innerText = filter_name;
        option.value = filter_name;
        option.selected = true;
        venueSelector.appendChild(option);
    }
    dataslice.Filter.Venue = venue_filter[venueSelector.children[venueSelector.selectedIndex].value];
    const changeEvent = new Event("change");
    const yearBounds = snapshot.RangeOfYears();
    const yearRange = {min: yearBounds.min, max: yearBounds.max};
    /*if(document.location.hash) {
        yearRange.min = parseInt(document.location.hash.substring(1, 5));
        yearRange.max = parseInt(document.location.hash.substring(5, 9));
        setTimeout(() => {
            SelectDatapoint(view.GraphData().author[document.location.hash.substring(9)], {clientX: 0, clientY: intervalSelector.getBoundingClientRect().bottom + 16})}, 500);
    } else {*/
        yearRange.min = Math.trunc(Math.random() * (yearBounds.max - yearBounds.min) + yearBounds.min);
        yearRange.max = Math.min(yearRange.min + Math.trunc(Math.random() * 20 - 10), yearBounds.max);
    //}
    intervalSelector.querySelectorAll("input[type=range]").forEach((range,i) => {
        range.min = yearBounds.min;
        range.max = yearBounds.max;
        range.value = (i === 1) ? yearRange.min : yearRange.max;
    });
    intervalSelector.dispatchEvent(changeEvent);
    view.RefitCanvas();
    setTimeout(view.RefocusCanvas.bind(view), 100);

    const keyStats = snapshot.ComputeKeyStats();
    let percent = 0.0125;
    let increment = setInterval(() => {
        percent += 0.0075;
        if (percent >= 1) {
            percent = 1;
            clearInterval(increment);
        }
        for (const key of Object.keys(keyStats)) {
            const val = typeof keyStats[key] === "string" ? keyStats[key] : Math.trunc(keyStats[key] * percent).toLocaleString();
            document.querySelectorAll(`.stat-${key}`)
                .forEach(dom => {
                    if(dom.classList.contains("stat-animated")) {
                        dom.innerText = val
                    } else {
                        dom.innerText = keyStats[key];
                    }
                });
        }
    }, 10);
}


document.querySelectorAll("#invalidate-cache").forEach(
    button => {
        button.addEventListener("click", () => {
            snapshot.Destroy();
            window.location.reload();
        })
    }
);

const viewRelationSelector = document.getElementById('view-relation');
const venueSelector = document.getElementById('venue-filter');
const decayToggle = document.querySelector('#decay-toggle');
const componentToggle = document.querySelector('#component-toggle');
const cliqueToggle = document.querySelector('#clique-toggle');

viewRelationSelector.addEventListener('change', () => {
    view.GraphData(dataslice.Data);
   
});
venueSelector.addEventListener('change', () => {
    dataslice.Filter.Venue = venue_filter[venueSelector.children[venueSelector.selectedIndex].value];
    view.GraphData(dataslice.Fetch());
})
decayToggle.addEventListener('change', () => {
    view.AddGeometry(view.GraphData())
})
componentToggle.addEventListener('change', () => {
    view.AddGeometry(view.GraphData())
})
cliqueToggle.addEventListener('change', () =>{
    view.AddGeometry(view.GraphData())
})


const intervalSelector = document.querySelector('#year-selector');
const intervalIndicator = document.querySelector('#current-selection');
const playPauseButton = document.querySelector('#animation-play-pause');
let autostep = false;
playPauseButton.addEventListener('click', (e) => {
    autostep = !autostep;
    e.target.value = autostep ? "Stop" : "Start";
})

intervalSelector.addEventListener('change', () => {
    const values = [...intervalSelector.querySelectorAll("input[type=range]")].map(i => parseInt(i.value));
    [dataslice.Filter.MinYear, dataslice.Filter.MaxYear] = [Math.min(...values), Math.max(...values)];
    intervalIndicator.innerText = `${dataslice.Filter.MinYear} - ${dataslice.Filter.MaxYear}`;
    dataslice.Fetch()
    const t1 = Date.now();
    view.GraphData(dataslice.Data);
    console.log("assembled in", (Date.now() - t1), "ms");
});

function stepYear() {
    if (!autostep) return;
    const markers = [...intervalSelector.querySelectorAll("input[type=range]")];
    if (markers.some(marker => marker.value === marker.max)) return;

    markers.forEach(i => {
        i.value = parseInt(i.value) + 1;
    });
    const changeEvent = new Event('change');
    intervalSelector.dispatchEvent(changeEvent);
}

setInterval(stepYear, 1500);

const queryInput = document.querySelector('#query-input');
const queryCount = document.querySelector('#search-result-count');

queryInput.parentNode.addEventListener("submit", HandleQuery.bind(null, true));

function HandleQuery(focus = true) {
    console.log(focus);
    dataslice.SearchQuery(queryInput.value ?? "");
    if (dataslice.SearchQuery() && dataslice.NumQueryResults() === 0) {
        queryCount.innerText = `Nothing found.`;
    } else {
        queryCount.innerText = ``;
    }
    if (focus && dataslice.NumQueryResults() > 0) {
        view.RefocusCanvas(500, Math.min(view.Graph.width(),view.Graph.height()) / 4, obj => dataslice.MatchesQuery(obj.id));
    }
}

view.OnDataChange((data) => {
    debug_timer_stop();
    dataslice.SearchQuery(queryInput.value);
    //have to manually "grab" data from output of the webworker
    dataslice.Data.components = data.components;
    dataslice.Data.num_components = data.num_components;
    dataslice.Data.stats = data;
    dataslice.Data.author = data.author;
    debug_timer_stop("search");
    HandleQuery(false);
    window.setTimeout(view.RefocusCanvas.bind(view), 100);
    debug_timer_stop("search");
    document.querySelector("#live-stat-authors").innerText = Object.keys(data.author ?? {}).length;
    document.querySelector("#live-stat-publications").innerText = Object.keys(data.publication ?? {}).length;
    document.querySelector("#live-stat-components").innerText = data.num_components ?? "?";
    console.log("NEW DATASLICE", dataslice)
});


let darkmode = window.matchMedia('(prefers-color-scheme: dark)').matches;
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    darkmode = event.matches;
    view.AddGeometry(view.GraphData());
});

function preferredColor(obj) {
    return darkmode ? obj.dark : obj.light;
}

function decayColor(color, strength) {
    if (darkmode) {
        return new Color(color).set({
            "lch.c": c => c * strength,
            "lch.l": l => Math.max(10, l * strength)
        }).toString();
    } else {
        return new Color(color).set({
            "hsl.s": c => c * (strength),
            "lch.l": l => Math.min(90, l * (2.0 - strength))
        }).toString();
    }
}

function hueShift(color, strength) {
    const shift = Math.floor((Math.abs(Math.sin(strength) * 16777215)))
    return new Color(color).set({
        "lch.h": h => h * shift
    }).toString();
}



const hovered = new Set();
view.OnNodeHover((node) => {
    hovered.clear();
    if (node) {
        for (const link of view.getGraphData().links) {
            if (link.source === node || link.target === node) {
                hovered.add(link.id);
            }
        }
    }
})
view.AddColorFilter((node, color) => {
    if (hovered.has(node.id)) {
        return "#00ffff";
    }
    return color;
});

view.AddColorFilter((node, color) => {
    if (dataslice.SearchQuery() && !dataslice.MatchesQuery(node.id)) {
        return new Color(color).set({
            "hsl.s": 0,
        }).toString();
    }
    return color;
})


const domDetailPopup = document.querySelector('#detail-popup');
const domDetailPopupContent = domDetailPopup.querySelector('#detail-popup-content');
const domDetailPopupTitle = domDetailPopup.querySelector('#detail-popup-title');
domDetailPopup.querySelector('#close-detail-popup').addEventListener('click', () => {
    domDetailPopup.style.display = 'none';
})
view.OnNodeClick(SelectDatapoint);
view.OnLinkClick(SelectDatapoint);
view.OnDataChange(SelectDatapoint.bind(null, null));

let dragPopupAtive = false;
const dragPopupOffset = {x: 0, y: 0};
function placePopupAtCursor(x,y) {
        const offset = domDetailPopup.parentElement.getBoundingClientRect();
        domDetailPopup.style.left = `${x + dragPopupOffset.x}px`;
        domDetailPopup.style.top = `${y - offset.top + dragPopupOffset.y}px`;
}
domDetailPopupTitle.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    event.preventDefault();    dragPopupAtive = true;
    dragPopupOffset.x = domDetailPopup.getBoundingClientRect().left - event.clientX;
    dragPopupOffset.y = domDetailPopup.getBoundingClientRect().top - event.clientY;
    domDetailPopup.style.removeProperty("right");
    domDetailPopup.style.removeProperty("top");
    placePopupAtCursor(event.clientX, event.clientY);
});
domDetailPopupTitle.addEventListener("mousedown", (event) => {

});
window.addEventListener("mouseup", () => {dragPopupAtive = false;});
window.addEventListener("mousemove", (event) => {
    if(dragPopupAtive) {
        placePopupAtCursor(event.clientX, event.clientY);
    }
});


function authorLink(author, dynamic = false) {
    const tag = document.createElement("a");
    tag.innerHTML = author.name.replaceAll(/ +/g, "&nbsp;");
    if (dynamic && dataslice.Data.author.hasOwnProperty(author.id)) {
        tag.onclick = SelectDatapoint.bind(null, dataslice.Data.author[author.id], null);
        tag.style.cursor = "pointer";
        tag.title = "go to node";
    } else {
        tag.target = "_blank";
        tag.title = "go to dblp";
        tag.href = `${Snapshot.DBLPMirror()}/pid/${author.id}`;
    }
    return tag;
}

function publicationLink(publication, dynamic = false) {
    if (dynamic && dataslice.Data.publication.hasOwnProperty(publication.id)) {
        const tag = document.createElement("a");
        tag.onclick = SelectDatapoint.bind(null, dataslice.Data.publication[publication.id], null);
        tag.innerHTML = publication.title;
        tag.style.cursor = "pointer";
        tag.title = "go to node";
        return tag;
    } else if (publication.hasOwnProperty("doi")) {
        const tag = document.createElement("a");
        tag.href = `https://doi.org/${publication.doi}`;
        tag.target = "_blank";
        tag.title = "follow doi";
        tag.innerHTML = publication.title;
        return tag;
    } else if (publication.hasOwnProperty("dblp_key")) {
        const tag = document.createElement("a");
        tag.href = `${Snapshot.DBLPMirror()}/rec/${publication.dblp_key}`;
        tag.target = "_blank";
        tag.title = "go to dblp";
        tag.innerHTML = publication.title;
        return tag;
    } else {
        const tag = document.createElement("span");
        tag.innerHTML = publication.title;
        return tag;
    }
}


function explainer(text, hovertext, href) {
    const node = document.createElement("a");
    node.innerText = text;
    node.classList.add("hover-for-explanation");
    node.title = hovertext;
    node.href = href;
    return node;
}

function coauthorIdFor(authorA, authorB) {
    if (authorA <= authorB) {
        return authorA + authorB;
    } else {
        return authorB + authorA;
    }
}

async function authorWidget(author) {
    domDetailPopupTitle.replaceChildren(authorLink(author));
    domDetailPopupContent.replaceChildren();
    if (author.affiliation) {
        const affiliationTag = document.createElement("i");
        affiliationTag.innerText = author.affiliation;
        domDetailPopupContent.appendChild(affiliationTag);
    }

    const loadingTag = document.createElement("p")
    loadingTag.innerText = "loading..."
    domDetailPopupContent.appendChild(loadingTag)
    // const data = view.statistics.getNodeData(author);
    console.log("INTERFACE-AUTHOR",author)
    const data = await sWorker.execute({
        "type":"node",
        "data": author
    })
    console.log(data)
    loadingTag.remove();

    const listProperties = domDetailPopupContent.appendChild(document.createElement("ul"));

    // const labelIsCut = listProperties.appendChild(document.createElement("li"));
    // labelIsCut.innerText = `Is ${data["is-cut"].data === true ? "" : "not"} a cut vertex in their co-author component.`;


    const labelComponentSize = listProperties.appendChild(document.createElement("li"));
    // 1. Get the component list safely
    const componentList = dataslice.Data.components?.[author.component];

    // 2. Only show the length if it exists, otherwise show a placeholder
    labelComponentSize.innerText = `Size of component: ${componentList ? componentList.length : "Updating..."}`;
    
    const labelEccentricity = listProperties.appendChild(document.createElement("li"));
    const explainEccentricity = explainer("?", "Eccentricity is the length of the longest shortest path from this vertex.", "https://en.wikipedia.org/wiki/Eccentricity_(graph_theory)");
    const explainRadius = explainer("?", "A graph's radius is the minimal eccentricity across its vertices.", "https://en.wikipedia.org/wiki/Radius_(graph_theory)");
    labelEccentricity.replaceChildren("Eccentricity", explainEccentricity, `: ${data.eccentricity.data} (component radius`, explainRadius, ` is ${data.comp_radius.data})`);

    const coauthorList = domDetailPopupContent.appendChild(document.createElement("details"));
    const coauthorLabel = coauthorList.appendChild(document.createElement("summary"));
    const numPapers = dataslice.CountPapersInVenue(author.id);
    coauthorLabel.innerText = `(Co-)author of ${numPapers} paper${numPapers > 1 ? "s" : ""} with ...`;

    const secondListProperties = coauthorList.appendChild(document.createElement("ul"));

    for (const coauthor of dataslice.CoauthorsInVenue(author.id)) {
        const coauthorTag = authorLink(coauthor.author, true);
        const coauthorId = coauthorIdFor(author.id, coauthor.author.id);
        if (dataslice.Data.coauthor.hasOwnProperty(coauthorId)) {
            coauthorTag.removeAttribute("href");
            coauthorTag.removeAttribute("target");
            coauthorTag.title = "go to link";
            coauthorTag.onclick = SelectDatapoint.bind(null, dataslice.Data.coauthor[coauthorId], null);
        }
        secondListProperties.appendChild(document.createElement("li")).replaceChildren(coauthorTag, ` (${coauthor.count})`);
    }
}

function publicationWidget(publication) {
    domDetailPopupTitle.replaceChildren(publicationLink(publication));
    const pubAt = document.createElement("span");
    pubAt.appendChild(document.createElement("i")).innerText = `published at ${publication.venue} ${publication.year}`;
    domDetailPopupContent.replaceChildren(pubAt)
    domDetailPopupContent.appendChild(document.createElement("br"));
    const authorList = domDetailPopupContent.appendChild(document.createElement("div"));
    authorList.style.textAlign = "justify";
    authorList.replaceChildren(
        "by ",
        ...publication.authors.flatMap((author, idx, arr) => {
            const nameTag = authorLink(view.GraphData().author[author], true);
            return [nameTag, idx < arr.length - 1 ? " and " : "."];
        })
    );
}

function coauthorWidget(author1, author2, publications) {
    if (typeof author1 === "string") author1 = dataslice.Data.author[author1];
    if (typeof author2 === "string") author2 = dataslice.Data.author[author2];
    try {
        domDetailPopupTitle.replaceChildren(authorLink(author1, true), " and ", authorLink(author2, true));
        const ul = document.createElement("ul");
        for (const publication of publications) {
            const li = document.createElement("li");
            li.replaceChildren(publicationLink(publication, true), ` (${publication.venue} ${publication.year})`)
            ul.appendChild(li);
        }
        domDetailPopupContent.replaceChildren(`Co-published ${publications.length} paper`, (publications.length > 1 ? "s " : " "), dataslice.Data.first_year !== dataslice.Data.last_year ? `between ${dataslice.Data.first_year} and ${dataslice.Data.last_year}` : `in ${dataslice.Data.first_year}`,  ul);
        const num_publications = dataslice.CountJointPapersInVenue(author1.id, author2.id);
        if (num_publications !== publications.length) {
            const fullList = domDetailPopupContent.appendChild(document.createElement("details"));
            const fullListSummary = fullList.appendChild(document.createElement("summary"));
            const all_publications = dataslice.JointPapersInVenue(author1.id, author2.id).filter((pub1) => !publications.some((pub2) => pub2.id === pub1.id));
            fullListSummary.innerText = `(${all_publications.length} further publication${all_publications.length > 1 ? "s" : ""} in dataset)`;
            const ul = fullList.appendChild(document.createElement("ul"));
            for (const publication of all_publications) {
                const li = document.createElement("li");
                li.replaceChildren(publicationLink(publication, true), ` (${publication.venue} ${publication.year})`)
                ul.appendChild(li);
            }
        }
    } catch (e) {
        console.error(author1, author2, publications);
        console.error(e);
    }
}

function SelectDatapoint(datapoint = null, event = null) {
    if (datapoint == null) {
        domDetailPopup.style.display = 'none';
        domDetailPopupContent.innerHTML = '';
    } else {
        const offset = domDetailPopup.parentElement.getBoundingClientRect();
        domDetailPopup.style.display = 'block';
        if (event) {
            if (event.clientX > window.innerWidth / 2) {
                domDetailPopup.style.right = window.innerWidth - (event.clientX - offset.left - 16) + 'px';
                domDetailPopup.style.removeProperty("left");
            } else {
                domDetailPopup.style.removeProperty("right");
                domDetailPopup.style.left = (event.clientX - offset.left + 16) + 'px';
            }
            domDetailPopup.style.top = (event.clientY - offset.top + 16) + 'px';
        }
        document.location.hash = `${String(dataslice.Filter.MinYear).padStart(4, '0')}${String(dataslice.Filter.MaxYear).padStart(4, '0')}${datapoint.id}`;
        switch (datapoint.type) {
            case 'author': {
                return authorWidget(datapoint);
            }
            case 'publication': {
                return publicationWidget(datapoint);
            }
            case 'coauthor': {
                return coauthorWidget(datapoint.source, datapoint.target, datapoint.publications.map(pub => dataslice.Data.publication[pub]));
            }
            case 'author_of': /* All relevant info is already in the hover tooltip. */
            default: {
                domDetailPopup.style.display = 'none';
            }
        }
    }
}

InitializeInterface();