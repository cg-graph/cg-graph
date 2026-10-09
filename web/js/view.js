import "./lib/force-graph.js";
import {DataSlice} from "./dataslice.js";
import {statistics} from "./statistics.js";
import statsWorker from "./workerInstance.js";


export class GraphView {
    
    Graph;
    #container;
    #graphContainer;
    
    statistics = new statistics();    
    
    #colorfilter = []
    
    #ondatachange = [];
    #onnodehover = [];
    #onlinkhover = [];
    #onnodeclick = [];
    #onlinkclick = [];

    constructor(container) {

        this.statsWorker = statsWorker;

        this.#container = container;
        this.#graphContainer = container.querySelector("#graph");
        this.Graph = new ForceGraph(this.#graphContainer);

        window.addEventListener("resize", this.RefitCanvas.bind(this));
        const domToggleSizeButton = document.querySelector('#toggle-view-size');
        domToggleSizeButton.addEventListener("click", this.#toggleContainerSize.bind(this));

        const domRecenterViewButton = document.querySelector('#recenter-view');
        domRecenterViewButton.addEventListener("click", this.RefocusCanvas.bind(this, 250, 30, (node) => true));

        this.Graph.linkLabel(this.#linkLabel.bind(this));
        this.Graph.nodeLabel(this.#nodeLabel.bind(this));
        this.Graph.linkColor(this.#linkColor.bind(this));
        this.Graph.nodeColor(this.#nodeColor.bind(this));
        this.Graph.linkDirectionalArrowLength(this.#linkArrow.bind(this));
        this.Graph.nodeVal(this.#nodeValue.bind(this));
        this.Graph.linkWidth(this.#linkValue.bind(this));
        this.Graph.autoPauseRedraw(false);

        this.Graph.d3AlphaDecay(0.01);
        this.Graph.d3Force("collide", d3.forceCollide(this.Graph.nodeRelSize()));

        this.Graph.d3Force("link", d3.forceLink(this.Graph.graphData().links).id(d => d.id));
        this.Graph.d3Force("charge", d3.forceManyBody());
        this.Graph.d3Force("x", d3.forceX());
        this.Graph.d3Force("y", d3.forceY());


        this.Graph.onNodeHover((node, prev) => {
            this.#onnodehover.forEach((callback) => callback(node, prev));
        })

        this.Graph.onLinkHover((node, prev) => {
            this.#onlinkhover.forEach((callback) => callback(node, prev));
        })

        this.Graph.onNodeClick((node, prev) => {
            this.#onnodeclick.forEach((callback) => callback(node, prev));
        })

        this.Graph.onLinkClick((link, prev) => {
            this.#onlinkclick.forEach((callback) => callback(link, prev));
        })

        this.Graph.onBackgroundClick((node, prev) => {
            this.#onnodeclick.forEach((callback) => callback(null, prev));
            this.#onlinkclick.forEach((callback) => callback(null, prev));
        })
      
    }

    AddTopology = (dataset) => {
        dataset.nodes = [];
        dataset.links = [];
        dataset._dummyTopology = true;
        return dataset;
    }

    AddGeometry = (dataset) => {
        dataset.nodes.forEach((node) => {
            node.color = undefined;
        });
        dataset.links.forEach((link) => {
            link.color = undefined;
            link.is_directed = undefined;
        });
        dataset._dummyGeometry = true;

        return dataset;
    }

    GraphData(view_data = undefined) {
        if (view_data) {
            this.asnycUpdate(view_data)
        }
        return this.Graph.graphData()
    }

    async asnycUpdate(view_data){

        const currentGraph = structuredClone(this.Graph.graphData());
        this.AddTopology(view_data);
        view_data = await this.statsWorker.execute({
            "type": "newGraph",
            "data": view_data
        });
        this.#ondatachange.forEach(callback => callback(view_data));
        this.AddGeometry(view_data);
        const maintain = ['x', 'y', 'vx', 'vy'];
        if (DataSlice.LooksLikeDataSet(currentGraph) && currentGraph.nodes) {
            for (const node of view_data.nodes) {
                const oldNode = currentGraph[node.type][node.id]
                if (!oldNode) continue;
                for (const prop of maintain) {
                    node[prop] = oldNode[prop];
                }
            }
        }
        this.Graph.graphData(view_data);

    }


    getGraphData(){
        return this.Graph.graphData() || { nodes: [], links: [] };
    }

    AddColorFilter(filter) {
        this.#colorfilter.push(filter);
    }

    OnDataChange(callback) {
        this.#ondatachange.push(callback);
    }

    OnNodeHover(callback) {
        this.#onnodehover.push(callback);
    }

    OnLinkHover(callback) {
        this.#onlinkhover.push(callback);
    }

    OnNodeClick(callback) {
        this.#onnodeclick.push(callback);
    }

    OnLinkClick(callback) {
        this.#onlinkclick.push(callback);
    }

    RefitCanvas() {
        const bbox = this.#graphContainer.getBoundingClientRect();
        this.Graph.width(bbox.width);
        this.Graph.height(bbox.height);
    }

    RefocusCanvas(transition_ms = 0, border_px = 30, filter = (node) => true) {
        if (DataSlice.LooksLikeDataSet(this.Graph.graphData())) {
            try {
                this.Graph.zoomToFit(transition_ms, border_px, filter);
            } catch (e) {
                console.error(e);
            }
        }
    }

    #toggleContainerSize() {
        if (this.#container.classList.contains('small')) {
            this.#container.classList.remove('small');
        } else {
            this.#container.classList.add('small');
        }
        this.RefitCanvas();
        window.setTimeout(this.RefocusCanvas.bind(this), 10);
    }

    #nodeColor(node) {
        let color = node.color ?? "#ff00ff"
        if (node.hasOwnProperty("color")) {
            color = this.#colorfilter.reduce((color, filter) => filter.bind(null, node)(color), color);
        }
        return color;
    }

    #linkColor(link) {
        let color = link.color ?? "#ff00ff"
        if (link.hasOwnProperty("color")) {
            color = this.#colorfilter.reduce((color, filter) => filter.bind(null, link)(color), color);
        }
        return color;
    }

    #linkArrow(link) {
        return (link.is_directed ?? false) === true ? 6 : 0;
    }

    #linkValue(link) {
        return link.size;
    }

    #nodeValue(node) {
        return node.size;
    }

    #nodeLabel(node) {
        try {
            switch (node.type ?? "") {
                case "author":
                    return node.name;
                case "publication":
                    return node.title;
                default:
                    return;
            }
        } catch (e) {
            console.error(e);
        }
    }

    #linkLabel(link) {
        try {
            switch (link.type ?? "") {
                case "author_of":
                    return `${link.source.name} ${link.target.authors.length > 1 ? 'co-wrote' : 'wrote'} '${link.target.title}'`;
                case "coauthor":
                    return `${link.source.name} and ${link.target.name}`;
                default:
                    return;
            }
        } catch (e) {
            console.error(e);
        }
    }


}
