import Graph from 'https://cdn.skypack.dev/graphology';
import {pagerank} from 'https://cdn.skypack.dev/graphology-metrics/centrality/';
import closenessCentrality from "https://cdn.skypack.dev/graphology-metrics/centrality/closeness/";
import {countConnectedComponents, connectedComponents} from 'https://cdn.skypack.dev/graphology-components';
import {bfsFromNode} from 'https://cdn.skypack.dev/graphology-traversal';
import {subgraph} from 'https://cdn.skypack.dev/graphology-operators';
import {diameter, density} from 'https://cdn.skypack.dev/graphology-metrics/graph';
import {eccentricity} from 'https://cdn.skypack.dev/graphology-metrics/node';
import {inferType} from 'https://cdn.skypack.dev/graphology-utils';

export class statistics{

    constructor(){

        this.graph = new Graph({ type: "undirected"});
    }

    update(data){

        this.graph = new Graph({type: "undirected"})
        this.author_by_id = {};
        // 1. Add Nodes
        data.nodes.forEach(node => {
            this.graph.addNode(node.id, { ...node });
        });
        Object.entries(data.author).forEach((id, author) => {
            this.author_by_id[id] = author.name;
        })
        
        // 2. Add Edges
        data.links.forEach(link => {
            const source = typeof link.source === 'object' ? link.source.id : link.source;
            const target = typeof link.target === 'object' ? link.target.id : link.target;
            
            if (!this.graph.hasEdge(source, target)) {
                this.graph.addUndirectedEdge(source, target, { ...link });
            }
        });
        
        // 3. compute stats, currently just have some basic ones for mvp
        this.pageranks = pagerank(this.graph);
        this.centrality = closenessCentrality(this.graph);

        this.components = connectedComponents(this.graph);
        this.components.sort((a, b) => {return a.length > b.length ? -1 : 1});
        for (let comp_id = 0; comp_id < this.components.length; comp_id++) {
            for(const node_id of this.components[comp_id]){
                data[this.graph.getNodeAttribute(node_id,"type")][node_id].component = comp_id;
            }
        }

        // This is meant as a temporary fix, but would it be reasonable to write all stats to the data block?
        console.log("DATA:",data)
        
        //4. compute aggregate statistics

        //component sizes
        this.average_comp_size = 0;
        this.average_comp_wo_singles = 0;
        this.num_singletons = 0;
        for (let comp_id in this.components){
            let comp = this.components[comp_id]
            let temp_size = comp.length
            this.average_comp_size += temp_size;
            if (temp_size == 1){
                this.num_singletons++;
            }
            else{
                this.average_comp_wo_singles += temp_size;
            }
        }
        this.average_comp_size = this.average_comp_size / this.components.length;
        this.average_comp_wo_singles = this.average_comp_wo_singles / (this.components.length - this.num_singletons);
        
        let half = Math.floor(this.components.length / 2)
        this.medianComponentSize = (this.components.length % 2
            ? this.components[half].length
            : (this.components[half - 1].length + this.components[half].length) / 2
        )
        //cliques 
        this.cliques = this.getMaximalCliques(this.graph).sort((a,b) => {return b.length - a.length})
        let sum = 0
        for (let clique in this.cliques){
            sum += clique.length;
        }
        this.average_clique = sum/this.cliques.length;
        this.max_clique = this.cliques[0];

        // looping from the end to the start so each node is colored by its largest clique
        // this.cliques is sorted by size
        for (let clique_id = this.cliques.length-1; clique_id >= 0; clique_id--) {
            for(const node_id of this.cliques[clique_id]){
                data[this.graph.getNodeAttribute(node_id,"type")][node_id].clique = clique_id;
            }
        }

        //authorship stats
        let publications = data.publication
        let numPubs = 0
        this.averageAuthors = 0
        this.averageAuthorsWOSingle = 0
        let authNums = [];
        let nonSingle = 0
        for (let pub in publications){
            let authors = publications[pub]["authors"];
            this.averageAuthors += authors.length;
            numPubs += 1
            authNums.push(authors.length)

            if(authors.length != 1){
                nonSingle += 1
                this.averageAuthorsWOSingle += authors.length;
            }
        }   
        this.averageAuthors = this.averageAuthors/numPubs
        this.averageAuthorsWOSingle = this.averageAuthorsWOSingle / nonSingle
        
        authNums = authNums.sort()
        half = Math.floor(authNums.length / 2)
        this.medianNumAuthors = (authNums.length % 2
            ? authNums[half]
            : (authNums[half - 1] + authNums[half]) / 2
        )

        //largest component stats
        this.largestCompSize = this.components[0].length;
        let largestCompAuthors = this.components[0];
        let paper_count = 0;
        for (let auth in largestCompAuthors){
            // console.log(auth, auth.indexOf("/"))
            if (largestCompAuthors[auth].indexOf("/") == -1){
                paper_count += 1
            }
        }
        // console.log("Largest Component", this.components[0])
        console.log("LARGEST Papers", paper_count)

        // console.log("CLIQUES:", this.getMaximalCliques(this.graph))
        
        this.stats = {
            "PagerankScores":this.pageranks,
            "closenessCentrality" : this.centrality,
            "cut vertices" : this.getCutVertices(this.graph),
            "NumComponents" : this.components.length,
            "AvgCompSize" : this.average_comp_size,
            "NumSingletons" : this.num_singletons,
            "cliques" : this.cliques,
            "numCliques" : this.cliques.length,
            "averageCliqueSize" : this.average_clique,
            "maxClique" : this.max_clique,
            "AverageNonSingleComponent" : this.average_comp_wo_singles,
            "medianComponentSize" : this.medianComponentSize,
            "avgAuthorsPerPaper" : this.averageAuthors,
            "avgAuthorsWOSingle" : this.averageAuthorsWOSingle,
            "medianNumAuthors" : this.medianNumAuthors
        }
        console.log("Graph Stats:", this.stats)

        //write stats to data
        data.num_components             = this.components.length;
        data.components                 = structuredClone(this.components);
        data.average_comp_size          = this.average_comp_size;
        data.num_singletons             = this.num_singletons;
        data.cliques                    = this.cliques;
        data.cliques_length             = this.cliques_length;
        data.average_clique             = this.average_clique;
        data.max_clique                 = this.max_clique;
        data.average_comp_wo_singles    = this.average_comp_wo_singles;
        data.medianComponentSize        = this.medianComponentSize;
        data.averageAuthorsPerPaper     = this.averageAuthors

        return data
    }

    id_to_name(id){
        let res = this.author_by_id[id]
        if (res === undefined){
            res = id
        }
        return res
    }

    getNodeData(input){

        const component = this.components[input.component];
        let graph_comp = subgraph(this.graph, component)
        let dens = density(graph_comp)
        let diam = diameter(graph_comp)
        let comp_pagerank = pagerank(graph_comp)
        console.log("Subgraph type", inferType(graph_comp))
        console.log("graph type", inferType(this.graph))
        console.log(eccentricity(graph_comp, graph_comp.nodes()[0]))
        let comp_radius = Math.min(...graph_comp.nodes().map((x) => eccentricity(graph_comp,x)))
        let node_ecc = eccentricity(graph_comp, input.id)
        
        
        var _me = this
        // console.log((graph_comp.nodes()))
        let comp_nodes = graph_comp.nodes().map((node) => {
            return _me.id_to_name(node)
        })
        let furthest_nbhrs = []
        bfsFromNode(graph_comp, input.id, function (node, attr, depth) {
            if(depth === node_ecc){
                furthest_nbhrs.push(_me.id_to_name(node))
            }
        });
        // console.log(furthest_nbhrs)

        let data = {
            "id" : {
                "display" : "DBLP-ID",
                "data" : input.id
            },
            "pagerank" : {
                "display" : "pagerank",
                "data" : this.pageranks[input.id],
            }, 
            "centrality" : {
                "display" : "centrality",
                "data" : this.centrality[input.id] 
            },
            "coauthor-component" : {
                "display" : "Connected Coauthors",
                "data" : comp_nodes
            },
            "coauthor-component-diameter" : {
                "display" : "Coauthor Component Diameter",
                "data" : diam
            },
            "coauthor-component-density" : {
                "display" : "Coauthor Component Density",
                "data" : dens
            },
            "component-pagerank" : {
                "display" : "Pageranks of Related Coauthors",
                "data" : comp_pagerank
            },
            "node-comp-pagerank" : {
                "display" : "Pagerank W.R.T. Related Coauthors",
                "data" : comp_pagerank[input.id] 
            },
            "is-cut" : {
                "display" : "Is a cut vertex",
                "data" : this.stats["cut vertices"].indexOf(input.id) !== -1
            },
            "comp_radius" : {
                "display" : "Radius of Related Coauthors",
                "data" : comp_radius,
            },
            "eccentricity" : {
                "display" : "Eccentricity",
                "data" : node_ecc
            },
            "furthest_nbhr" : {
                "display" : "Furthest Related Coauthor",
                "data" : furthest_nbhrs
            },
        }
        this.DEBUG_NODE_DATA(data)
        return data;
    }

    DEBUG_NODE_DATA(data){

        console.log("--------- NODE DEBUG -----------")
        console.log("Clicked on node with id", data["id"]);
        console.log("Pagerank :", data["pagerank"]);
        console.log("Centrality :", data["centrality"]);
        console.log("Coauthor Component :", data["coauthor-component"])
        console.log("Coauthor Component diameter :", data["coauthor-component-diameter"])
        console.log("Coauthor Component density :", data["coauthor-component-density"])
        console.log("Coauthor Component Pageranks :", data["component-pagerank"] )
        console.log("Pagerank of node in coauthor component :", data["node-pagerank"])
        console.log("Is cut vertex :", data["is-cut"])  
        console.log("Component Radius :", data["comp_radius"])
        console.log("Node eccentricity : ", data["eccentricity"])
        console.log("furthest neighbors : ", data["furthest_nbhr"])
        console.log("------- END NODE DEBUG ---------")
    
    }

        /**
     * Tarjan's algorithm for finding Articulation Points (Cut Vertices).
     * I was lazy and so this is google gemini's implementation
     */
    getCutVertices(graph) {
        const cutVertices = new Set();
        const discoveryTime = new Map();
        const lowLink = new Map();
        const parent = new Map();
        let time = 0;

        function find(u) {
            let children = 0;
            discoveryTime.set(u, time);
            lowLink.set(u, time);
            time++;

            graph.forEachNeighbor(u, v => {
                if (!discoveryTime.has(v)) {
                    children++;
                    parent.set(v, u);
                    find(v);

                    // Check if the subtree rooted at v has a back-edge
                    lowLink.set(u, Math.min(lowLink.get(u), lowLink.get(v)));

                    // Root condition: more than one child
                    if (!parent.has(u) && children > 1) cutVertices.add(u);

                    // Non-root condition: no back-edge from subtree
                    if (parent.has(u) && lowLink.get(v) >= discoveryTime.get(u)) {
                        cutVertices.add(u);
                    }
                } else if (v !== parent.get(u)) {
                    lowLink.set(u, Math.min(lowLink.get(u), discoveryTime.get(v)));
                }
            });
        }

        graph.forEachNode(node => {
            if (!discoveryTime.has(node)) find(node);
        });

        return Array.from(cutVertices);
    }

    //Another gemini implementation of an algorithm
    getMaximalCliques(graph) {
        const cliques = [];

        // Recursive helper function
        function bronKerbosch(R, P, X) {
            if (P.size === 0 && X.size === 0) {
            // Found a maximal clique
            cliques.push(Array.from(R));
            return;
            }

            const pArray = Array.from(P);
            
            for (const v of pArray) {
            const neighbors = new Set(graph.neighbors(v));

            // Recursive call:
            // R ∪ {v}
            // P ∩ neighbors(v)
            // X ∩ neighbors(v)
            bronKerbosch(
                new Set([...R, v]),
                new Set([...P].filter(node => neighbors.has(node))),
                new Set([...X].filter(node => neighbors.has(node)))
            );

            // Move v from P to X
            P.delete(v);
            X.add(v);
            }
        }

        // Initial call with all nodes in P
        const nodes = new Set(graph.nodes());
        bronKerbosch(new Set(), nodes, new Set());

        return cliques;
        }

}
